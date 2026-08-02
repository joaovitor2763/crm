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
	productCreateInput,
	productIdInput,
	productListInput,
	productUpdateInput,
} from "./products.contracts";
import { ProductsService } from "./products.service";

@Router({ alias: "products" })
@UseMiddlewares(AuthMiddleware)
export class ProductsRouter {
	constructor(
		@Inject(ProductsService) private readonly products: ProductsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: productListInput })
	list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof productListInput>,
	) {
		return this.products.list(
			input.includeArchived,
			this.scope(ctx, PermissionAction.READ, true),
		);
	}

	@Mutation({ input: productCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof productCreateInput>,
	) {
		const businessUnitId =
			input.businessUnitId ?? ctx.principal.primaryBusinessUnitId;
		await this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.products,
			PermissionAction.MANAGE,
			{ businessUnitId },
		);
		return this.products.create({ ...input, businessUnitId });
	}

	@Mutation({ input: productUpdateInput })
	update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof productUpdateInput>,
	) {
		return this.products.update(
			input,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: productIdInput })
	archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.products.archive(
			id,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: productIdInput })
	restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.products.restore(
			id,
			this.scope(ctx, PermissionAction.MANAGE, false),
		);
	}

	private scope(
		ctx: AuthedTrpcContext,
		action: PermissionAction,
		includeGlobal: boolean,
	): Prisma.ProductWhereInput {
		return this.accessControl.configurationWhere(
			ctx.principal,
			CRM_RESOURCE.products,
			action,
			includeGlobal,
		);
	}
}
