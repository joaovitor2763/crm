import { AccessScope, type Db, PermissionAction, type Prisma } from "@crm/db";
import { ConflictException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { loadAccountConfiguration } from "./revenue-account-config";
import type { RevenueAccountAssociationInput } from "./revenue-accounts.contracts";

type TargetKind = "CONTACT" | "COMPANY" | "DEAL";
type Cardinality = "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_MANY";

export function relatedContactWhere(
	accessControl: AccessControlService,
	principal: EffectivePrincipal,
): Prisma.ContactWhereInput {
	if (
		accessControl.permission(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		) === AccessScope.NONE
	)
		return { id: { in: [] } };
	return accessControl.contactWhere(
		principal,
		CRM_RESOURCE.contacts,
		PermissionAction.READ,
	);
}

export function relatedCompanyWhere(
	accessControl: AccessControlService,
	principal: EffectivePrincipal,
): Prisma.CompanyWhereInput {
	if (
		accessControl.permission(
			principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
		) === AccessScope.NONE
	)
		return { id: { in: [] } };
	return accessControl.companyWhere(
		principal,
		CRM_RESOURCE.companies,
		PermissionAction.READ,
	);
}

export function relatedDealWhere(
	accessControl: AccessControlService,
	principal: EffectivePrincipal,
): Prisma.DealWhereInput {
	if (
		accessControl.permission(
			principal,
			CRM_RESOURCE.deals,
			PermissionAction.READ,
		) === AccessScope.NONE
	)
		return { id: { in: [] } };
	return accessControl.dealWhere(
		principal,
		CRM_RESOURCE.deals,
		PermissionAction.READ,
	);
}

export async function relationPolicy(db: Db, targetKind: TargetKind) {
	return (await loadAccountConfiguration(db)).relationPolicies.find(
		(relation) => relation.targetKind === targetKind,
	);
}

export async function assertTarget(
	accessControl: AccessControlService,
	targetKind: TargetKind,
	targetId: string,
	principal: EffectivePrincipal,
) {
	const resource =
		targetKind === "CONTACT"
			? CRM_RESOURCE.contacts
			: targetKind === "COMPANY"
				? CRM_RESOURCE.companies
				: CRM_RESOURCE.deals;
	await accessControl.assertRecord(
		principal,
		resource,
		PermissionAction.READ,
		targetId,
	);
}

export async function assertAccountRelationsInScope(
	db: Db,
	accessControl: AccessControlService,
	accountId: string,
	principal: EffectivePrincipal,
) {
	const [contacts, companies, deals] = await Promise.all([
		db.revenueAccountContact.findMany({
			where: { revenueAccountId: accountId, archivedAt: null },
			select: { contactId: true },
		}),
		db.revenueAccountCompany.findMany({
			where: { revenueAccountId: accountId, archivedAt: null },
			select: { companyId: true },
		}),
		db.revenueAccountDeal.findMany({
			where: { revenueAccountId: accountId, archivedAt: null },
			select: { dealId: true },
		}),
	]);
	await Promise.all([
		...contacts.map((relation) =>
			assertTarget(accessControl, "CONTACT", relation.contactId, principal),
		),
		...companies.map((relation) =>
			assertTarget(accessControl, "COMPANY", relation.companyId, principal),
		),
		...deals.map((relation) =>
			assertTarget(accessControl, "DEAL", relation.dealId, principal),
		),
	]);
}

export async function assertCardinality(
	db: Db,
	input: RevenueAccountAssociationInput,
	cardinality: Cardinality,
) {
	if (cardinality === "MANY_TO_MANY") return;
	const accountCount = await activeRelationCount(db, input.targetKind, {
		revenueAccountId: input.revenueAccountId,
	});
	if (cardinality === "ONE_TO_ONE" && accountCount > 0)
		throw new ConflictException(
			"This Conta already has a relation of that type.",
		);
	const targetCount = await activeRelationCount(db, input.targetKind, {
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

function activeRelationCount(
	db: Db,
	targetKind: TargetKind,
	key: { revenueAccountId?: string; targetId?: string },
) {
	const where = {
		...(key.revenueAccountId ? { revenueAccountId: key.revenueAccountId } : {}),
		...(key.targetId
			? { [`${targetKind.toLowerCase()}Id`]: key.targetId }
			: {}),
		archivedAt: null,
	};
	if (targetKind === "CONTACT")
		return db.revenueAccountContact.count({ where });
	if (targetKind === "COMPANY")
		return db.revenueAccountCompany.count({ where });
	return db.revenueAccountDeal.count({ where });
}

export async function relationCounts(db: Db, id: string) {
	const [contacts, companies, deals] = await Promise.all([
		db.revenueAccountContact.count({
			where: { revenueAccountId: id, archivedAt: null },
		}),
		db.revenueAccountCompany.count({
			where: { revenueAccountId: id, archivedAt: null },
		}),
		db.revenueAccountDeal.count({
			where: { revenueAccountId: id, archivedAt: null },
		}),
	]);
	return { contacts, companies, deals };
}

export async function transferRelations(
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
