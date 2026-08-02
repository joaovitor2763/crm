import { AccessScope, type Prisma } from "@crm/db";
import type { EffectivePrincipal } from "../access-control/access-control.types";

export function scopedContactUnitStateWhere(
	principal: EffectivePrincipal,
	scope: AccessScope,
): Prisma.ContactBusinessUnitStateWhereInput {
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED) {
		return { ownerId: { in: principal.userId ? [principal.userId] : [] } };
	}
	if (scope === AccessScope.TEAM) {
		return { teamId: { in: principal.teamIds } };
	}
	if (scope === AccessScope.MANAGED_TEAMS) {
		return { teamId: { in: principal.managedTeamIds } };
	}
	return {
		businessUnitId: {
			in:
				scope === AccessScope.BUSINESS_UNIT_TREE
					? principal.businessUnitTreeIds
					: principal.businessUnitIds,
		},
	};
}
