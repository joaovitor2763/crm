import { AccessScope, PermissionAction, type Prisma } from "@crm/db";
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
import { dashboardAnalyticsInput } from "./analytics.contracts";
import { dashboardSummaryInput } from "./dashboard.contracts";
import { DashboardService } from "./dashboard.service";
import {
	dashboardDefinitionCreateInput,
	dashboardDefinitionDuplicateInput,
	dashboardDefinitionIdInput,
	dashboardDefinitionListInput,
	dashboardDefinitionUpdateInput,
	dashboardDefinitionVersionInput,
} from "./dashboard-definition.contracts";
import { DashboardDefinitionService } from "./dashboard-definition.service";

@Router({ alias: "dashboard" })
@UseMiddlewares(AuthMiddleware)
export class DashboardRouter {
	constructor(
		@Inject(DashboardService) private readonly dashboard: DashboardService,
		@Inject(DashboardDefinitionService)
		private readonly definitions: DashboardDefinitionService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: dashboardDefinitionListInput })
	definitionsList(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardDefinitionListInput>,
	) {
		return this.definitions.list(input, ctx.principal);
	}

	@Query({ input: dashboardDefinitionIdInput })
	definition(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.definitions.byId(id, ctx.principal);
	}

	@Query()
	definitionTemplates(@Ctx() ctx: AuthedTrpcContext) {
		return this.definitions.templates(ctx.principal);
	}

	@Query({ input: dashboardDefinitionIdInput })
	renderDefinition(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.definitions.render(id, ctx.principal);
	}

	@Mutation({ input: dashboardDefinitionCreateInput })
	createDefinition(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardDefinitionCreateInput>,
	) {
		return this.definitions.create(input, ctx.principal);
	}

	@Mutation({ input: dashboardDefinitionUpdateInput })
	updateDefinition(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardDefinitionUpdateInput>,
	) {
		return this.definitions.update(input, ctx.principal);
	}

	@Mutation({ input: dashboardDefinitionDuplicateInput })
	duplicateDefinition(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardDefinitionDuplicateInput>,
	) {
		return this.definitions.duplicate(input, ctx.principal);
	}

	@Mutation({ input: dashboardDefinitionVersionInput })
	versionDefinition(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardDefinitionVersionInput>,
	) {
		return this.definitions.version(input.id, ctx.principal);
	}

	@Mutation({ input: dashboardDefinitionIdInput })
	publishDefinition(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.definitions.publish(id, ctx.principal);
	}

	@Mutation({ input: dashboardDefinitionIdInput })
	archiveDefinition(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.definitions.archive(id, ctx.principal);
	}

	/**
	 * Everything on the overview: closed-won and the rolling rates behind it, the
	 * open pipeline by stage, six months of won against created, what is due to
	 * close, the biggest open deals, overdue tasks and recent activity.
	 */
	@Query({ input: dashboardSummaryInput })
	async summary(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardSummaryInput>,
	) {
		return this.dashboard.summary(
			ctx.user.id,
			input,
			this.accessControl.dealWhere(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			),
			this.accessControl.activityWhere(
				ctx.principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
		);
	}

	@Query({ input: dashboardAnalyticsInput })
	async analytics(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dashboardAnalyticsInput>,
	) {
		return this.dashboard.analytics(
			ctx.principal,
			ctx.user.id,
			input,
			this.accessControl.dealWhere(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			),
			this.accessControl.activityWhere(
				ctx.principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
			this.accessControl.configurationWhere(
				ctx.principal,
				CRM_RESOURCE.pipelines,
				PermissionAction.READ,
				true,
			),
			this.relatedContactScope(ctx),
		);
	}

	private relatedContactScope(
		ctx: AuthedTrpcContext,
	): Prisma.ContactWhereInput {
		if (
			this.accessControl.permission(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			) === AccessScope.NONE
		) {
			return { id: { in: [] } };
		}
		return this.accessControl.contactWhere(
			ctx.principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
	}
}
