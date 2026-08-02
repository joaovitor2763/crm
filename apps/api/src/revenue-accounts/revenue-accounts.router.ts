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
	revenueAccountAssociationInput,
	revenueAccountConfigurationInput,
	revenueAccountCreateInput,
	revenueAccountIdInput,
	revenueAccountListInput,
	revenueAccountMergeInput,
	revenueAccountMergePreviewInput,
	revenueAccountUpdateArgs,
} from "./revenue-accounts.contracts";
import { RevenueAccountsService } from "./revenue-accounts.service";

@Router({ alias: "revenueAccounts" })
@UseMiddlewares(AuthMiddleware)
export class RevenueAccountsRouter {
	constructor(
		@Inject(RevenueAccountsService)
		private readonly accounts: RevenueAccountsService,
	) {}

	@Query()
	configuration(@Ctx() ctx: AuthedTrpcContext) {
		return this.accounts.configuration(ctx.principal);
	}

	@Mutation({ input: revenueAccountConfigurationInput })
	updateConfiguration(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountConfigurationInput>,
	) {
		return this.accounts.updateConfiguration(input, ctx.principal);
	}

	@Query({ input: revenueAccountListInput })
	list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountListInput>,
	) {
		return this.accounts.list(input, ctx.principal);
	}

	@Query({ input: revenueAccountIdInput })
	byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.accounts.byId(id, ctx.principal);
	}

	@Mutation({ input: revenueAccountCreateInput })
	create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountCreateInput>,
	) {
		return this.accounts.create(input, ctx.principal);
	}

	@Mutation({ input: revenueAccountUpdateArgs })
	update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountUpdateArgs>,
	) {
		return this.accounts.update(input, ctx.principal);
	}

	@Mutation({ input: revenueAccountIdInput })
	archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.accounts.archive(id, ctx.principal);
	}

	@Mutation({ input: revenueAccountAssociationInput })
	associate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountAssociationInput>,
	) {
		return this.accounts.associate(input, ctx.principal);
	}

	@Mutation({ input: revenueAccountAssociationInput })
	detach(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountAssociationInput>,
	) {
		return this.accounts.detach(input, ctx.principal);
	}

	@Query({ input: revenueAccountIdInput })
	history(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.accounts.history(id, ctx.principal);
	}

	@Query({ input: revenueAccountListInput })
	mergeCandidates(@Ctx() ctx: AuthedTrpcContext, @Input("q") q: string) {
		return this.accounts.mergeCandidates(q, ctx.principal);
	}

	@Query({ input: revenueAccountMergePreviewInput })
	mergePreview(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountMergePreviewInput>,
	) {
		return this.accounts.mergePreview(input, ctx.principal);
	}

	@Mutation({ input: revenueAccountMergeInput })
	merge(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revenueAccountMergeInput>,
	) {
		return this.accounts.merge(input, ctx.principal);
	}
}
