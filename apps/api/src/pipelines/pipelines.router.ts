import { PermissionAction, type Prisma } from "@crm/db";
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
	pipelineBlueprintTransitionInput,
	pipelineBlueprintUpdateInput,
	pipelineBlueprintValidationInput,
	pipelineCreateInput,
	pipelineIdInput,
	pipelineListInput,
	pipelineStageCreateInput,
	pipelineStageIdInput,
	pipelineStageReorderInput,
	pipelineStageUpdateInput,
	pipelineUpdateInput,
} from "./pipelines.contracts";
import { PipelinesService } from "./pipelines.service";

@Router({ alias: "pipelines" })
@UseMiddlewares(AuthMiddleware)
export class PipelinesRouter {
	constructor(
		@Inject(PipelinesService) private readonly pipelines: PipelinesService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: pipelineListInput })
	list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineListInput>,
	) {
		return this.pipelines.list(
			input.includeArchived,
			this.scope(ctx, PermissionAction.READ, true),
		);
	}

	@Query({ input: pipelineIdInput })
	describe(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.pipelines.describe(
			id,
			this.scope(ctx, PermissionAction.READ, true),
		);
	}

	@Query({ input: pipelineBlueprintValidationInput })
	validateBlueprint(
		@Input() input: z.infer<typeof pipelineBlueprintValidationInput>,
	) {
		return this.pipelines.validateBlueprint(input);
	}

	@Query({ input: pipelineBlueprintTransitionInput })
	validateTransition(
		@Input() input: z.infer<typeof pipelineBlueprintTransitionInput>,
	) {
		return this.pipelines.validateBlueprintTransition(input.blueprint, input);
	}

	@Mutation({ input: pipelineBlueprintUpdateInput })
	publishBlueprint(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineBlueprintUpdateInput>,
	) {
		return this.pipelines.publishBlueprint(
			input,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineCreateInput>,
	) {
		const businessUnitId =
			input.businessUnitId ?? ctx.principal.primaryBusinessUnitId;
		await this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.pipelines,
			PermissionAction.MANAGE,
			{ businessUnitId },
		);
		return this.pipelines.create(input.name, businessUnitId, input.funnelType);
	}

	@Mutation({ input: pipelineUpdateInput })
	update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineUpdateInput>,
	) {
		return this.pipelines.update(
			input,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineIdInput })
	archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.pipelines.archive(
			id,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineIdInput })
	restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.pipelines.restore(
			id,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineStageCreateInput })
	createStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineStageCreateInput>,
	) {
		return this.pipelines.createStage(
			input,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineStageUpdateInput })
	updateStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineStageUpdateInput>,
	) {
		return this.pipelines.updateStage(
			input,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineStageReorderInput })
	reorderStages(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof pipelineStageReorderInput>,
	) {
		return this.pipelines.reorderStages(
			input.pipelineId,
			input.stageIds,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: pipelineStageIdInput })
	removeStage(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.pipelines.removeStage(
			id,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	private scope(
		ctx: AuthedTrpcContext,
		action: PermissionAction,
		includeGlobal: boolean,
	): Prisma.PipelineWhereInput {
		return this.accessControl.configurationWhere(
			ctx.principal,
			CRM_RESOURCE.pipelines,
			action,
			includeGlobal,
		);
	}
}
