import { AccessScope, type Db, PermissionAction, type Prisma } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	CRM_RESOURCE,
	DEFAULT_BUSINESS_UNIT_ID,
} from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import { type ListResult, paginate } from "../trpc/list-input";
import { loadAccountConfiguration } from "./revenue-account-config";
import {
	writeAccountDomainEvent,
	writeAccountHistory,
	writeAccountLineage,
} from "./revenue-account-events";
import {
	mergeRevenueAccounts,
	previewRevenueAccountMerge,
} from "./revenue-account-merge";
import {
	ACCOUNT_SELECT,
	accountWhere,
	findDetailedAccount,
	readableAccountLineageIds,
	searchWhere,
	visibleAccount,
} from "./revenue-account-queries";
import {
	assertCardinality,
	assertTarget,
	relationPolicy,
} from "./revenue-account-relations";
import type {
	RevenueAccountAssociationInput,
	RevenueAccountConfigurationInput,
	RevenueAccountCreateInput,
	RevenueAccountListInput,
	RevenueAccountMergeInput,
	RevenueAccountMergePreviewInput,
	RevenueAccountUpdateArgs,
} from "./revenue-accounts.contracts";
import {
	accountAttributes,
	asJsonMap,
	changedKeys,
	normalizeMatch,
} from "./revenue-accounts.helpers";

@Injectable()
export class RevenueAccountsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(FieldsService)
		private readonly fields: FieldsService,
	) {}

	async configuration(principal: EffectivePrincipal) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.revenueAccounts,
			PermissionAction.READ,
		);
		return loadAccountConfiguration(this.db);
	}

	async updateConfiguration(
		input: RevenueAccountConfigurationInput,
		principal: EffectivePrincipal,
	) {
		const scope = this.accessControl.assert(
			principal,
			CRM_RESOURCE.revenueAccounts,
			PermissionAction.MANAGE,
		);
		if (scope !== AccessScope.ALL) {
			throw new ForbiddenException(
				"Only a global administrator can configure Conta.",
			);
		}
		const operationId = crypto.randomUUID();
		return this.db.$transaction(async (tx) => {
			const config = await tx.revenueAccountConfig.upsert({
				where: { id: "revenue-account-config" },
				create: {
					id: "revenue-account-config",
					enabled: input.enabled,
					mergePolicy: input.mergePolicy,
				},
				update: { enabled: input.enabled, mergePolicy: input.mergePolicy },
			});
			await tx.revenueAccountRelationPolicy.deleteMany({
				where: { configId: config.id },
			});
			await tx.revenueAccountRelationPolicy.createMany({
				data: input.relations.map((relation) => ({
					...relation,
					configId: config.id,
				})),
			});
			await writeAccountDomainEvent(
				tx,
				"revenue-account.configuration.updated",
				"revenue-account-config",
				operationId,
				principal,
				{ enabled: input.enabled },
			);
			return loadAccountConfiguration(tx);
		});
	}

	async list(
		input: RevenueAccountListInput,
		principal: EffectivePrincipal,
	): Promise<ListResult<unknown>> {
		const scope = accountWhere(
			this.accessControl,
			principal,
			PermissionAction.READ,
		);
		const where: Prisma.RevenueAccountWhereInput = {
			AND: [scope, { archivedAt: null }, searchWhere(input.q)],
		};
		const { skip, take } = paginate(input);
		const orderBy =
			input.sort === "name"
				? [{ name: input.dir }]
				: [{ createdAt: "desc" as const }];
		const [rows, total] = await Promise.all([
			this.db.revenueAccount.findMany({
				where,
				skip,
				take,
				orderBy,
				select: ACCOUNT_SELECT,
			}),
			this.db.revenueAccount.count({ where }),
		]);
		const projectedRows = await Promise.all(
			rows.map(async (row) => ({
				...row,
				customValues: await this.fields.projectChannelValues(
					"revenue-accounts",
					row.customValues,
					principal,
					"api",
				),
				createdAt: row.createdAt.toISOString(),
				updatedAt: row.updatedAt.toISOString(),
			})),
		);
		return {
			rows: projectedRows,
			total,
			facetCounts: {},
		};
	}

	async byId(id: string, principal: EffectivePrincipal) {
		const resolved = await visibleAccount(
			this.db,
			this.accessControl,
			id,
			principal,
			PermissionAction.READ,
		);
		const resolvedId = resolved.id;
		const account = await findDetailedAccount(
			this.db,
			this.accessControl,
			resolvedId,
			principal,
		);
		if (!account) throw new NotFoundException("Conta not found in your scope.");
		return {
			...account,
			...(resolvedId === id ? {} : { resolvedFromId: id }),
			customValues: await this.fields.projectChannelValues(
				"revenue-accounts",
				account.customValues,
				principal,
				"api",
			),
		};
	}

	/** Record services use this narrow projection to authorize ontology events. */
	async assertReadable(id: string, principal: EffectivePrincipal) {
		const account = await visibleAccount(
			this.db,
			this.accessControl,
			id,
			principal,
			PermissionAction.READ,
		);
		const lineageIds = await readableAccountLineageIds(
			this.db,
			this.accessControl,
			account.id,
			principal,
		);
		return {
			id: account.id,
			businessUnitId: account.businessUnitId,
			teamId: account.teamId,
			lineageIds,
		};
	}

	async create(
		input: RevenueAccountCreateInput,
		principal: EffectivePrincipal,
	) {
		await this.assertEnabled();
		const businessUnitId =
			input.businessUnitId ??
			principal.primaryBusinessUnitId ??
			DEFAULT_BUSINESS_UNIT_ID;
		const teamId =
			input.teamId === undefined ? principal.primaryTeamId : input.teamId;
		const ownerId =
			input.ownerId === undefined ? principal.userId : input.ownerId;
		await this.accessControl.assertAssignment(
			principal,
			CRM_RESOURCE.revenueAccounts,
			PermissionAction.CREATE,
			{ businessUnitId, teamId, ownerId },
		);
		const customValues = await this.fields.validateChannelValues(
			"revenue-accounts",
			businessUnitId,
			input.customValues,
			principal,
			"api",
		);
		const operationId = crypto.randomUUID();
		return this.db.$transaction(async (tx) => {
			const account = await tx.revenueAccount.create({
				data: {
					name: input.name,
					domain: input.domain ?? null,
					businessUnitId,
					teamId,
					ownerId,
					customValues,
				},
			});
			await writeAccountHistory(
				tx,
				account.id,
				operationId,
				{},
				accountAttributes(account),
				principal,
				"create",
			);
			await writeAccountLineage(
				tx,
				account.id,
				operationId,
				"CREATED",
				principal,
				{ fields: Object.keys(accountAttributes(account)) },
			);
			await writeAccountDomainEvent(
				tx,
				"revenue-account.created",
				account.id,
				operationId,
				principal,
				{},
				account.businessUnitId,
				account.teamId,
			);
			return account;
		});
	}

	async update(input: RevenueAccountUpdateArgs, principal: EffectivePrincipal) {
		await this.assertEnabled();
		const scope = accountWhere(
			this.accessControl,
			principal,
			PermissionAction.UPDATE,
		);
		const current = await this.db.revenueAccount.findFirst({
			where: { AND: [{ id: input.id }, scope] },
		});
		if (!current) throw new NotFoundException("Conta not found in your scope.");
		const data = input.data;
		const businessUnitId = data.businessUnitId ?? current.businessUnitId;
		const teamId = data.teamId === undefined ? current.teamId : data.teamId;
		const ownerId = data.ownerId === undefined ? current.ownerId : data.ownerId;
		await this.accessControl.assertAssignment(
			principal,
			CRM_RESOURCE.revenueAccounts,
			PermissionAction.UPDATE,
			{ businessUnitId, teamId, ownerId },
		);
		const customValues = data.customValues
			? {
					...asJsonMap(current.customValues),
					...(await this.fields.validateChannelValues(
						"revenue-accounts",
						businessUnitId,
						data.customValues,
						principal,
						"api",
					)),
				}
			: asJsonMap(current.customValues);
		const operationId = crypto.randomUUID();
		return this.db.$transaction(async (tx) => {
			const account = await tx.revenueAccount.update({
				where: { id: input.id },
				data: {
					name: data.name,
					domain: data.domain,
					businessUnitId,
					teamId,
					ownerId,
					customValues,
				},
			});
			await writeAccountHistory(
				tx,
				account.id,
				operationId,
				accountAttributes(current),
				accountAttributes(account),
				principal,
				"update",
			);
			await writeAccountLineage(
				tx,
				account.id,
				operationId,
				"UPDATED",
				principal,
				{
					fields: changedKeys(
						accountAttributes(current),
						accountAttributes(account),
					),
				},
			);
			await writeAccountDomainEvent(
				tx,
				"revenue-account.updated",
				account.id,
				operationId,
				principal,
				{
					fields: changedKeys(
						accountAttributes(current),
						accountAttributes(account),
					),
				},
				account.businessUnitId,
				account.teamId,
			);
			return account;
		});
	}

	async archive(id: string, principal: EffectivePrincipal) {
		const scope = accountWhere(
			this.accessControl,
			principal,
			PermissionAction.ARCHIVE,
		);
		const current = await this.db.revenueAccount.findFirst({
			where: { AND: [{ id, archivedAt: null }, scope] },
		});
		if (!current) throw new NotFoundException("Conta not found in your scope.");
		const operationId = crypto.randomUUID();
		return this.db.$transaction(async (tx) => {
			const account = await tx.revenueAccount.update({
				where: { id },
				data: { archivedAt: new Date() },
			});
			await writeAccountLineage(tx, id, operationId, "ARCHIVED", principal, {});
			await writeAccountDomainEvent(
				tx,
				"revenue-account.archived",
				id,
				operationId,
				principal,
				{},
				current.businessUnitId,
				current.teamId,
			);
			return account;
		});
	}

	async associate(
		input: RevenueAccountAssociationInput,
		principal: EffectivePrincipal,
	) {
		await this.assertEnabled();
		const account = await visibleAccount(
			this.db,
			this.accessControl,
			input.revenueAccountId,
			principal,
			PermissionAction.UPDATE,
		);
		const policy = await relationPolicy(this.db, input.targetKind);
		if (!policy?.attachEnabled)
			throw new ForbiddenException("This Conta relation is disabled.");
		await assertTarget(
			this.accessControl,
			input.targetKind,
			input.targetId,
			principal,
		);
		await assertCardinality(this.db, input, policy.cardinality);
		const operationId = crypto.randomUUID();
		return this.db.$transaction(async (tx) => {
			const data = {
				revenueAccountId: account.id,
				[`${input.targetKind.toLowerCase()}Id`]: input.targetId,
				attachedByType: principal.actorType,
				attachedById: principal.actorId,
				archivedAt: null,
			} as never;
			if (input.targetKind === "CONTACT")
				await tx.revenueAccountContact.upsert({
					where: {
						revenueAccountId_contactId: {
							revenueAccountId: account.id,
							contactId: input.targetId,
						},
					},
					create: data,
					update: {
						archivedAt: null,
						attachedByType: principal.actorType,
						attachedById: principal.actorId,
					},
				});
			if (input.targetKind === "COMPANY")
				await tx.revenueAccountCompany.upsert({
					where: {
						revenueAccountId_companyId: {
							revenueAccountId: account.id,
							companyId: input.targetId,
						},
					},
					create: data,
					update: {
						archivedAt: null,
						attachedByType: principal.actorType,
						attachedById: principal.actorId,
					},
				});
			if (input.targetKind === "DEAL")
				await tx.revenueAccountDeal.upsert({
					where: {
						revenueAccountId_dealId: {
							revenueAccountId: account.id,
							dealId: input.targetId,
						},
					},
					create: data,
					update: {
						archivedAt: null,
						attachedByType: principal.actorType,
						attachedById: principal.actorId,
					},
				});
			await writeAccountLineage(
				tx,
				account.id,
				operationId,
				"RELATION_ATTACHED",
				principal,
				{ targetKind: input.targetKind, targetId: input.targetId },
			);
			await writeAccountDomainEvent(
				tx,
				"revenue-account.relation.attached",
				account.id,
				operationId,
				principal,
				{ targetKind: input.targetKind, targetId: input.targetId },
				account.businessUnitId,
				account.teamId,
			);
			return {
				revenueAccountId: account.id,
				targetKind: input.targetKind,
				targetId: input.targetId,
			};
		});
	}

	async detach(
		input: RevenueAccountAssociationInput,
		principal: EffectivePrincipal,
	) {
		const account = await visibleAccount(
			this.db,
			this.accessControl,
			input.revenueAccountId,
			principal,
			PermissionAction.UPDATE,
		);
		const policy = await relationPolicy(this.db, input.targetKind);
		if (!policy?.detachEnabled)
			throw new ForbiddenException("This Conta relation is disabled.");
		const operationId = crypto.randomUUID();
		await this.db.$transaction(async (tx) => {
			if (input.targetKind === "CONTACT")
				await tx.revenueAccountContact.updateMany({
					where: {
						revenueAccountId: account.id,
						contactId: input.targetId,
						archivedAt: null,
					},
					data: { archivedAt: new Date() },
				});
			if (input.targetKind === "COMPANY")
				await tx.revenueAccountCompany.updateMany({
					where: {
						revenueAccountId: account.id,
						companyId: input.targetId,
						archivedAt: null,
					},
					data: { archivedAt: new Date() },
				});
			if (input.targetKind === "DEAL")
				await tx.revenueAccountDeal.updateMany({
					where: {
						revenueAccountId: account.id,
						dealId: input.targetId,
						archivedAt: null,
					},
					data: { archivedAt: new Date() },
				});
			await writeAccountLineage(
				tx,
				account.id,
				operationId,
				"RELATION_DETACHED",
				principal,
				{ targetKind: input.targetKind, targetId: input.targetId },
			);
			await writeAccountDomainEvent(
				tx,
				"revenue-account.relation.detached",
				account.id,
				operationId,
				principal,
				{ targetKind: input.targetKind, targetId: input.targetId },
				account.businessUnitId,
				account.teamId,
			);
		});
		return this.byId(account.id, principal);
	}

	async history(id: string, principal: EffectivePrincipal) {
		const account = await this.db.revenueAccount.findFirst({
			where: {
				AND: [
					{ id },
					accountWhere(this.accessControl, principal, PermissionAction.READ),
				],
			},
			select: { id: true },
		});
		if (!account) throw new NotFoundException("Conta not found in your scope.");
		return Promise.all([
			this.db.revenueAccountAttributeHistory.findMany({
				where: { revenueAccountId: id },
				orderBy: { changedAt: "desc" },
			}),
			this.db.revenueAccountLineageEvent.findMany({
				where: { revenueAccountId: id },
				orderBy: { createdAt: "desc" },
			}),
		]);
	}

	async mergeCandidates(q: string, principal: EffectivePrincipal) {
		const scope = accountWhere(
			this.accessControl,
			principal,
			PermissionAction.READ,
		);
		const query = normalizeMatch(q);
		const rows = await this.db.revenueAccount.findMany({
			where: { AND: [scope, { archivedAt: null, mergedIntoId: null }] },
			take: 100,
			select: ACCOUNT_SELECT,
			orderBy: { name: "asc" },
		});
		return rows
			.filter(
				(row) =>
					!query ||
					normalizeMatch(row.name).includes(query) ||
					normalizeMatch(row.domain).includes(query),
			)
			.map(({ customValues: _customValues, ...row }) => ({
				...row,
				reasons:
					query && normalizeMatch(row.name) === query ? ["name"] : ["domain"],
			}));
	}

	async mergePreview(
		input: RevenueAccountMergePreviewInput,
		principal: EffectivePrincipal,
	) {
		return previewRevenueAccountMerge(
			this.db,
			this.accessControl,
			this.fields,
			input,
			principal,
		);
	}

	async merge(input: RevenueAccountMergeInput, principal: EffectivePrincipal) {
		await this.assertEnabled();
		return mergeRevenueAccounts(
			this.db,
			this.accessControl,
			this.fields,
			input,
			principal,
		);
	}

	private async assertEnabled() {
		if (!(await loadAccountConfiguration(this.db)).enabled)
			throw new BadRequestException("Conta is disabled for this CRM.");
	}
}
