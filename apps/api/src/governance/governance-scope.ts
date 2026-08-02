import { AccessScope, PermissionAction } from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import type { EffectivePrincipal } from "../access-control/access-control.types";

export type GovernanceUser = {
	id: string;
	access: {
		role: { isAdmin: boolean };
		primaryBusinessUnitId: string | null;
		primaryTeamId: string | null;
	} | null;
	businessUnitMemberships: Array<{ businessUnitId: string }>;
	teamMemberships: Array<{ teamId: string }>;
};

export function assertBusinessUnitInScope(
	principal: EffectivePrincipal,
	businessUnitId: string,
): void {
	const scope = effectiveScope(
		principal,
		CRM_RESOURCE.businessUnits,
		PermissionAction.MANAGE,
	);
	const allowed =
		scope === AccessScope.ALL ||
		(scope === AccessScope.BUSINESS_UNIT &&
			principal.businessUnitIds.includes(businessUnitId)) ||
		(scope === AccessScope.BUSINESS_UNIT_TREE &&
			principal.businessUnitTreeIds.includes(businessUnitId));
	if (!allowed) {
		throw new ForbiddenException(
			"That business unit is outside your permitted governance scope.",
		);
	}
}

export function assertTeamInScope(
	principal: EffectivePrincipal,
	team: { id: string; businessUnitId: string },
): void {
	const scope = effectiveScope(
		principal,
		CRM_RESOURCE.teams,
		PermissionAction.MANAGE,
	);
	const allowed =
		scope === AccessScope.ALL ||
		(scope === AccessScope.TEAM && principal.teamIds.includes(team.id)) ||
		(scope === AccessScope.MANAGED_TEAMS &&
			principal.managedTeamIds.includes(team.id)) ||
		(scope === AccessScope.BUSINESS_UNIT &&
			principal.businessUnitIds.includes(team.businessUnitId)) ||
		(scope === AccessScope.BUSINESS_UNIT_TREE &&
			principal.businessUnitTreeIds.includes(team.businessUnitId));
	if (!allowed) {
		throw new ForbiddenException(
			"That team is outside your permitted governance scope.",
		);
	}
}

export function assertCurrentUserInScope(
	principal: EffectivePrincipal,
	user: GovernanceUser,
	allowUnassigned = false,
): void {
	if (principal.isAdmin) return;
	if (user.access?.role.isAdmin) {
		throw new ForbiddenException(
			"A scoped administrator cannot manage a Global Admin.",
		);
	}
	if (
		!user.access &&
		allowUnassigned &&
		user.businessUnitMemberships.length === 0 &&
		user.teamMemberships.length === 0
	) {
		return;
	}
	if (!user.access && !allowUnassigned) {
		throw new ForbiddenException(
			"That user is outside your permitted governance scope.",
		);
	}

	const unitIds = unique([
		...user.businessUnitMemberships.map(
			(membership) => membership.businessUnitId,
		),
		...(user.access?.primaryBusinessUnitId
			? [user.access.primaryBusinessUnitId]
			: []),
	]);
	const teamIds = unique([
		...user.teamMemberships.map((membership) => membership.teamId),
		...(user.access?.primaryTeamId ? [user.access.primaryTeamId] : []),
	]);
	const userScope = effectiveScope(
		principal,
		CRM_RESOURCE.users,
		PermissionAction.MANAGE,
	);
	if (userScope === AccessScope.ALL) return;
	if (userScope === AccessScope.OWNED) {
		if (principal.userId === user.id) return;
		throw new ForbiddenException(
			"That user is outside your permitted governance scope.",
		);
	}
	const allowedUnitIds = businessUnitIdsForScope(principal, userScope);
	const allowedTeamIds = teamIdsForScope(principal, userScope, allowedUnitIds);
	const unitsWithinScope =
		allowedUnitIds !== null &&
		unitIds.every((id) => allowedUnitIds.includes(id));
	const teamsWithinScope =
		allowedTeamIds !== null &&
		teamIds.every((id) => allowedTeamIds.includes(id));
	const hasRelevantAssignment =
		userScope === AccessScope.TEAM || userScope === AccessScope.MANAGED_TEAMS
			? teamIds.length > 0
			: unitIds.length > 0 || teamIds.length > 0;
	if (!hasRelevantAssignment || !unitsWithinScope || !teamsWithinScope) {
		throw new ForbiddenException(
			"That user is outside your permitted governance scope.",
		);
	}
}

export function assertTeamBusinessUnitInScope(
	principal: EffectivePrincipal,
	businessUnitId: string,
): void {
	const scope = effectiveScope(
		principal,
		CRM_RESOURCE.teams,
		PermissionAction.MANAGE,
	);
	const allowed =
		scope === AccessScope.ALL ||
		(scope !== AccessScope.OWNED &&
			businessUnitIdsForScope(principal, scope)?.includes(businessUnitId));
	if (!allowed) {
		throw new ForbiddenException(
			"That business unit is outside your permitted team governance scope.",
		);
	}
}

export function assertRoleAssignable(
	principal: EffectivePrincipal,
	role: {
		isAdmin: boolean;
		permissions: Array<{
			resource: string;
			action: PermissionAction;
			scope: AccessScope;
		}>;
		fieldPermissions: Array<{
			fieldId: string;
			canRead: boolean;
			canUpdate: boolean;
		}>;
	},
): void {
	if (principal.isAdmin) return;
	if (role.isAdmin) {
		throw new ForbiddenException(
			"A scoped administrator cannot grant global administrator access.",
		);
	}
	for (const permission of role.permissions) {
		if (
			!scopeContains(
				effectiveScope(principal, permission.resource, permission.action),
				permission.scope,
			)
		) {
			throw new ForbiddenException(
				"That role grants a permission outside your effective scope.",
			);
		}
	}
	for (const actorField of principal.fieldPermissions) {
		const candidateField = role.fieldPermissions.find(
			(field) => field.fieldId === actorField.fieldId,
		);
		if (
			(actorField.canRead === false && candidateField?.canRead !== false) ||
			(actorField.canUpdate === false && candidateField?.canUpdate !== false)
		) {
			throw new ForbiddenException(
				"That role grants a field permission outside your effective scope.",
			);
		}
	}
}

export function effectiveScope(
	principal: EffectivePrincipal,
	resource: string,
	action: PermissionAction,
): AccessScope {
	if (principal.isAdmin) return AccessScope.ALL;
	return (
		principal.permissions.find(
			(permission) =>
				permission.resource === resource && permission.action === action,
		)?.scope ?? AccessScope.NONE
	);
}

export function businessUnitIdsForScope(
	principal: EffectivePrincipal,
	scope: AccessScope,
): string[] | null {
	if (scope === AccessScope.ALL) return null;
	if (scope === AccessScope.BUSINESS_UNIT) return principal.businessUnitIds;
	if (scope === AccessScope.BUSINESS_UNIT_TREE)
		return principal.businessUnitTreeIds;
	if (scope === AccessScope.OWNED) {
		return principal.primaryBusinessUnitId
			? [principal.primaryBusinessUnitId]
			: [];
	}
	const teamIds =
		scope === AccessScope.TEAM
			? principal.teamIds
			: scope === AccessScope.MANAGED_TEAMS
				? principal.managedTeamIds
				: [];
	return unique(
		principal.teamAssignments
			.filter((team) => teamIds.includes(team.teamId))
			.map((team) => team.businessUnitId),
	);
}

export function teamIdsForScope(
	principal: EffectivePrincipal,
	scope: AccessScope,
	unitIds: string[] | null,
): string[] | null {
	if (scope === AccessScope.NONE) return [];
	if (scope === AccessScope.ALL) return null;
	const candidateIds =
		scope === AccessScope.TEAM
			? principal.teamIds
			: scope === AccessScope.MANAGED_TEAMS
				? principal.managedTeamIds
				: scope === AccessScope.OWNED
					? principal.primaryTeamId
						? [principal.primaryTeamId]
						: []
					: principal.teamAssignments.map((team) => team.teamId);
	if (unitIds === null) return unique(candidateIds);
	return unique(
		principal.teamAssignments
			.filter(
				(team) =>
					candidateIds.includes(team.teamId) &&
					unitIds.includes(team.businessUnitId),
			)
			.map((team) => team.teamId),
	);
}

function scopeContains(
	actorScope: AccessScope,
	candidateScope: AccessScope,
): boolean {
	const allowed: Record<AccessScope, AccessScope[]> = {
		[AccessScope.NONE]: [AccessScope.NONE],
		[AccessScope.OWNED]: [AccessScope.NONE, AccessScope.OWNED],
		[AccessScope.TEAM]: [AccessScope.NONE, AccessScope.OWNED, AccessScope.TEAM],
		[AccessScope.MANAGED_TEAMS]: [
			AccessScope.NONE,
			AccessScope.OWNED,
			AccessScope.MANAGED_TEAMS,
		],
		[AccessScope.BUSINESS_UNIT]: [
			AccessScope.NONE,
			AccessScope.OWNED,
			AccessScope.TEAM,
			AccessScope.MANAGED_TEAMS,
			AccessScope.BUSINESS_UNIT,
		],
		[AccessScope.BUSINESS_UNIT_TREE]: [
			AccessScope.NONE,
			AccessScope.OWNED,
			AccessScope.TEAM,
			AccessScope.MANAGED_TEAMS,
			AccessScope.BUSINESS_UNIT,
			AccessScope.BUSINESS_UNIT_TREE,
		],
		[AccessScope.ALL]: Object.values(AccessScope),
	};
	return allowed[actorScope].includes(candidateScope);
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
