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
	marketingEventCreateInput,
	marketingEventUpdateInput,
	marketingFormCreateInput,
	marketingFormUpdateInput,
	marketingIdInput,
	marketingListInput,
} from "./marketing.contracts";
import { MarketingService } from "./marketing.service";

@Router({ alias: "marketing" })
@UseMiddlewares(AuthMiddleware)
export class MarketingRouter {
	constructor(
		@Inject(MarketingService) private readonly marketing: MarketingService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: marketingListInput })
	forms(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingListInput>,
	) {
		return this.marketing.forms(
			input.includeArchived,
			this.formScope(ctx, PermissionAction.READ, true),
		);
	}

	@Query({ input: marketingListInput })
	events(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingListInput>,
	) {
		return this.marketing.events(
			input.includeArchived,
			this.eventScope(ctx, PermissionAction.READ, true),
		);
	}

	@Mutation({ input: marketingFormCreateInput })
	createForm(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingFormCreateInput>,
	) {
		const businessUnitId =
			input.businessUnitId ?? ctx.principal.primaryBusinessUnitId;
		this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.marketingForms,
			PermissionAction.MANAGE,
			{ businessUnitId },
		);
		return this.marketing.createForm({ ...input, businessUnitId });
	}

	@Mutation({ input: marketingFormUpdateInput })
	updateForm(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingFormUpdateInput>,
	) {
		return this.marketing.updateForm(
			input,
			this.formScope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: marketingEventCreateInput })
	createEvent(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingEventCreateInput>,
	) {
		const businessUnitId =
			input.businessUnitId ?? ctx.principal.primaryBusinessUnitId;
		this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.marketingEvents,
			PermissionAction.MANAGE,
			{ businessUnitId },
		);
		return this.marketing.createEvent({ ...input, businessUnitId });
	}

	@Mutation({ input: marketingEventUpdateInput })
	updateEvent(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingEventUpdateInput>,
	) {
		return this.marketing.updateEvent(
			input,
			this.eventScope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: marketingIdInput })
	archiveForm(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.marketing.archiveForm(
			id,
			this.formScope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: marketingIdInput })
	restoreForm(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.marketing.restoreForm(
			id,
			this.formScope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: marketingIdInput })
	archiveEvent(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.marketing.archiveEvent(
			id,
			this.eventScope(ctx, PermissionAction.MANAGE, false),
		);
	}

	@Mutation({ input: marketingIdInput })
	restoreEvent(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.marketing.restoreEvent(
			id,
			this.eventScope(ctx, PermissionAction.MANAGE, false),
		);
	}

	private formScope(
		ctx: AuthedTrpcContext,
		action: PermissionAction,
		includeGlobal: boolean,
	): Prisma.MarketingFormWhereInput {
		return this.accessControl.configurationWhere(
			ctx.principal,
			CRM_RESOURCE.marketingForms,
			action,
			includeGlobal,
		);
	}

	private eventScope(
		ctx: AuthedTrpcContext,
		action: PermissionAction,
		includeGlobal: boolean,
	): Prisma.MarketingEventWhereInput {
		return this.accessControl.configurationWhere(
			ctx.principal,
			CRM_RESOURCE.marketingEvents,
			action,
			includeGlobal,
		);
	}
}
