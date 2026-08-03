import { ForbiddenException, Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	agentTaskIdInput,
	agentTaskListInput,
	aiConfigurationUpdateInput,
} from "./agent-admin.contracts";
import { AgentAdminService } from "./agent-admin.service";

@Router({ alias: "agentAdmin" })
@UseMiddlewares(AuthMiddleware)
export class AgentAdminRouter {
	constructor(
		@Inject(AgentAdminService) private readonly admin: AgentAdminService,
	) {}

	@Query()
	configuration(@Ctx() ctx: AuthedTrpcContext) {
		this.assertAdmin(ctx);
		return this.admin.configuration();
	}

	@Mutation({ input: aiConfigurationUpdateInput })
	updateConfiguration(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof aiConfigurationUpdateInput>,
	) {
		this.assertAdmin(ctx);
		return this.admin.updateConfiguration(input);
	}

	@Query({ input: agentTaskListInput })
	tasks(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentTaskListInput>,
	) {
		this.assertAdmin(ctx);
		return this.admin.tasks(input);
	}

	@Mutation({ input: agentTaskIdInput })
	retryTask(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		this.assertAdmin(ctx);
		return this.admin.retryTask(id);
	}

	@Mutation({ input: agentTaskIdInput })
	cancelTask(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		this.assertAdmin(ctx);
		return this.admin.cancelTask(id);
	}

	private assertAdmin(ctx: AuthedTrpcContext) {
		if (!ctx.principal.isAdmin) {
			throw new ForbiddenException("Only global administrators can manage AI.");
		}
	}
}
