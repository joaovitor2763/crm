import { PermissionAction } from "@crm/db";
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	businessUnitCreateInput,
	businessUnitUpdateInput,
	roleCreateInput,
	rolePermissionInput,
	roleUpdateInput,
	teamCreateInput,
	teamUpdateInput,
	userAccessUpdateInput,
} from "./governance.contracts";
import { GovernanceService } from "./governance.service";

@Router({ alias: "governance" })
@UseMiddlewares(AuthMiddleware)
export class GovernanceRouter {
	constructor(
		@Inject(GovernanceService) private readonly governance: GovernanceService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query()
	overview(@Ctx() ctx: AuthedTrpcContext) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.businessUnits,
			PermissionAction.MANAGE,
		);
		return this.governance.overview(ctx.principal);
	}

	@Query()
	capabilities(@Ctx() ctx: AuthedTrpcContext) {
		return ctx.principal;
	}

	@Query()
	directory(@Ctx() ctx: AuthedTrpcContext) {
		return this.governance.directory(ctx.principal);
	}

	@Mutation({ input: businessUnitCreateInput })
	createBusinessUnit(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessUnitCreateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.businessUnits,
			PermissionAction.MANAGE,
		);
		return this.governance.createBusinessUnit(input, ctx.principal);
	}

	@Mutation({ input: businessUnitUpdateInput })
	updateBusinessUnit(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof businessUnitUpdateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.businessUnits,
			PermissionAction.MANAGE,
		);
		return this.governance.updateBusinessUnit(input, ctx.principal);
	}

	@Mutation({ input: teamCreateInput })
	createTeam(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof teamCreateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.teams,
			PermissionAction.MANAGE,
		);
		return this.governance.createTeam(input, ctx.principal);
	}

	@Mutation({ input: teamUpdateInput })
	updateTeam(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof teamUpdateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.teams,
			PermissionAction.MANAGE,
		);
		return this.governance.updateTeam(input, ctx.principal);
	}

	@Mutation({ input: roleCreateInput })
	createRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof roleCreateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.roles,
			PermissionAction.MANAGE,
		);
		return this.governance.createRole(input, ctx.principal);
	}

	@Mutation({ input: roleUpdateInput })
	updateRole(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof roleUpdateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.roles,
			PermissionAction.MANAGE,
		);
		return this.governance.updateRole(input, ctx.principal);
	}

	@Mutation({ input: rolePermissionInput })
	setRolePermission(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof rolePermissionInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.roles,
			PermissionAction.MANAGE,
		);
		return this.governance.setRolePermission(input, ctx.principal);
	}

	@Mutation({ input: userAccessUpdateInput })
	setUserAccess(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof userAccessUpdateInput>,
	) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.users,
			PermissionAction.MANAGE,
		);
		return this.governance.setUserAccess(input, ctx.principal);
	}
}
