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
import {
	dealBoardInput,
	dealCreateInput,
	dealIdInput,
	dealLineItemCreateInput,
	dealLineItemIdInput,
	dealLineItemUpdateInput,
	dealListInput,
	dealUpdateArgs,
	setStageInput,
} from "./deals.contracts";
import { DealsService } from "./deals.service";

@Router({ alias: "deals" })
@UseMiddlewares(AuthMiddleware)
export class DealsRouter {
	constructor(
		@Inject(DealsService) private readonly deals: DealsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: dealListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealListInput>,
	) {
		return this.deals.list(input, this.readScope(ctx));
	}

	@Query({ input: dealIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.deals.byId(
			id,
			this.readScope(ctx),
			this.relatedCompanyScope(ctx),
			this.relatedContactScope(ctx),
		);
	}

	@Query()
	async archived(@Ctx() ctx: AuthedTrpcContext) {
		return this.deals.archived(this.readScope(ctx));
	}

	@Query({ input: dealBoardInput })
	async board(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealBoardInput>,
	) {
		return this.deals.board(
			input,
			this.readScope(ctx),
			this.accessControl.configurationWhere(
				ctx.principal,
				CRM_RESOURCE.pipelines,
				PermissionAction.READ,
				true,
			) as Prisma.PipelineWhereInput,
		);
	}

	@Mutation({ input: dealCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealCreateInput>,
	) {
		await this.accessControl.assertRecord(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
			input.companyId,
		);
		await this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.deals,
			PermissionAction.CREATE,
			{
				businessUnitId:
					input.businessUnitId ?? ctx.principal.primaryBusinessUnitId,
				teamId: input.teamId ?? ctx.principal.primaryTeamId,
				ownerId: input.ownerId,
			},
		);
		return this.deals.create(input);
	}

	@Mutation({ input: dealUpdateArgs })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealUpdateArgs>,
	) {
		const scope = this.writeScope(ctx);
		const assignment = await this.deals.assignment(input.id, scope);
		if (input.data.ownerId !== undefined) {
			await this.accessControl.assertAssignment(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.UPDATE,
				{ ...assignment, ownerId: input.data.ownerId },
			);
		}
		if (input.data.companyId !== undefined) {
			await this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
				input.data.companyId,
			);
		}
		return this.deals.update(input.id, input.data, scope);
	}

	/** Moves the deal and writes the `STAGE_CHANGE` activity in one transaction. */
	@Mutation({ input: setStageInput })
	async setStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setStageInput>,
	) {
		await this.deals.byId(input.id, this.writeScope(ctx));
		return this.deals.setStage(input, ctx.user.id);
	}

	@Mutation({ input: dealIdInput })
	archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.deals.archive(
			id,
			this.accessControl.dealWhere(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.ARCHIVE,
			),
		);
	}

	@Mutation({ input: dealIdInput })
	restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.deals.restore(
			id,
			this.accessControl.dealWhere(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.RESTORE,
			),
		);
	}

	@Mutation({ input: dealLineItemCreateInput })
	addLineItem(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealLineItemCreateInput>,
	) {
		return this.deals.addLineItem(input, this.writeScope(ctx));
	}

	@Mutation({ input: dealLineItemUpdateInput })
	updateLineItem(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealLineItemUpdateInput>,
	) {
		return this.deals.updateLineItem(input, this.writeScope(ctx));
	}

	@Mutation({ input: dealLineItemIdInput })
	removeLineItem(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.deals.removeLineItem(id, this.writeScope(ctx));
	}

	private readScope(ctx: AuthedTrpcContext) {
		return this.accessControl.dealWhere(
			ctx.principal,
			CRM_RESOURCE.deals,
			PermissionAction.READ,
		);
	}

	private writeScope(ctx: AuthedTrpcContext) {
		return this.accessControl.dealWhere(
			ctx.principal,
			CRM_RESOURCE.deals,
			PermissionAction.UPDATE,
		);
	}

	private relatedCompanyScope(
		ctx: AuthedTrpcContext,
	): Prisma.CompanyWhereInput {
		if (
			this.accessControl.permission(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
			) === AccessScope.NONE
		) {
			return { id: { in: [] } };
		}
		return this.accessControl.companyWhere(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
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
