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
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	attributionEventInput,
	attributionHistoryInput,
	attributionProjectionInput,
} from "./attribution.contracts";
import { AttributionService } from "./attribution.service";

@Router({ alias: "attribution" })
@UseMiddlewares(AuthMiddleware)
export class AttributionRouter {
	constructor(
		@Inject(AttributionService)
		private readonly attribution: AttributionService,
	) {}

	@Mutation({ input: attributionEventInput })
	record(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof attributionEventInput>,
	) {
		return this.attribution.record(input, ctx.principal);
	}

	@Query({ input: attributionProjectionInput })
	projection(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof attributionProjectionInput>,
	) {
		return this.attribution.projection(input, ctx.principal);
	}

	@Query({ input: attributionHistoryInput })
	history(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof attributionHistoryInput>,
	) {
		return this.attribution.history(input, ctx.principal);
	}
}
