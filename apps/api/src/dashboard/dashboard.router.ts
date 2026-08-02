import { PermissionAction } from "@crm/db";
import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { dashboardSummaryInput } from "./dashboard.contracts";
import { DashboardService } from "./dashboard.service";

@Router({ alias: "dashboard" })
@UseMiddlewares(AuthMiddleware)
export class DashboardRouter {
	constructor(
		@Inject(DashboardService) private readonly dashboard: DashboardService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

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
}
