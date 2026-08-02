import { AccessScope, type Db, PermissionAction, type Prisma } from "@crm/db";
import {
	BadRequestException,
	ConflictException,
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
import {
	writeAccountDomainEvent,
	writeAccountHistory,
	writeAccountLineage,
} from "./revenue-account-events";
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
	mergeValues,
	normalizeMatch,
	splitAccountAttributes,
} from "./revenue-accounts.helpers";

const ACCOUNT_SELECT = {
	id: true,
	name: true,
	domain: true,
	businessUnitId: true,
	teamId: true,
	ownerId: true,
	customValues: true,
	archivedAt: true,
	mergedAt: true,
	mergedIntoId: true,
	createdAt: true,
	updatedAt: true,
	owner: { select: { id: true, name: true, email: true, image: true } },
	_count: { select: { contacts: true, companies: true, deals: true } },
} as const;

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
		return this.loadConfiguration();
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
			return this.loadConfiguration(tx);
		});
	}

	async list(
		input: RevenueAccountListInput,
		principal: EffectivePrincipal,
	): Promise<ListResult<unknown>> {
		const scope = this.accountWhere(principal, PermissionAction.READ);
		const where: Prisma.RevenueAccountWhereInput = {
			AND: [scope, { archivedAt: null }, this.searchWhere(input.q)],
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
		const resolution = await this.db.revenueAccount.findFirst({
			where: {
				AND: [{ id }, this.accountWhere(principal, PermissionAction.READ)],
			},
			select: { mergedIntoId: true },
		});
		if (!resolution)
			throw new NotFoundException("Conta not found in your scope.");
		const resolvedId = resolution.mergedIntoId ?? id;
		const account = await this.db.revenueAccount.findFirst({
			where: {
				AND: [
					{ id: resolvedId },
					this.accountWhere(principal, PermissionAction.READ),
				],
			},
			include: {
				owner: { select: { id: true, name: true, email: true, image: true } },
				contacts: {
					where: {
						AND: [
							{ archivedAt: null },
							{ contact: { is: this.relatedContactWhere(principal) } },
						],
					},
					include: {
						contact: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								email: true,
							},
						},
					},
				},
				companies: {
					where: {
						AND: [
							{ archivedAt: null },
							{ company: { is: this.relatedCompanyWhere(principal) } },
						],
					},
					include: {
						company: { select: { id: true, name: true, domain: true } },
					},
				},
				deals: {
					where: {
						AND: [
							{ archivedAt: null },
							{ deal: { is: this.relatedDealWhere(principal) } },
						],
					},
					include: {
						deal: { select: { id: true, name: true, companyId: true } },
					},
				},
			},
		});
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
		const scope = this.accountWhere(principal, PermissionAction.UPDATE);
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
		const scope = this.accountWhere(principal, PermissionAction.ARCHIVE);
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
		const account = await this.visibleAccount(
			input.revenueAccountId,
			principal,
			PermissionAction.UPDATE,
		);
		const policy = await this.policy(input.targetKind);
		if (!policy?.attachEnabled)
			throw new ForbiddenException("This Conta relation is disabled.");
		await this.assertTarget(input.targetKind, input.targetId, principal);
		await this.assertCardinality(input, policy.cardinality);
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
		const account = await this.visibleAccount(
			input.revenueAccountId,
			principal,
			PermissionAction.UPDATE,
		);
		const policy = await this.policy(input.targetKind);
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
				AND: [{ id }, this.accountWhere(principal, PermissionAction.READ)],
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
		const scope = this.accountWhere(principal, PermissionAction.READ);
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
		const [source, target] = await Promise.all([
			this.visibleAccount(
				input.sourceAccountId,
				principal,
				PermissionAction.UPDATE,
			),
			this.visibleAccount(
				input.targetAccountId,
				principal,
				PermissionAction.UPDATE,
			),
		]);
		if (source.id === target.id)
			throw new BadRequestException("A Conta cannot merge into itself.");
		await Promise.all([
			this.assertAccountRelationsInScope(source.id, principal),
			this.assertAccountRelationsInScope(target.id, principal),
		]);
		const [projectedSource, projectedTarget] = await Promise.all([
			this.fields.projectChannelValues(
				"revenue-accounts",
				source.customValues,
				principal,
				"api",
			),
			this.fields.projectChannelValues(
				"revenue-accounts",
				target.customValues,
				principal,
				"api",
			),
		]);
		const sourceAttributes = accountAttributes({
			...source,
			customValues: projectedSource,
		});
		const targetAttributes = accountAttributes({
			...target,
			customValues: projectedTarget,
		});
		const values = mergeValues(targetAttributes, sourceAttributes, {});
		return {
			source: { ...source, customValues: projectedSource },
			target: { ...target, customValues: projectedTarget },
			conflicts: values.conflicts,
			fieldGuide: changedKeys(targetAttributes, sourceAttributes).map(
				(fieldKey) => ({
					fieldKey,
					targetValue: targetAttributes[fieldKey],
					sourceValue: sourceAttributes[fieldKey],
					valueKind:
						Array.isArray(targetAttributes[fieldKey]) ||
						Array.isArray(sourceAttributes[fieldKey])
							? "LIST"
							: "SCALAR",
					requiresPolicy: values.conflicts.includes(fieldKey),
				}),
			),
			relationCounts: {
				source: await this.relationCounts(source.id),
				target: await this.relationCounts(target.id),
			},
			policy: (await this.loadConfiguration()).mergePolicy,
		};
	}

	async merge(input: RevenueAccountMergeInput, principal: EffectivePrincipal) {
		await this.assertEnabled();
		const [source, target] = await Promise.all([
			this.visibleAccount(
				input.sourceAccountId,
				principal,
				PermissionAction.UPDATE,
			),
			this.visibleAccount(
				input.targetAccountId,
				principal,
				PermissionAction.UPDATE,
			),
		]);
		if (source.id === target.id)
			throw new BadRequestException("A Conta cannot merge into itself.");
		await Promise.all([
			this.assertAccountRelationsInScope(source.id, principal),
			this.assertAccountRelationsInScope(target.id, principal),
		]);
		const configuredPolicy = (await this.loadConfiguration())
			.mergePolicy as Record<string, "TARGET" | "SOURCE" | "UNION" | "SKIP">;
		const fieldPolicies = { ...configuredPolicy, ...input.fieldPolicies };
		const merged = mergeValues(
			accountAttributes(target),
			accountAttributes(source),
			fieldPolicies,
		);
		if (merged.conflicts.length > 0)
			throw new BadRequestException(
				`Choose a merge policy for: ${merged.conflicts.join(", ")}.`,
			);
		const mergedAttributes = splitAccountAttributes(merged.values);
		const requestedCustomValues = Object.fromEntries(
			Object.keys(input.fieldPolicies)
				.filter((fieldKey) => !fieldKey.startsWith("system."))
				.map((fieldKey) => [
					fieldKey,
					merged.values[fieldKey] ??
						asJsonMap(target.customValues)[fieldKey] ??
						asJsonMap(source.customValues)[fieldKey],
				])
				.filter((entry) => entry[1] !== undefined),
		);
		await this.fields.validateChannelValues(
			"revenue-accounts",
			mergedAttributes.system.businessUnitId,
			requestedCustomValues,
			principal,
			"api",
		);
		await this.accessControl.assertAssignment(
			principal,
			CRM_RESOURCE.revenueAccounts,
			PermissionAction.UPDATE,
			mergedAttributes.system,
		);
		const operationId = input.operationId ?? crypto.randomUUID();
		return this.db.$transaction(async (tx) => {
			const updatedTarget = await tx.revenueAccount.update({
				where: { id: target.id },
				data: {
					...mergedAttributes.system,
					customValues: mergedAttributes.customValues,
				},
			});
			await this.transferRelations(tx, source.id, target.id, principal);
			await tx.revenueAccount.update({
				where: { id: source.id },
				data: {
					archivedAt: new Date(),
					mergedAt: new Date(),
					mergedIntoId: target.id,
				},
			});
			await tx.revenueAccountMerge.create({
				data: {
					sourceAccountId: source.id,
					targetAccountId: target.id,
					operationId,
					policy: fieldPolicies,
					executedByType: principal.actorType,
					executedById: principal.actorId,
				},
			});
			await writeAccountHistory(
				tx,
				target.id,
				operationId,
				accountAttributes(target),
				accountAttributes(updatedTarget),
				principal,
				"merge",
			);
			await writeAccountLineage(
				tx,
				target.id,
				operationId,
				"MERGED_IN",
				principal,
				{ sourceAccountId: source.id, fieldPolicies },
			);
			await writeAccountLineage(
				tx,
				source.id,
				operationId,
				"MERGED_OUT",
				principal,
				{ targetAccountId: target.id },
			);
			await writeAccountDomainEvent(
				tx,
				"revenue-account.merged",
				target.id,
				operationId,
				principal,
				{ sourceAccountId: source.id, targetAccountId: target.id },
				updatedTarget.businessUnitId,
				updatedTarget.teamId,
			);
			return {
				...updatedTarget,
				customValues: await this.fields.projectChannelValues(
					"revenue-accounts",
					updatedTarget.customValues,
					principal,
					"api",
				),
			};
		});
	}

	private async loadConfiguration(
		client: Db | Prisma.TransactionClient = this.db,
	) {
		const config = await client.revenueAccountConfig.findUnique({
			where: { id: "revenue-account-config" },
			include: { relationPolicies: { orderBy: { targetKind: "asc" } } },
		});
		return (
			config ?? {
				id: "revenue-account-config",
				enabled: false,
				mergePolicy: {},
				relationPolicies: [],
			}
		);
	}

	private async assertEnabled() {
		if (!(await this.loadConfiguration()).enabled)
			throw new BadRequestException("Conta is disabled for this CRM.");
	}

	private accountWhere(
		principal: EffectivePrincipal,
		action: PermissionAction,
	): Prisma.RevenueAccountWhereInput {
		const scope = this.accessControl.assert(
			principal,
			CRM_RESOURCE.revenueAccounts,
			action,
		);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED)
			return principal.userId
				? { ownerId: principal.userId }
				: { id: { in: [] } };
		if (scope === AccessScope.TEAM)
			return { teamId: { in: principal.teamIds } };
		if (scope === AccessScope.MANAGED_TEAMS)
			return { teamId: { in: principal.managedTeamIds } };
		return {
			businessUnitId: {
				in:
					scope === AccessScope.BUSINESS_UNIT_TREE
						? principal.businessUnitTreeIds
						: principal.businessUnitIds,
			},
		};
	}

	private async visibleAccount(
		id: string,
		principal: EffectivePrincipal,
		action: PermissionAction,
	) {
		const account = await this.db.revenueAccount.findFirst({
			where: {
				AND: [{ id, archivedAt: null }, this.accountWhere(principal, action)],
			},
		});
		if (!account) throw new NotFoundException("Conta not found in your scope.");
		return account;
	}

	private async policy(targetKind: "CONTACT" | "COMPANY" | "DEAL") {
		return (await this.loadConfiguration()).relationPolicies.find(
			(relation) => relation.targetKind === targetKind,
		);
	}

	private async assertTarget(
		targetKind: "CONTACT" | "COMPANY" | "DEAL",
		targetId: string,
		principal: EffectivePrincipal,
	) {
		const resource =
			targetKind === "CONTACT"
				? CRM_RESOURCE.contacts
				: targetKind === "COMPANY"
					? CRM_RESOURCE.companies
					: CRM_RESOURCE.deals;
		await this.accessControl.assertRecord(
			principal,
			resource,
			PermissionAction.READ,
			targetId,
		);
	}

	private relatedContactWhere(
		principal: EffectivePrincipal,
	): Prisma.ContactWhereInput {
		if (
			this.accessControl.permission(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			) === AccessScope.NONE
		)
			return { id: { in: [] } };
		return this.accessControl.contactWhere(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
	}

	private relatedCompanyWhere(
		principal: EffectivePrincipal,
	): Prisma.CompanyWhereInput {
		if (
			this.accessControl.permission(
				principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
			) === AccessScope.NONE
		)
			return { id: { in: [] } };
		return this.accessControl.companyWhere(
			principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
		);
	}

	private relatedDealWhere(
		principal: EffectivePrincipal,
	): Prisma.DealWhereInput {
		if (
			this.accessControl.permission(
				principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			) === AccessScope.NONE
		)
			return { id: { in: [] } };
		return this.accessControl.dealWhere(
			principal,
			CRM_RESOURCE.deals,
			PermissionAction.READ,
		);
	}

	private async assertAccountRelationsInScope(
		accountId: string,
		principal: EffectivePrincipal,
	) {
		const [contacts, companies, deals] = await Promise.all([
			this.db.revenueAccountContact.findMany({
				where: { revenueAccountId: accountId, archivedAt: null },
				select: { contactId: true },
			}),
			this.db.revenueAccountCompany.findMany({
				where: { revenueAccountId: accountId, archivedAt: null },
				select: { companyId: true },
			}),
			this.db.revenueAccountDeal.findMany({
				where: { revenueAccountId: accountId, archivedAt: null },
				select: { dealId: true },
			}),
		]);
		await Promise.all([
			...contacts.map((relation) =>
				this.assertTarget("CONTACT", relation.contactId, principal),
			),
			...companies.map((relation) =>
				this.assertTarget("COMPANY", relation.companyId, principal),
			),
			...deals.map((relation) =>
				this.assertTarget("DEAL", relation.dealId, principal),
			),
		]);
	}

	private async assertCardinality(
		input: RevenueAccountAssociationInput,
		cardinality: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY",
	) {
		if (cardinality === "MANY_TO_MANY") return;
		const accountCount = await this.activeRelationCount(input.targetKind, {
			revenueAccountId: input.revenueAccountId,
		});
		if (cardinality === "ONE_TO_ONE" && accountCount > 0)
			throw new ConflictException(
				"This Conta already has a relation of that type.",
			);
		const targetCount = await this.activeRelationCount(input.targetKind, {
			targetId: input.targetId,
		});
		if (
			targetCount > 0 &&
			(cardinality === "ONE_TO_ONE" || cardinality === "ONE_TO_MANY")
		)
			throw new ConflictException(
				"This record is already attached to another Conta.",
			);
	}

	private activeRelationCount(
		targetKind: "CONTACT" | "COMPANY" | "DEAL",
		key: { revenueAccountId?: string; targetId?: string },
	) {
		if (targetKind === "CONTACT")
			return this.db.revenueAccountContact.count({
				where: {
					...(key.revenueAccountId
						? { revenueAccountId: key.revenueAccountId }
						: {}),
					...(key.targetId ? { contactId: key.targetId } : {}),
					archivedAt: null,
				},
			});
		if (targetKind === "COMPANY")
			return this.db.revenueAccountCompany.count({
				where: {
					...(key.revenueAccountId
						? { revenueAccountId: key.revenueAccountId }
						: {}),
					...(key.targetId ? { companyId: key.targetId } : {}),
					archivedAt: null,
				},
			});
		return this.db.revenueAccountDeal.count({
			where: {
				...(key.revenueAccountId
					? { revenueAccountId: key.revenueAccountId }
					: {}),
				...(key.targetId ? { dealId: key.targetId } : {}),
				archivedAt: null,
			},
		});
	}

	private async relationCounts(id: string) {
		const [contacts, companies, deals] = await Promise.all([
			this.db.revenueAccountContact.count({
				where: { revenueAccountId: id, archivedAt: null },
			}),
			this.db.revenueAccountCompany.count({
				where: { revenueAccountId: id, archivedAt: null },
			}),
			this.db.revenueAccountDeal.count({
				where: { revenueAccountId: id, archivedAt: null },
			}),
		]);
		return { contacts, companies, deals };
	}

	private async transferRelations(
		tx: Prisma.TransactionClient,
		sourceId: string,
		targetId: string,
		principal: EffectivePrincipal,
	) {
		const [contacts, companies, deals] = await Promise.all([
			tx.revenueAccountContact.findMany({
				where: { revenueAccountId: sourceId, archivedAt: null },
			}),
			tx.revenueAccountCompany.findMany({
				where: { revenueAccountId: sourceId, archivedAt: null },
			}),
			tx.revenueAccountDeal.findMany({
				where: { revenueAccountId: sourceId, archivedAt: null },
			}),
		]);
		for (const relation of contacts)
			await tx.revenueAccountContact.upsert({
				where: {
					revenueAccountId_contactId: {
						revenueAccountId: targetId,
						contactId: relation.contactId,
					},
				},
				create: {
					...relation,
					revenueAccountId: targetId,
					attachedByType: principal.actorType,
					attachedById: principal.actorId,
					archivedAt: null,
				},
				update: { archivedAt: null },
			});
		for (const relation of companies)
			await tx.revenueAccountCompany.upsert({
				where: {
					revenueAccountId_companyId: {
						revenueAccountId: targetId,
						companyId: relation.companyId,
					},
				},
				create: {
					...relation,
					revenueAccountId: targetId,
					attachedByType: principal.actorType,
					attachedById: principal.actorId,
					archivedAt: null,
				},
				update: { archivedAt: null },
			});
		for (const relation of deals)
			await tx.revenueAccountDeal.upsert({
				where: {
					revenueAccountId_dealId: {
						revenueAccountId: targetId,
						dealId: relation.dealId,
					},
				},
				create: {
					...relation,
					revenueAccountId: targetId,
					attachedByType: principal.actorType,
					attachedById: principal.actorId,
					archivedAt: null,
				},
				update: { archivedAt: null },
			});
	}

	private searchWhere(q: string): Prisma.RevenueAccountWhereInput {
		const query = q.trim();
		return query
			? {
					OR: [
						{ name: { contains: query, mode: "insensitive" } },
						{ domain: { contains: query, mode: "insensitive" } },
					],
				}
			: {};
	}
}
