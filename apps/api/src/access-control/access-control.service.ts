import {
	AccessScope,
	AuditActorType,
	type Db,
	PermissionAction,
	type Prisma,
	UserAccessStatus,
} from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	DEFAULT_BUSINESS_UNIT_ID,
	DEFAULT_ROLE_ID,
	DEFAULT_TEAM_ID,
} from "./access-control.constants";
import type {
	EffectivePrincipal,
	EffectiveTeamAssignment,
} from "./access-control.types";

type ScopedAssignment = {
	businessUnitId?: string | null;
	teamId?: string | null;
	ownerId?: string | null;
};

type AssignmentCandidates = {
	team: { businessUnitId: string } | null;
	owner: { businessUnitIds: string[]; teamIds: string[] } | null;
};

@Injectable()
export class AccessControlService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * Resolve one stable principal for the whole request. New Better Auth users
	 * start read-only in the root unit; an administrator has to broaden that
	 * explicitly. Existing users were migrated to Global Admin to preserve the
	 * previous all-signed-in behavior without locking anyone out.
	 */
	async forUser(userId: string): Promise<EffectivePrincipal> {
		let access = await this.loadUserAccess(userId);
		if (!access) {
			await this.db.$transaction(async (tx) => {
				await tx.userAccess.createMany({
					data: [
						{
							userId,
							roleId: DEFAULT_ROLE_ID,
							primaryBusinessUnitId: DEFAULT_BUSINESS_UNIT_ID,
							primaryTeamId: DEFAULT_TEAM_ID,
						},
					],
					skipDuplicates: true,
				});
				await tx.businessUnitMembership.createMany({
					data: [
						{
							userId,
							businessUnitId: DEFAULT_BUSINESS_UNIT_ID,
						},
					],
					skipDuplicates: true,
				});
				await tx.teamMembership.createMany({
					data: [{ userId, teamId: DEFAULT_TEAM_ID }],
					skipDuplicates: true,
				});
			});
			access = await this.loadUserAccess(userId);
		}

		if (!access || access.status === UserAccessStatus.SUSPENDED) {
			throw new ForbiddenException("This CRM user is suspended.");
		}

		const businessUnitIds = unique([
			...access.user.businessUnitMemberships.map(
				(membership) => membership.businessUnitId,
			),
			...(access.primaryBusinessUnitId ? [access.primaryBusinessUnitId] : []),
		]);
		const teamIds = unique([
			...access.user.teamMemberships.map((membership) => membership.teamId),
			...(access.primaryTeamId ? [access.primaryTeamId] : []),
		]);

		const [descendants, managedTeams] = await Promise.all([
			businessUnitIds.length > 0
				? this.db.businessUnitClosure.findMany({
						where: { ancestorId: { in: businessUnitIds } },
						select: { descendantId: true },
					})
				: [],
			this.db.team.findMany({
				where: {
					archivedAt: null,
					OR: [
						{ leaderId: userId },
						{ memberships: { some: { userId, isLead: true } } },
					],
				},
				select: { id: true },
			}),
		]);
		const businessUnitTreeIds = unique([
			...businessUnitIds,
			...descendants.map((path) => path.descendantId),
		]);
		const managedTeamIds = managedTeams.map((team) => team.id);
		const teamAssignments = await this.loadTeamAssignments(
			businessUnitTreeIds,
			[...teamIds, ...managedTeamIds],
		);

		return {
			actorType: AuditActorType.USER,
			actorId: userId,
			userId,
			roleId: access.roleId,
			roleKey: access.role.key,
			isAdmin: access.role.isAdmin,
			status: access.status,
			primaryBusinessUnitId: access.primaryBusinessUnitId,
			primaryTeamId: access.primaryTeamId,
			businessUnitIds,
			businessUnitTreeIds,
			teamIds,
			managedTeamIds,
			teamAssignments,
			ownerAssignments: [{ userId, businessUnitIds, teamIds }],
			permissions: access.role.permissions,
			fieldPermissions: access.role.fieldPermissions,
		};
	}

	async forApiCredential(credentialId: string): Promise<EffectivePrincipal> {
		const credential = await this.db.apiCredential.findUnique({
			where: { id: credentialId },
			include: {
				role: {
					include: {
						permissions: {
							select: { resource: true, action: true, scope: true },
						},
						fieldPermissions: {
							select: { fieldId: true, canRead: true, canUpdate: true },
						},
					},
				},
				businessUnits: { select: { businessUnitId: true } },
				teams: { select: { teamId: true } },
			},
		});
		if (!credential) throw new ForbiddenException("Invalid API credential.");
		if (credential.accessMode === "USER_DELEGATE") {
			const delegated = await this.forUser(credential.createdById);
			return {
				...delegated,
				actorType: AuditActorType.API_KEY,
				actorId: credential.id,
			};
		}

		const businessUnitIds = credential.businessUnits.map(
			(scope) => scope.businessUnitId,
		);
		const descendants =
			businessUnitIds.length > 0
				? await this.db.businessUnitClosure.findMany({
						where: { ancestorId: { in: businessUnitIds } },
						select: { descendantId: true },
					})
				: [];
		const businessUnitTreeIds = unique([
			...businessUnitIds,
			...descendants.map((path) => path.descendantId),
		]);
		const teamIds = credential.teams.map((scope) => scope.teamId);
		const teamAssignments = await this.loadTeamAssignments(
			businessUnitTreeIds,
			teamIds,
		);

		return {
			actorType: AuditActorType.API_KEY,
			actorId: credential.id,
			userId: null,
			roleId: credential.roleId,
			roleKey: credential.role.key,
			// External credentials are always bounded delegates. Even if a stale
			// credential references an admin role, it must never inherit the user's
			// global-admin bypass.
			isAdmin: false,
			status: UserAccessStatus.ACTIVE,
			primaryBusinessUnitId: businessUnitIds[0] ?? null,
			primaryTeamId: teamIds[0] ?? null,
			businessUnitIds,
			businessUnitTreeIds,
			teamIds,
			managedTeamIds: [],
			teamAssignments,
			ownerAssignments: [],
			permissions: credential.role.permissions,
			fieldPermissions: credential.role.fieldPermissions,
		};
	}

	async forAutomation(automationId: string): Promise<EffectivePrincipal> {
		const automation = await this.db.automation.findUnique({
			where: { id: automationId },
			include: {
				role: {
					include: {
						permissions: {
							select: { resource: true, action: true, scope: true },
						},
						fieldPermissions: {
							select: { fieldId: true, canRead: true, canUpdate: true },
						},
					},
				},
			},
		});
		if (!automation) throw new ForbiddenException("Automation not found.");
		const businessUnitIds = automation.businessUnitId
			? [automation.businessUnitId]
			: [];
		const descendants =
			businessUnitIds.length > 0
				? await this.db.businessUnitClosure.findMany({
						where: { ancestorId: { in: businessUnitIds } },
						select: { descendantId: true },
					})
				: [];
		const businessUnitTreeIds = unique([
			...businessUnitIds,
			...descendants.map((path) => path.descendantId),
		]);
		const teamIds = automation.teamId ? [automation.teamId] : [];
		const teamAssignments = await this.loadTeamAssignments(
			businessUnitTreeIds,
			teamIds,
		);
		return {
			actorType: AuditActorType.AUTOMATION,
			actorId: automation.id,
			userId: null,
			roleId: automation.roleId,
			roleKey: automation.role.key,
			// Automations execute with role permissions, not the administrator bypass.
			isAdmin: false,
			status: UserAccessStatus.ACTIVE,
			primaryBusinessUnitId: automation.businessUnitId,
			primaryTeamId: automation.teamId,
			businessUnitIds,
			businessUnitTreeIds,
			teamIds,
			managedTeamIds: [],
			teamAssignments,
			ownerAssignments: [],
			permissions: automation.role.permissions,
			fieldPermissions: automation.role.fieldPermissions,
		};
	}

	permission(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	): AccessScope {
		if (principal.isAdmin) return AccessScope.ALL;
		const granted =
			principal.permissions.find(
				(permission) =>
					permission.resource === resource && permission.action === action,
			)?.scope ?? AccessScope.NONE;
		if (
			granted === AccessScope.ALL &&
			principal.actorType !== AuditActorType.USER &&
			principal.businessUnitIds.length > 0
		) {
			return AccessScope.BUSINESS_UNIT_TREE;
		}
		return granted;
	}

	assert(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	): AccessScope {
		const scope = this.permission(principal, resource, action);
		if (scope === AccessScope.NONE) {
			throw new ForbiddenException(
				`Your role cannot ${action.toLowerCase()} ${resource}.`,
			);
		}
		return scope;
	}

	async assertAssignment(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
		assignment: ScopedAssignment,
	): Promise<void> {
		const scope = this.assert(principal, resource, action);
		const [team, owner] = await Promise.all([
			assignment.teamId
				? this.db.team.findFirst({
						where: { id: assignment.teamId, archivedAt: null },
						select: { businessUnitId: true },
					})
				: Promise.resolve(null),
			assignment.ownerId
				? this.db.user.findUnique({
						where: { id: assignment.ownerId },
						select: {
							businessUnitMemberships: {
								select: { businessUnitId: true },
							},
							teamMemberships: { select: { teamId: true } },
						},
					})
				: Promise.resolve(null),
		]);
		const allowed = this.assignmentAllowed(principal, scope, assignment, {
			team,
			owner: owner
				? {
						businessUnitIds: owner.businessUnitMemberships.map(
							(membership) => membership.businessUnitId,
						),
						teamIds: owner.teamMemberships.map(
							(membership) => membership.teamId,
						),
					}
				: null,
		});
		if (!allowed) {
			throw new ForbiddenException(
				"That owner, team or business unit is outside your permitted scope.",
			);
		}
	}

	contactWhere(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	): Prisma.ContactWhereInput {
		const scope = this.assert(principal, resource, action);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED) {
			if (!principal.userId) return { id: { in: [] } };
			return {
				OR: [
					{ ownerId: principal.userId },
					{ unitStates: { some: { ownerId: principal.userId } } },
				],
			};
		}
		return { unitStates: { some: this.unitStateWhere(principal, scope) } };
	}

	companyWhere(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	): Prisma.CompanyWhereInput {
		const scope = this.assert(principal, resource, action);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED) {
			if (!principal.userId) return { id: { in: [] } };
			return {
				OR: [
					{ ownerId: principal.userId },
					{ unitStates: { some: { ownerId: principal.userId } } },
				],
			};
		}
		return { unitStates: { some: this.unitStateWhere(principal, scope) } };
	}

	dealWhere(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	): Prisma.DealWhereInput {
		const scope = this.assert(principal, resource, action);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED) {
			return principal.userId
				? { ownerId: principal.userId }
				: { id: { in: [] } };
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

	activityWhere(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	): Prisma.ActivityWhereInput {
		const scope = this.assert(principal, resource, action);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED) {
			return principal.userId
				? { createdById: principal.userId }
				: { id: { in: [] } };
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

	configurationWhere(
		principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
		includeGlobal: boolean,
	): { businessUnitId?: null | { in: string[] }; OR?: Array<object> } {
		const scope = this.assert(principal, resource, action);
		if (scope === AccessScope.ALL) return {};
		const businessUnitIds =
			scope === AccessScope.BUSINESS_UNIT_TREE
				? principal.businessUnitTreeIds
				: principal.businessUnitIds;
		if (businessUnitIds.length === 0) {
			throw new ForbiddenException(
				"No business unit is available in this scope.",
			);
		}
		return includeGlobal
			? {
					OR: [
						{ businessUnitId: null },
						{ businessUnitId: { in: businessUnitIds } },
					],
				}
			: { businessUnitId: { in: businessUnitIds } };
	}

	async assertRecord(
		principal: EffectivePrincipal,
		resource: "contacts" | "companies" | "deals",
		action: PermissionAction,
		recordId: string,
	): Promise<void> {
		const visible =
			resource === "contacts"
				? await this.db.contact.findFirst({
						where: {
							AND: [
								{ id: recordId },
								this.contactWhere(principal, resource, action),
							],
						},
						select: { id: true },
					})
				: resource === "companies"
					? await this.db.company.findFirst({
							where: {
								AND: [
									{ id: recordId },
									this.companyWhere(principal, resource, action),
								],
							},
							select: { id: true },
						})
					: await this.db.deal.findFirst({
							where: {
								AND: [
									{ id: recordId },
									this.dealWhere(principal, resource, action),
								],
							},
							select: { id: true },
						});
		if (!visible)
			throw new NotFoundException("Record not found in your scope.");
	}

	canReadField(principal: EffectivePrincipal, fieldId: string): boolean {
		return (
			principal.isAdmin ||
			principal.fieldPermissions.find((field) => field.fieldId === fieldId)
				?.canRead !== false
		);
	}

	canUpdateField(principal: EffectivePrincipal, fieldId: string): boolean {
		return (
			principal.isAdmin ||
			principal.fieldPermissions.find((field) => field.fieldId === fieldId)
				?.canUpdate !== false
		);
	}

	private assignmentAllowed(
		principal: EffectivePrincipal,
		scope: AccessScope,
		assignment: ScopedAssignment,
		candidates: AssignmentCandidates,
	): boolean {
		if (scope === AccessScope.OWNED && !principal.userId) return false;
		if (assignment.teamId) {
			if (scope !== AccessScope.ALL && !candidates.team) return false;
			if (
				candidates.team &&
				assignment.businessUnitId &&
				candidates.team.businessUnitId !== assignment.businessUnitId
			) {
				return false;
			}
			if (
				scope === AccessScope.OWNED &&
				!principal.teamAssignments.some(
					(candidate) => candidate.teamId === assignment.teamId,
				)
			) {
				return false;
			}
		}
		const ownerId = assignment.ownerId;
		if (ownerId !== undefined && ownerId !== null) {
			if (
				scope !== AccessScope.ALL &&
				scope === AccessScope.OWNED &&
				ownerId !== principal.userId
			) {
				return false;
			}
			if (scope !== AccessScope.ALL && !candidates.owner) {
				return false;
			}
			if (candidates.owner) {
				if (
					assignment.teamId &&
					!candidates.owner.teamIds.includes(assignment.teamId)
				) {
					return false;
				}
				if (
					assignment.businessUnitId &&
					!candidates.owner.businessUnitIds.includes(assignment.businessUnitId)
				) {
					return false;
				}
			}
		}
		if (scope === AccessScope.ALL) return true;

		if (scope === AccessScope.OWNED) {
			return (
				assignment.ownerId === undefined ||
				assignment.ownerId === principal.userId
			);
		}
		if (scope === AccessScope.TEAM) {
			return Boolean(
				assignment.teamId && principal.teamIds.includes(assignment.teamId),
			);
		}
		if (scope === AccessScope.MANAGED_TEAMS) {
			return Boolean(
				assignment.teamId &&
					principal.managedTeamIds.includes(assignment.teamId),
			);
		}
		if (scope === AccessScope.BUSINESS_UNIT) {
			return Boolean(
				assignment.businessUnitId &&
					principal.businessUnitIds.includes(assignment.businessUnitId),
			);
		}
		if (scope === AccessScope.BUSINESS_UNIT_TREE) {
			return Boolean(
				assignment.businessUnitId &&
					principal.businessUnitTreeIds.includes(assignment.businessUnitId),
			);
		}
		return false;
	}

	private loadTeamAssignments(
		businessUnitTreeIds: string[],
		teamIds: string[],
	): Promise<EffectiveTeamAssignment[]> {
		const filters: Prisma.TeamWhereInput[] = [];
		if (businessUnitTreeIds.length > 0) {
			filters.push({ businessUnitId: { in: businessUnitTreeIds } });
		}
		if (teamIds.length > 0) {
			filters.push({ id: { in: unique(teamIds) } });
		}
		if (filters.length === 0) return Promise.resolve([]);

		return this.db.team
			.findMany({
				where: { archivedAt: null, OR: filters },
				select: { id: true, businessUnitId: true },
			})
			.then((teams) =>
				teams.map((team) => ({
					teamId: team.id,
					businessUnitId: team.businessUnitId,
				})),
			);
	}

	private unitStateWhere(
		principal: EffectivePrincipal,
		scope: AccessScope,
	): Prisma.ContactBusinessUnitStateWhereInput &
		Prisma.CompanyBusinessUnitStateWhereInput {
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

	private loadUserAccess(userId: string) {
		return this.db.userAccess.findUnique({
			where: { userId },
			include: {
				role: {
					include: {
						permissions: {
							select: { resource: true, action: true, scope: true },
						},
						fieldPermissions: {
							select: { fieldId: true, canRead: true, canUpdate: true },
						},
					},
				},
				user: {
					select: {
						businessUnitMemberships: {
							select: { businessUnitId: true },
						},
						teamMemberships: { select: { teamId: true } },
					},
				},
			},
		});
	}
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
