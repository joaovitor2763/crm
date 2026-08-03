import { hashCredentialPassword } from "@crm/auth/password";
import { hasSignInAllowList, isWorkspaceEmail } from "@crm/auth/workspace";
import {
	AccessScope,
	BusinessUnitMembershipType,
	type Db,
	PermissionAction,
	Prisma,
	UserAccessStatus,
} from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	CRM_RESOURCE,
	DEFAULT_BUSINESS_UNIT_ID,
} from "../access-control/access-control.constants";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import type {
	BusinessUnitCreateInput,
	BusinessUnitUpdateInput,
	RoleCreateInput,
	RolePermissionInput,
	RoleUpdateInput,
	TeamCreateInput,
	TeamUpdateInput,
	UserAccessUpdateInput,
	UserCreateInput,
	UserPasswordUpdateInput,
	UserStatusUpdateInput,
	WorkspaceConfigurationUpdateInput,
} from "./governance.contracts";
import {
	assertBusinessUnitInScope,
	assertCurrentUserInScope,
	assertRoleAssignable,
	assertTeamBusinessUnitInScope,
	assertTeamInScope,
	businessUnitIdsForScope,
	effectiveScope,
	teamIdsForScope,
} from "./governance-scope";

@Injectable()
export class GovernanceService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async workspaceConfiguration() {
		return (
			(await this.db.workspaceConfiguration.findUnique({
				where: { id: "default" },
			})) ?? { id: "default", currency: "USD" }
		);
	}

	async updateWorkspaceConfiguration(input: WorkspaceConfigurationUpdateInput) {
		return this.db.workspaceConfiguration.upsert({
			where: { id: "default" },
			create: { id: "default", currency: input.currency },
			update: { currency: input.currency },
		});
	}

	async overview(principal: EffectivePrincipal) {
		const scoped = !principal.isAdmin;
		const businessUnitScope = effectiveScope(
			principal,
			CRM_RESOURCE.businessUnits,
			PermissionAction.MANAGE,
		);
		const teamScope = effectiveScope(
			principal,
			CRM_RESOURCE.teams,
			PermissionAction.MANAGE,
		);
		const userScope = effectiveScope(
			principal,
			CRM_RESOURCE.users,
			PermissionAction.MANAGE,
		);
		const businessUnitIds = businessUnitIdsForScope(
			principal,
			businessUnitScope,
		);
		const teamBusinessUnitIds = businessUnitIdsForScope(principal, teamScope);
		const teamIds = teamIdsForScope(principal, teamScope, teamBusinessUnitIds);
		const userBusinessUnitIds = businessUnitIdsForScope(principal, userScope);
		const userTeamIds = teamIdsForScope(
			principal,
			userScope,
			userBusinessUnitIds,
		);
		const businessUnitWhere: Prisma.BusinessUnitWhereInput =
			businessUnitIds === null
				? {}
				: {
						id: { in: businessUnitIds },
						archivedAt: null,
					};
		const teamWhere: Prisma.TeamWhereInput = {
			archivedAt: null,
			...(teamIds === null ? {} : { id: { in: teamIds } }),
		};
		const roleWhere: Prisma.RoleWhereInput = {
			archivedAt: null,
			...(scoped ? { isAdmin: false } : {}),
		};
		const userWhere: Prisma.UserWhereInput | undefined = scoped
			? {
					OR: [
						{
							access: null,
							businessUnitMemberships: { none: {} },
							teamMemberships: { none: {} },
						},
						{
							AND: [
								userWhereForScope(
									userScope,
									userBusinessUnitIds,
									userTeamIds,
									principal,
								),
								{
									OR: [
										{ access: null },
										{ access: { is: { role: { isAdmin: false } } } },
									],
								},
							],
						},
					],
				}
			: undefined;
		const [businessUnits, roles, users] = await Promise.all([
			this.db.businessUnit.findMany({
				where: businessUnitWhere,
				orderBy: [{ parentId: "asc" }, { name: "asc" }],
				include: {
					leader: { select: { id: true, name: true, email: true } },
					teams: {
						where: teamWhere,
						orderBy: { name: "asc" },
						include: {
							leader: { select: { id: true, name: true, email: true } },
							_count: { select: { memberships: true } },
						},
					},
					_count: {
						select: {
							memberships: true,
							contactStates: true,
							companyStates: true,
							deals: true,
						},
					},
				},
			}),
			this.db.role.findMany({
				where: roleWhere,
				orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
				include: {
					permissions: { orderBy: [{ resource: "asc" }, { action: "asc" }] },
					_count: {
						select: { users: true, apiCredentials: true, automations: true },
					},
				},
			}),
			this.db.user.findMany({
				where: userWhere,
				orderBy: [{ name: "asc" }, { email: "asc" }],
				select: {
					id: true,
					name: true,
					email: true,
					image: true,
					access: {
						include: {
							role: {
								select: { id: true, key: true, name: true, isAdmin: true },
							},
							primaryBusinessUnit: { select: { id: true, name: true } },
							primaryTeam: { select: { id: true, name: true } },
						},
					},
					businessUnitMemberships: {
						...(scoped && userBusinessUnitIds !== null
							? {
									where: {
										businessUnitId: { in: userBusinessUnitIds },
									},
								}
							: {}),
						select: { businessUnitId: true, type: true },
					},
					teamMemberships: {
						...(scoped && userTeamIds !== null
							? {
									where: {
										teamId: { in: userTeamIds },
									},
								}
							: {}),
						select: { teamId: true, isLead: true },
					},
				},
			}),
		]);

		return { businessUnits, roles, users };
	}

	async directory(principal: EffectivePrincipal) {
		const unitWhere = principal.isAdmin
			? { archivedAt: null }
			: {
					id: { in: principal.businessUnitTreeIds },
					archivedAt: null,
				};
		const [businessUnits, roles] = await Promise.all([
			this.db.businessUnit.findMany({
				where: unitWhere,
				orderBy: [{ parentId: "asc" }, { name: "asc" }],
				select: {
					id: true,
					key: true,
					name: true,
					parentId: true,
					teams: {
						where: { archivedAt: null },
						orderBy: { name: "asc" },
						select: { id: true, key: true, name: true, businessUnitId: true },
					},
				},
			}),
			this.db.role.findMany({
				where: { archivedAt: null, isAdmin: false },
				orderBy: { name: "asc" },
				select: { id: true, key: true, name: true, description: true },
			}),
		]);
		return { businessUnits, roles };
	}

	async createBusinessUnit(
		input: BusinessUnitCreateInput,
		actor: EffectivePrincipal,
	) {
		if (input.parentId) {
			assertBusinessUnitInScope(actor, input.parentId);
		} else if (!actor.isAdmin) {
			throw new ForbiddenException(
				"A scoped administrator can only create a child business unit within its scope.",
			);
		}
		return this.db.$transaction(async (tx) => {
			if (input.parentId) await this.requireBusinessUnit(tx, input.parentId);
			if (input.leaderId)
				await this.requireUserInScope(tx, actor, input.leaderId);
			const unit = await tx.businessUnit.create({
				data: {
					name: input.name,
					key: input.key,
					parentId: input.parentId ?? null,
					leaderId: input.leaderId ?? null,
				},
				select: { id: true, key: true, name: true, parentId: true },
			});
			await rebuildBusinessUnitClosure(tx);
			await this.audit(
				tx,
				actor,
				"business-unit.created",
				"business-units",
				unit.id,
			);
			return unit;
		});
	}

	async updateBusinessUnit(
		input: BusinessUnitUpdateInput,
		actor: EffectivePrincipal,
	) {
		if (input.id === DEFAULT_BUSINESS_UNIT_ID && input.parentId) {
			throw new BadRequestException(
				"The root business unit cannot have a parent.",
			);
		}
		if (!actor.isAdmin) {
			assertBusinessUnitInScope(actor, input.id);
			if (input.parentId === null) {
				throw new ForbiddenException(
					"A scoped administrator cannot move a business unit outside its scope.",
				);
			}
			if (input.parentId) assertBusinessUnitInScope(actor, input.parentId);
		}
		return this.db.$transaction(async (tx) => {
			await this.requireBusinessUnit(tx, input.id);
			if (input.parentId === input.id) {
				throw new BadRequestException("A business unit cannot parent itself.");
			}
			if (input.parentId) await this.requireBusinessUnit(tx, input.parentId);
			if (input.leaderId)
				await this.requireUserInScope(tx, actor, input.leaderId);
			const unit = await tx.businessUnit.update({
				where: { id: input.id },
				data: {
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
					...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {}),
				},
				select: { id: true, key: true, name: true, parentId: true },
			});
			await rebuildBusinessUnitClosure(tx);
			await this.audit(
				tx,
				actor,
				"business-unit.updated",
				"business-units",
				unit.id,
			);
			return unit;
		});
	}

	async createTeam(input: TeamCreateInput, actor: EffectivePrincipal) {
		assertTeamBusinessUnitInScope(actor, input.businessUnitId);
		return this.db.$transaction(async (tx) => {
			await this.requireBusinessUnit(tx, input.businessUnitId);
			if (input.leaderId)
				await this.requireUserInScope(tx, actor, input.leaderId);
			const team = await tx.team.create({
				data: {
					name: input.name,
					key: input.key,
					businessUnitId: input.businessUnitId,
					leaderId: input.leaderId ?? null,
				},
				select: { id: true, key: true, name: true, businessUnitId: true },
			});
			await this.audit(tx, actor, "team.created", "teams", team.id, {
				businessUnitId: team.businessUnitId,
			});
			return team;
		});
	}

	async updateTeam(input: TeamUpdateInput, actor: EffectivePrincipal) {
		return this.db.$transaction(async (tx) => {
			const current = await tx.team.findUnique({
				where: { id: input.id },
				select: { id: true, businessUnitId: true },
			});
			if (!current) throw new NotFoundException(`No team with id ${input.id}.`);
			assertTeamInScope(actor, current);
			if (input.leaderId)
				await this.requireUserInScope(tx, actor, input.leaderId);
			const team = await tx.team.update({
				where: { id: input.id },
				data: {
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {}),
				},
				select: { id: true, key: true, name: true, businessUnitId: true },
			});
			await this.audit(tx, actor, "team.updated", "teams", team.id, {
				businessUnitId: current.businessUnitId,
			});
			return team;
		});
	}

	async createRole(input: RoleCreateInput, actor: EffectivePrincipal) {
		this.assertGlobalAdmin(actor);
		return this.db.$transaction(async (tx) => {
			const role = await tx.role.create({
				data: {
					name: input.name,
					key: input.key,
					description: input.description ?? null,
				},
				select: { id: true, key: true, name: true },
			});
			await this.audit(tx, actor, "role.created", "roles", role.id);
			return role;
		});
	}

	async updateRole(input: RoleUpdateInput, actor: EffectivePrincipal) {
		this.assertGlobalAdmin(actor);
		return this.db.$transaction(async (tx) => {
			const current = await tx.role.findUnique({
				where: { id: input.id },
				select: { id: true },
			});
			if (!current) throw new NotFoundException(`No role with id ${input.id}.`);
			const role = await tx.role.update({
				where: { id: input.id },
				data: {
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.description !== undefined
						? { description: input.description }
						: {}),
				},
				select: { id: true, key: true, name: true },
			});
			await this.audit(tx, actor, "role.updated", "roles", role.id);
			return role;
		});
	}

	async setRolePermission(
		input: RolePermissionInput,
		actor: EffectivePrincipal,
	) {
		this.assertGlobalAdmin(actor);
		return this.db.$transaction(async (tx) => {
			const role = await tx.role.findUnique({
				where: { id: input.roleId },
				select: { id: true, isAdmin: true },
			});
			if (!role)
				throw new NotFoundException(`No role with id ${input.roleId}.`);
			if (role.isAdmin) {
				throw new BadRequestException(
					"Global Admin is an invariant and does not use permission overrides.",
				);
			}
			const permission = await tx.rolePermission.upsert({
				where: {
					roleId_resource_action: {
						roleId: input.roleId,
						resource: input.resource,
						action: input.action,
					},
				},
				create: input,
				update: { scope: input.scope },
			});
			await this.audit(
				tx,
				actor,
				"role.permission-updated",
				"roles",
				input.roleId,
				{
					resource: input.resource,
					action: input.action,
					scope: input.scope,
				},
			);
			return permission;
		});
	}

	async setUserAccess(input: UserAccessUpdateInput, actor: EffectivePrincipal) {
		if (
			input.status === UserAccessStatus.SUSPENDED &&
			actor.userId === input.userId
		) {
			throw new BadRequestException("You cannot suspend your own account.");
		}
		return this.db.$transaction(async (tx) => {
			const [user, role, teams] = await Promise.all([
				tx.user.findUnique({
					where: { id: input.userId },
					select: {
						id: true,
						access: {
							select: {
								status: true,
								role: { select: { isAdmin: true } },
								primaryBusinessUnitId: true,
								primaryTeamId: true,
							},
						},
						businessUnitMemberships: { select: { businessUnitId: true } },
						teamMemberships: { select: { teamId: true } },
					},
				}),
				tx.role.findUnique({
					where: { id: input.roleId },
					select: {
						id: true,
						isAdmin: true,
						archivedAt: true,
						permissions: {
							select: { resource: true, action: true, scope: true },
						},
						fieldPermissions: {
							select: { fieldId: true, canRead: true, canUpdate: true },
						},
					},
				}),
				tx.team.findMany({
					where: { id: { in: input.teamIds } },
					select: { id: true, businessUnitId: true },
				}),
			]);
			if (!user)
				throw new NotFoundException(`No user with id ${input.userId}.`);
			if (!role || role.archivedAt) {
				throw new NotFoundException(`No active role with id ${input.roleId}.`);
			}
			if (!actor.isAdmin) {
				assertCurrentUserInScope(actor, user, true);
				assertRoleAssignable(actor, role);
			}
			if (teams.length !== new Set(input.teamIds).size) {
				throw new BadRequestException(
					"One or more selected teams do not exist.",
				);
			}
			if (
				input.primaryTeamId &&
				!teams.some((team) => team.id === input.primaryTeamId)
			) {
				throw new BadRequestException("The primary team must be a membership.");
			}
			const primaryTeam = teams.find((team) => team.id === input.primaryTeamId);
			if (
				primaryTeam &&
				input.primaryBusinessUnitId !== primaryTeam.businessUnitId
			) {
				throw new BadRequestException(
					"The primary team must belong to the primary business unit.",
				);
			}

			const current = await tx.userAccess.findUnique({
				where: { userId: input.userId },
				select: { role: { select: { isAdmin: true } }, status: true },
			});
			const removesActiveAdmin =
				current?.role.isAdmin &&
				current.status === UserAccessStatus.ACTIVE &&
				(!role.isAdmin || input.status === UserAccessStatus.SUSPENDED);
			if (removesActiveAdmin) {
				const otherAdmins = await tx.userAccess.count({
					where: {
						userId: { not: input.userId },
						status: UserAccessStatus.ACTIVE,
						role: { isAdmin: true },
					},
				});
				if (otherAdmins === 0) {
					throw new ConflictException(
						"The CRM must keep one active Global Admin.",
					);
				}
			}

			const businessUnitIds = unique([
				...input.businessUnitIds,
				...teams.map((team) => team.businessUnitId),
				...(input.primaryBusinessUnitId ? [input.primaryBusinessUnitId] : []),
			]);
			if (!actor.isAdmin) {
				if (businessUnitIds.length === 0 && input.teamIds.length === 0) {
					throw new ForbiddenException(
						"A scoped administrator must assign the user to a business unit or team within its scope.",
					);
				}
				for (const businessUnitId of businessUnitIds) {
					assertBusinessUnitInScope(actor, businessUnitId);
				}
				for (const team of teams) assertTeamInScope(actor, team);
				assertCurrentUserInScope(actor, {
					id: input.userId,
					access: {
						role: { isAdmin: role.isAdmin },
						primaryBusinessUnitId: input.primaryBusinessUnitId,
						primaryTeamId: input.primaryTeamId,
					},
					businessUnitMemberships: businessUnitIds.map((businessUnitId) => ({
						businessUnitId,
					})),
					teamMemberships: input.teamIds.map((teamId) => ({ teamId })),
				});
				for (const managedTeamId of input.managedTeamIds) {
					if (!input.teamIds.includes(managedTeamId)) {
						throw new BadRequestException(
							"Managed teams must also be team memberships.",
						);
					}
				}
			}
			const foundUnits = await tx.businessUnit.count({
				where: { id: { in: businessUnitIds }, archivedAt: null },
			});
			if (foundUnits !== businessUnitIds.length) {
				throw new BadRequestException(
					"One or more selected business units do not exist.",
				);
			}

			await tx.userAccess.upsert({
				where: { userId: input.userId },
				create: {
					userId: input.userId,
					roleId: input.roleId,
					status: input.status,
					primaryBusinessUnitId: input.primaryBusinessUnitId,
					primaryTeamId: input.primaryTeamId,
				},
				update: {
					roleId: input.roleId,
					status: input.status,
					primaryBusinessUnitId: input.primaryBusinessUnitId,
					primaryTeamId: input.primaryTeamId,
				},
			});
			if (input.status === UserAccessStatus.SUSPENDED) {
				await tx.session.deleteMany({ where: { userId: input.userId } });
			}
			await tx.businessUnitMembership.deleteMany({
				where: { userId: input.userId },
			});
			if (businessUnitIds.length > 0) {
				await tx.businessUnitMembership.createMany({
					data: businessUnitIds.map((businessUnitId) => ({
						userId: input.userId,
						businessUnitId,
						type: BusinessUnitMembershipType.MEMBER,
					})),
				});
			}
			await tx.teamMembership.deleteMany({ where: { userId: input.userId } });
			if (teams.length > 0) {
				const managed = new Set(input.managedTeamIds);
				await tx.teamMembership.createMany({
					data: teams.map((team) => ({
						userId: input.userId,
						teamId: team.id,
						isLead: managed.has(team.id),
					})),
				});
			}
			await this.audit(
				tx,
				actor,
				"user.access-updated",
				"users",
				input.userId,
				{
					roleId: input.roleId,
					status: input.status,
				},
			);

			return { userId: input.userId };
		});
	}

	async createUser(input: UserCreateInput, actor: EffectivePrincipal) {
		this.assertGlobalAdmin(actor);
		if (!hasSignInAllowList() || !isWorkspaceEmail(input.email)) {
			throw new BadRequestException(
				"That email is not included in ALLOWED_SIGN_IN.",
			);
		}
		if (await this.db.user.findUnique({ where: { email: input.email } })) {
			throw new ConflictException("A user with that email already exists.");
		}

		const password = await hashCredentialPassword(input.password);
		try {
			return await this.db.$transaction(async (tx) => {
				const [role, primaryUnit, primaryTeam] = await Promise.all([
					tx.role.findUnique({
						where: { id: input.roleId },
						select: { id: true, archivedAt: true },
					}),
					input.primaryBusinessUnitId
						? tx.businessUnit.findUnique({
								where: { id: input.primaryBusinessUnitId },
								select: { id: true, archivedAt: true },
							})
						: null,
					input.primaryTeamId
						? tx.team.findUnique({
								where: { id: input.primaryTeamId },
								select: { id: true, businessUnitId: true, archivedAt: true },
							})
						: null,
				]);
				if (!role || role.archivedAt) {
					throw new NotFoundException(
						`No active role with id ${input.roleId}.`,
					);
				}
				if (
					input.primaryBusinessUnitId &&
					(!primaryUnit || primaryUnit.archivedAt)
				) {
					throw new NotFoundException(
						"The selected business unit is not active.",
					);
				}
				if (input.primaryTeamId && (!primaryTeam || primaryTeam.archivedAt)) {
					throw new NotFoundException("The selected team is not active.");
				}
				if (
					primaryTeam &&
					primaryTeam.businessUnitId !== input.primaryBusinessUnitId
				) {
					throw new BadRequestException(
						"The primary team must belong to the primary business unit.",
					);
				}

				const userId = crypto.randomUUID();
				const user = await tx.user.create({
					data: {
						id: userId,
						name: input.name,
						email: input.email,
					},
					select: { id: true, name: true, email: true },
				});
				await tx.account.create({
					data: {
						id: crypto.randomUUID(),
						accountId: userId,
						providerId: "credential",
						userId,
						password,
					},
				});
				await tx.userAccess.create({
					data: {
						userId,
						roleId: role.id,
						primaryBusinessUnitId: input.primaryBusinessUnitId,
						primaryTeamId: input.primaryTeamId,
					},
				});
				if (input.primaryBusinessUnitId) {
					await tx.businessUnitMembership.create({
						data: {
							userId,
							businessUnitId: input.primaryBusinessUnitId,
							type: BusinessUnitMembershipType.MEMBER,
						},
					});
				}
				if (input.primaryTeamId) {
					await tx.teamMembership.create({
						data: { userId, teamId: input.primaryTeamId },
					});
				}
				await this.audit(tx, actor, "user.created", "users", userId, {
					roleId: role.id,
				});
				return user;
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new ConflictException("A user with that email already exists.");
			}
			throw error;
		}
	}

	async setUserPassword(
		input: UserPasswordUpdateInput,
		actor: EffectivePrincipal,
	) {
		this.assertGlobalAdmin(actor);
		const password = await hashCredentialPassword(input.password);
		return this.db.$transaction(async (tx) => {
			const user = await tx.user.findUnique({
				where: { id: input.userId },
				select: { id: true },
			});
			if (!user)
				throw new NotFoundException(`No user with id ${input.userId}.`);
			const credential = await tx.account.findFirst({
				where: { userId: input.userId, providerId: "credential" },
				select: { id: true },
			});
			if (credential) {
				await tx.account.update({
					where: { id: credential.id },
					data: { password },
				});
			} else {
				await tx.account.create({
					data: {
						id: crypto.randomUUID(),
						accountId: input.userId,
						providerId: "credential",
						userId: input.userId,
						password,
					},
				});
			}
			await tx.session.deleteMany({ where: { userId: input.userId } });
			await this.audit(
				tx,
				actor,
				"user.password-updated",
				"users",
				input.userId,
			);
			return { userId: input.userId };
		});
	}

	async setUserStatus(input: UserStatusUpdateInput, actor: EffectivePrincipal) {
		this.assertGlobalAdmin(actor);
		if (
			input.status === UserAccessStatus.SUSPENDED &&
			actor.userId === input.userId
		) {
			throw new BadRequestException("You cannot suspend your own account.");
		}
		return this.db.$transaction(async (tx) => {
			const access = await tx.userAccess.findUnique({
				where: { userId: input.userId },
				select: { status: true, role: { select: { isAdmin: true } } },
			});
			if (!access) {
				throw new NotFoundException(
					`No access configuration for user ${input.userId}.`,
				);
			}
			if (
				access.role.isAdmin &&
				access.status === UserAccessStatus.ACTIVE &&
				input.status === UserAccessStatus.SUSPENDED
			) {
				const otherAdmins = await tx.userAccess.count({
					where: {
						userId: { not: input.userId },
						status: UserAccessStatus.ACTIVE,
						role: { isAdmin: true },
					},
				});
				if (otherAdmins === 0) {
					throw new ConflictException(
						"The CRM must keep one active Global Admin.",
					);
				}
			}
			await tx.userAccess.update({
				where: { userId: input.userId },
				data: { status: input.status },
			});
			if (input.status === UserAccessStatus.SUSPENDED) {
				await tx.session.deleteMany({ where: { userId: input.userId } });
			}
			await this.audit(
				tx,
				actor,
				input.status === UserAccessStatus.SUSPENDED
					? "user.suspended"
					: "user.reactivated",
				"users",
				input.userId,
			);
			return { userId: input.userId, status: input.status };
		});
	}

	private async requireUserInScope(
		tx: Prisma.TransactionClient,
		principal: EffectivePrincipal,
		userId: string,
	): Promise<void> {
		const user = await tx.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				access: {
					select: {
						status: true,
						role: { select: { isAdmin: true } },
						primaryBusinessUnitId: true,
						primaryTeamId: true,
					},
				},
				businessUnitMemberships: { select: { businessUnitId: true } },
				teamMemberships: { select: { teamId: true } },
			},
		});
		if (!user) throw new NotFoundException(`No user with id ${userId}.`);
		assertCurrentUserInScope(principal, user);
	}

	private assertGlobalAdmin(actor: EffectivePrincipal): void {
		if (!actor.isAdmin) {
			throw new ForbiddenException(
				"Only Global Admin can manage shared role definitions.",
			);
		}
	}

	private async requireBusinessUnit(
		tx: Prisma.TransactionClient,
		id: string,
	): Promise<void> {
		const unit = await tx.businessUnit.findUnique({
			where: { id },
			select: { id: true, archivedAt: true },
		});
		if (!unit || unit.archivedAt) {
			throw new NotFoundException(`No active business unit with id ${id}.`);
		}
	}

	private audit(
		tx: Prisma.TransactionClient,
		actor: EffectivePrincipal,
		action: string,
		resource: string,
		recordId: string,
		metadata?: Prisma.InputJsonObject,
	) {
		return tx.auditEvent.create({
			data: {
				actorType: actor.actorType,
				actorId: actor.actorId,
				action,
				resource,
				recordId,
				metadata,
			},
		});
	}
}

async function rebuildBusinessUnitClosure(
	tx: Prisma.TransactionClient,
): Promise<void> {
	const units = await tx.businessUnit.findMany({
		select: { id: true, parentId: true },
	});
	const parents = new Map(units.map((unit) => [unit.id, unit.parentId]));
	const paths: Array<{
		ancestorId: string;
		descendantId: string;
		depth: number;
	}> = [];

	for (const unit of units) {
		const seen = new Set<string>();
		let ancestorId: string | null = unit.id;
		let depth = 0;
		while (ancestorId) {
			if (seen.has(ancestorId)) {
				throw new BadRequestException(
					"Business unit hierarchy contains a cycle.",
				);
			}
			seen.add(ancestorId);
			paths.push({ ancestorId, descendantId: unit.id, depth });
			ancestorId = parents.get(ancestorId) ?? null;
			depth += 1;
		}
	}

	await tx.businessUnitClosure.deleteMany();
	if (paths.length > 0)
		await tx.businessUnitClosure.createMany({ data: paths });
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function userWhereForScope(
	scope: AccessScope,
	unitIds: string[] | null,
	teamIds: string[] | null,
	principal: EffectivePrincipal,
): Prisma.UserWhereInput {
	if (scope === AccessScope.ALL) return {};
	if (scope === AccessScope.OWNED) {
		return principal.userId ? { id: principal.userId } : { id: { in: [] } };
	}
	if (
		scope === AccessScope.BUSINESS_UNIT ||
		scope === AccessScope.BUSINESS_UNIT_TREE
	) {
		return unitIds && unitIds.length > 0
			? {
					OR: [
						{
							businessUnitMemberships: {
								some: { businessUnitId: { in: unitIds } },
							},
						},
						{
							teamMemberships: {
								some: { team: { businessUnitId: { in: unitIds } } },
							},
						},
					],
				}
			: { id: { in: [] } };
	}
	if (scope === AccessScope.TEAM || scope === AccessScope.MANAGED_TEAMS) {
		return teamIds && teamIds.length > 0
			? { teamMemberships: { some: { teamId: { in: teamIds } } } }
			: { id: { in: [] } };
	}
	return { id: { in: [] } };
}
