import { AccessScope, type Db, PermissionAction, type Prisma } from "@crm/db";
import { NotFoundException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import {
	relatedCompanyWhere,
	relatedContactWhere,
	relatedDealWhere,
} from "./revenue-account-relations";
export const ACCOUNT_SELECT = {
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

export function accountWhere(
	accessControl: AccessControlService,
	principal: EffectivePrincipal,
	action: PermissionAction,
): Prisma.RevenueAccountWhereInput {
	const scope = accessControl.assert(
		principal,
		CRM_RESOURCE.revenueAccounts,
		action,
	);
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED)
		return principal.userId
			? { ownerId: principal.userId }
			: { id: { in: [] } };
	if (scope === AccessScope.TEAM) return { teamId: { in: principal.teamIds } };
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

export async function visibleAccount(
	db: Db,
	accessControl: AccessControlService,
	id: string,
	principal: EffectivePrincipal,
	action: PermissionAction,
) {
	const scope = accountWhere(accessControl, principal, action);
	const initial = await db.revenueAccount.findFirst({
		where: { AND: [{ id }, scope] },
	});
	if (!initial) throw new NotFoundException("Conta not found in your scope.");
	let account = initial;
	const visited = new Set<string>();
	while (account.mergedIntoId && !visited.has(account.id)) {
		visited.add(account.id);
		if (visited.has(account.mergedIntoId)) break;
		const nextAccount = await db.revenueAccount.findFirst({
			where: { AND: [{ id: account.mergedIntoId }, scope] },
		});
		if (!nextAccount)
			throw new NotFoundException("Conta not found in your scope.");
		account = nextAccount;
	}
	if (account.archivedAt)
		throw new NotFoundException("Conta not found in your scope.");
	return account;
}

export async function readableAccountLineageIds(
	db: Db,
	accessControl: AccessControlService,
	id: string,
	principal: EffectivePrincipal,
) {
	const scope = accountWhere(accessControl, principal, PermissionAction.READ);
	const ids = new Set([id]);
	let frontier = [id];
	while (frontier.length > 0) {
		const sources = await db.revenueAccount.findMany({
			where: {
				AND: [scope, { mergedIntoId: { in: frontier } }],
			},
			select: { id: true },
		});
		frontier = sources
			.map((source) => source.id)
			.filter((sourceId) => !ids.has(sourceId));
		for (const sourceId of frontier) ids.add(sourceId);
	}
	return [...ids];
}

export async function findDetailedAccount(
	db: Db,
	accessControl: AccessControlService,
	resolvedId: string,
	principal: EffectivePrincipal,
) {
	return db.revenueAccount.findFirst({
		where: {
			AND: [
				{ id: resolvedId },
				accountWhere(accessControl, principal, PermissionAction.READ),
			],
		},
		include: {
			owner: { select: { id: true, name: true, email: true, image: true } },
			contacts: {
				where: {
					AND: [
						{ archivedAt: null },
						{ contact: { is: relatedContactWhere(accessControl, principal) } },
					],
				},
				include: {
					contact: {
						select: { id: true, firstName: true, lastName: true, email: true },
					},
				},
			},
			companies: {
				where: {
					AND: [
						{ archivedAt: null },
						{ company: { is: relatedCompanyWhere(accessControl, principal) } },
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
						{ deal: { is: relatedDealWhere(accessControl, principal) } },
					],
				},
				include: {
					deal: { select: { id: true, name: true, companyId: true } },
				},
			},
		},
	});
}

export function searchWhere(q: string): Prisma.RevenueAccountWhereInput {
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
