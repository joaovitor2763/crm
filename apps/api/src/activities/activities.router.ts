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
	activityCreateInput,
	completeInput,
	myTasksInput,
	timelineCountsInput,
	timelineInput,
} from "./activities.contracts";
import { ActivitiesService } from "./activities.service";

@Router({ alias: "activities" })
@UseMiddlewares(AuthMiddleware)
export class ActivitiesRouter {
	constructor(
		@Inject(ActivitiesService) private readonly activities: ActivitiesService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: timelineInput })
	async timeline(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof timelineInput>,
	) {
		await this.assertAnchor(ctx, input, PermissionAction.READ);
		return this.activities.timeline(
			input,
			this.accessControl.activityWhere(
				ctx.principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
		);
	}

	@Query({ input: timelineCountsInput })
	async timelineCounts(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof timelineCountsInput>,
	) {
		await this.assertAnchor(ctx, input, PermissionAction.READ);
		return this.activities.timelineCounts(
			input,
			this.accessControl.activityWhere(
				ctx.principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
		);
	}

	@Query({ input: myTasksInput })
	async myTasks(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof myTasksInput>,
	) {
		return this.activities.myTasks(
			input,
			ctx.user.id,
			this.accessControl.activityWhere(
				ctx.principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
		);
	}

	@Mutation({ input: activityCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof activityCreateInput>,
	) {
		await this.assertAnchor(ctx, input, PermissionAction.READ);
		const placement = await this.activities.resolvePlacement(
			input,
			ctx.principal.businessUnitTreeIds,
			ctx.principal.primaryBusinessUnitId,
			ctx.principal.primaryTeamId,
		);
		this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.activities,
			PermissionAction.CREATE,
			{ ...placement, ownerId: ctx.user.id },
		);
		return this.activities.create(input, ctx.user.id, placement);
	}

	@Mutation({ input: completeInput })
	async complete(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof completeInput>,
	) {
		return this.activities.complete(
			input.id,
			input.completed,
			this.accessControl.activityWhere(
				ctx.principal,
				CRM_RESOURCE.activities,
				PermissionAction.UPDATE,
			),
		);
	}

	private assertAnchor(
		ctx: AuthedTrpcContext,
		input: { companyId?: string; contactId?: string; dealId?: string },
		action: PermissionAction,
	) {
		if (input.dealId) {
			return this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.deals,
				action,
				input.dealId,
			);
		}
		if (input.contactId) {
			return this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.contacts,
				action,
				input.contactId,
			);
		}
		if (input.companyId) {
			return this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.companies,
				action,
				input.companyId,
			);
		}
		return Promise.resolve();
	}
}
