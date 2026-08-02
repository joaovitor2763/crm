import { AccessScope, db, type PermissionAction, type Prisma } from "@crm/db";

type EveContext = {
	session: {
		auth: {
			current?: {
				authenticator?: string;
				principalId?: string;
				principalType?: string;
			} | null;
		};
	};
};

export type AgentAccess = {
	isSystem: boolean;
	userId: string | null;
	contactWhere: Prisma.ContactWhereInput;
	companyWhere: Prisma.CompanyWhereInput;
	dealWhere: Prisma.DealWhereInput;
	activityWhere: Prisma.ActivityWhereInput;
};

/**
 * Resolve authorization inside every tool execution. Eve approval is a human
 * interaction gate, not an authorization boundary, so tools re-check the
 * current caller at execution time and default to deny for unknown users.
 */
export async function crmAccess(
	ctx: EveContext,
	action: PermissionAction,
	requiredResource?: "contacts" | "companies" | "deals",
): Promise<AgentAccess> {
	const auth = ctx.session.auth.current;
	if (auth?.principalType !== "user") {
		if (
			auth?.principalId === "eve:app" ||
			auth?.authenticator === "local-dev" ||
			auth?.authenticator === "vercel-oidc"
		) {
			return {
				isSystem: true,
				userId: null,
				contactWhere: {},
				companyWhere: {},
				dealWhere: {},
				activityWhere: {},
			};
		}
		throw new Error("An authenticated CRM identity is required.");
	}
	const userId = auth.principalId;
	if (!userId) throw new Error("The CRM user identity is missing.");
	const access = await db.userAccess.findUnique({
		where: { userId },
		include: {
			role: { include: { permissions: true } },
			user: {
				select: {
					businessUnitMemberships: { select: { businessUnitId: true } },
					teamMemberships: { select: { teamId: true, isLead: true } },
				},
			},
		},
	});
	if (access?.status !== "ACTIVE") {
		throw new Error("This CRM user has no active access profile.");
	}
	if (access.role.isAdmin) {
		return {
			isSystem: false,
			userId,
			contactWhere: {},
			companyWhere: {},
			dealWhere: {},
			activityWhere: {},
		};
	}
	const permissions = new Map(
		access.role.permissions
			.filter((permission) => permission.action === action)
			.map((permission) => [permission.resource, permission.scope]),
	);
	const unitIds = unique([
		...access.user.businessUnitMemberships.map(
			(membership) => membership.businessUnitId,
		),
		...(access.primaryBusinessUnitId ? [access.primaryBusinessUnitId] : []),
	]);
	const tree = await db.businessUnitClosure.findMany({
		where: { ancestorId: { in: unitIds } },
		select: { descendantId: true },
	});
	const treeIds = unique([
		...unitIds,
		...tree.map((path) => path.descendantId),
	]);
	const teamIds = unique([
		...access.user.teamMemberships.map((membership) => membership.teamId),
		...(access.primaryTeamId ? [access.primaryTeamId] : []),
	]);
	const managedTeams = await db.team.findMany({
		where: {
			OR: [
				{ leaderId: userId },
				{ memberships: { some: { userId, isLead: true } } },
			],
		},
		select: { id: true },
	});
	const managedTeamIds = managedTeams.map((team) => team.id);
	if (
		requiredResource &&
		(permissions.get(requiredResource) ?? AccessScope.NONE) === AccessScope.NONE
	) {
		throw new Error(
			`Your CRM role cannot ${action.toLowerCase()} ${requiredResource}.`,
		);
	}

	return {
		isSystem: false,
		userId,
		contactWhere: contactWhere(
			userId,
			permissions.get("contacts") ?? AccessScope.NONE,
			unitIds,
			treeIds,
			teamIds,
			managedTeamIds,
		),
		companyWhere: companyWhere(
			userId,
			permissions.get("companies") ?? AccessScope.NONE,
			unitIds,
			treeIds,
			teamIds,
			managedTeamIds,
		),
		dealWhere: dealWhere(
			userId,
			permissions.get("deals") ?? AccessScope.NONE,
			unitIds,
			treeIds,
			teamIds,
			managedTeamIds,
		),
		activityWhere: activityWhere(
			userId,
			permissions.get("activities") ?? AccessScope.NONE,
			unitIds,
			treeIds,
			teamIds,
			managedTeamIds,
		),
	};
}

export async function assertContact(
	ctx: EveContext,
	contactId: string,
	action: PermissionAction,
) {
	const access = await crmAccess(ctx, action, "contacts");
	const record = await db.contact.findFirst({
		where: { AND: [{ id: contactId }, access.contactWhere] },
		select: { id: true },
	});
	if (!record) throw new Error("Contact not found or outside your CRM scope.");
	return access;
}

export async function assertCompany(
	ctx: EveContext,
	companyId: string,
	action: PermissionAction,
) {
	const access = await crmAccess(ctx, action, "companies");
	const record = await db.company.findFirst({
		where: { AND: [{ id: companyId }, access.companyWhere] },
		select: { id: true },
	});
	if (!record) throw new Error("Company not found or outside your CRM scope.");
	return access;
}

export async function assertDeal(
	ctx: EveContext,
	dealId: string,
	action: PermissionAction,
) {
	const access = await crmAccess(ctx, action, "deals");
	const record = await db.deal.findFirst({
		where: { AND: [{ id: dealId }, access.dealWhere] },
		select: { id: true },
	});
	if (!record) throw new Error("Deal not found or outside your CRM scope.");
	return access;
}

function contactWhere(
	userId: string,
	scope: AccessScope,
	unitIds: string[],
	treeIds: string[],
	teamIds: string[],
	managedTeamIds: string[],
): Prisma.ContactWhereInput {
	if (scope === AccessScope.NONE) return { id: "__denied__" };
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED) {
		return {
			OR: [{ ownerId: userId }, { unitStates: { some: { ownerId: userId } } }],
		};
	}
	return {
		unitStates: {
			some: unitStateWhere(scope, unitIds, treeIds, teamIds, managedTeamIds),
		},
	};
}

function companyWhere(
	userId: string,
	scope: AccessScope,
	unitIds: string[],
	treeIds: string[],
	teamIds: string[],
	managedTeamIds: string[],
): Prisma.CompanyWhereInput {
	if (scope === AccessScope.NONE) return { id: "__denied__" };
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED) {
		return {
			OR: [{ ownerId: userId }, { unitStates: { some: { ownerId: userId } } }],
		};
	}
	return {
		unitStates: {
			some: unitStateWhere(scope, unitIds, treeIds, teamIds, managedTeamIds),
		},
	};
}

function dealWhere(
	userId: string,
	scope: AccessScope,
	unitIds: string[],
	treeIds: string[],
	teamIds: string[],
	managedTeamIds: string[],
): Prisma.DealWhereInput {
	if (scope === AccessScope.NONE) return { id: "__denied__" };
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED) return { ownerId: userId };
	if (scope === AccessScope.TEAM) return { teamId: { in: teamIds } };
	if (scope === AccessScope.MANAGED_TEAMS) {
		return { teamId: { in: managedTeamIds } };
	}
	return {
		businessUnitId: {
			in: scope === AccessScope.BUSINESS_UNIT_TREE ? treeIds : unitIds,
		},
	};
}

function activityWhere(
	userId: string,
	scope: AccessScope,
	unitIds: string[],
	treeIds: string[],
	teamIds: string[],
	managedTeamIds: string[],
): Prisma.ActivityWhereInput {
	if (scope === AccessScope.NONE) return { id: "__denied__" };
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED) return { createdById: userId };
	if (scope === AccessScope.TEAM) return { teamId: { in: teamIds } };
	if (scope === AccessScope.MANAGED_TEAMS) {
		return { teamId: { in: managedTeamIds } };
	}
	return {
		businessUnitId: {
			in: scope === AccessScope.BUSINESS_UNIT_TREE ? treeIds : unitIds,
		},
	};
}

function unitStateWhere(
	scope: AccessScope,
	unitIds: string[],
	treeIds: string[],
	teamIds: string[],
	managedTeamIds: string[],
) {
	if (scope === AccessScope.TEAM) return { teamId: { in: teamIds } };
	if (scope === AccessScope.MANAGED_TEAMS) {
		return { teamId: { in: managedTeamIds } };
	}
	return {
		businessUnitId: {
			in: scope === AccessScope.BUSINESS_UNIT_TREE ? treeIds : unitIds,
		},
	};
}

function unique(values: string[]) {
	return [...new Set(values)];
}
