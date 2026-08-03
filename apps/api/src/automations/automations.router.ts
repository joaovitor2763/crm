import { AutomationStatus, PermissionAction, type Prisma } from "@crm/db";
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
import { AUTOMATION_EVENT_CATALOG } from "./automation-events";
import {
	automationCreateInput,
	automationIdInput,
	automationUpdateInput,
	webhookCreateInput,
	webhookUpdateInput,
} from "./automations.contracts";
import { AutomationsService } from "./automations.service";

@Router({ alias: "automations" })
@UseMiddlewares(AuthMiddleware)
export class AutomationsRouter {
	constructor(
		@Inject(AutomationsService)
		private readonly automations: AutomationsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query()
	list(@Ctx() ctx: AuthedTrpcContext): Promise<AutomationListItem[]> {
		this.manage(ctx, CRM_RESOURCE.automations);
		return this.automations.list(this.automationScope(ctx, true));
	}

	@Query()
	eventCatalog() {
		return AUTOMATION_EVENT_CATALOG;
	}

	@Mutation({ input: automationCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationCreateInput>,
	): Promise<{ id: string }> {
		this.manage(ctx, CRM_RESOURCE.automations);
		const businessUnitId =
			input.businessUnitId === undefined
				? ctx.principal.primaryBusinessUnitId
				: input.businessUnitId;
		await this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.automations,
			PermissionAction.MANAGE,
			{ businessUnitId, teamId: input.teamId },
		);
		return this.automations.create({ ...input, businessUnitId }, ctx.principal);
	}

	@Mutation({ input: automationUpdateInput })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationUpdateInput>,
	): Promise<{ id: string }> {
		this.manage(ctx, CRM_RESOURCE.automations);
		return this.automations.update(
			input,
			this.automationScope(ctx, false),
			ctx.principal,
		);
	}

	@Mutation({ input: automationIdInput })
	archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationIdInput>,
	): Promise<{ id: string }> {
		this.manage(ctx, CRM_RESOURCE.automations);
		return this.automations.archive(input.id, this.automationScope(ctx, false));
	}

	@Query()
	webhooks(@Ctx() ctx: AuthedTrpcContext): Promise<WebhookListItem[]> {
		this.manage(ctx, CRM_RESOURCE.webhooks);
		return this.automations.listWebhooks(this.webhookScope(ctx, true));
	}

	@Mutation({ input: webhookCreateInput })
	async createWebhook(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof webhookCreateInput>,
	): Promise<{ id: string; secret: string; secretLastFour: string }> {
		this.manage(ctx, CRM_RESOURCE.webhooks);
		const businessUnitId =
			input.businessUnitId === undefined
				? ctx.principal.primaryBusinessUnitId
				: input.businessUnitId;
		await this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.webhooks,
			PermissionAction.MANAGE,
			{ businessUnitId, teamId: input.teamId },
		);
		return this.automations.createWebhook(
			{ ...input, businessUnitId },
			ctx.principal,
		);
	}

	@Mutation({ input: webhookUpdateInput })
	updateWebhook(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof webhookUpdateInput>,
	): Promise<{ id: string }> {
		this.manage(ctx, CRM_RESOURCE.webhooks);
		return this.automations.updateWebhook(input, this.webhookScope(ctx, false));
	}

	@Mutation({ input: automationIdInput })
	rotateWebhookSecret(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof automationIdInput>,
	) {
		this.manage(ctx, CRM_RESOURCE.webhooks);
		return this.automations.rotateWebhookSecret(
			input.id,
			this.webhookScope(ctx, false),
		);
	}

	private manage(ctx: AuthedTrpcContext, resource: string) {
		this.accessControl.assert(ctx.principal, resource, PermissionAction.MANAGE);
	}

	private automationScope(
		ctx: AuthedTrpcContext,
		includeGlobal: boolean,
	): Prisma.AutomationWhereInput {
		return this.accessControl.configurationWhere(
			ctx.principal,
			CRM_RESOURCE.automations,
			PermissionAction.MANAGE,
			includeGlobal,
		);
	}

	private webhookScope(
		ctx: AuthedTrpcContext,
		includeGlobal: boolean,
	): Prisma.WebhookEndpointWhereInput {
		return this.accessControl.configurationWhere(
			ctx.principal,
			CRM_RESOURCE.webhooks,
			PermissionAction.MANAGE,
			includeGlobal,
		);
	}
}

type AutomationListItem = {
	id: string;
	name: string;
	description: string | null;
	status: AutomationStatus;
	version: number;
	roleId: string;
	businessUnitId: string | null;
	teamId: string | null;
	trigger: unknown;
	conditions: unknown;
	actions: unknown;
	createdById: string;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	role: { id: string; name: string };
	businessUnit: { id: string; name: string } | null;
	team: { id: string; name: string } | null;
	_count: { runs: number };
};

type WebhookListItem = {
	id: string;
	name: string;
	url: string;
	eventTypes: unknown;
	isActive: boolean;
	secretVersion: number;
	secretLastFour: string;
	businessUnitId: string | null;
	teamId: string | null;
	createdById: string;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	_count: { deliveries: number };
};
