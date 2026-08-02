import { createHmac } from "node:crypto";
import {
	AutomationRunStatus,
	AutomationStatus,
	type Db,
	PermissionAction,
	type Prisma,
	WebhookDeliveryStatus,
} from "@crm/db";
import {
	BadRequestException,
	Inject,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import type { EnvironmentVariables } from "../config/env.validation";
import { ContactLifecycleService } from "../contacts/contact-lifecycle.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	AutomationCreateInput,
	AutomationUpdateInput,
	WebhookCreateInput,
	WebhookUpdateInput,
} from "./automations.contracts";

const LEASE_MS = 60_000;
const MAX_DEPTH = 10;
const MAX_ATTEMPTS = 8;
type DomainEvent = Prisma.DomainEventGetPayload<Record<string, never>>;

@Injectable()
export class AutomationsService {
	private readonly webhookMasterSecret?: string;

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(ContactLifecycleService)
		private readonly lifecycle: ContactLifecycleService,
		@Inject(ConfigService)
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.webhookMasterSecret = config.get("WEBHOOK_SIGNING_SECRET", {
			infer: true,
		});
	}

	list(scope: Prisma.AutomationWhereInput = {}) {
		return this.db.automation.findMany({
			where: { AND: [{ archivedAt: null }, scope] },
			orderBy: { createdAt: "desc" },
			include: {
				role: { select: { id: true, name: true } },
				businessUnit: { select: { id: true, name: true } },
				team: { select: { id: true, name: true } },
				_count: { select: { runs: true } },
			},
		});
	}

	async create(input: AutomationCreateInput, actor: EffectivePrincipal) {
		if (!actor.userId)
			throw new BadRequestException("A user must create automations.");
		await this.assertDelegateRole(input.roleId);
		return this.db.automation.create({
			data: {
				...input,
				description: input.description ?? null,
				businessUnitId: input.businessUnitId ?? null,
				teamId: input.teamId ?? null,
				trigger: toJson(input.trigger),
				conditions: toJson(input.conditions),
				actions: toJson(input.actions),
				createdById: actor.userId,
			},
		});
	}

	async update(
		input: AutomationUpdateInput,
		scope: Prisma.AutomationWhereInput = {},
	) {
		const { id } = input;
		const current = await this.db.automation.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true, version: true },
		});
		if (!current) throw new NotFoundException("Automation not found.");
		if (input.roleId) await this.assertDelegateRole(input.roleId);
		return this.db.automation.update({
			where: { id },
			data: {
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.description !== undefined
					? { description: input.description }
					: {}),
				...(input.status !== undefined ? { status: input.status } : {}),
				...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
				...(input.businessUnitId !== undefined
					? { businessUnitId: input.businessUnitId }
					: {}),
				...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
				...(input.trigger ? { trigger: toJson(input.trigger) } : {}),
				...(input.conditions ? { conditions: toJson(input.conditions) } : {}),
				...(input.actions ? { actions: toJson(input.actions) } : {}),
				version: current.version + 1,
			},
		});
	}

	async archive(id: string, scope: Prisma.AutomationWhereInput = {}) {
		await this.requireAutomation(id, scope);
		return this.db.automation.update({
			where: { id },
			data: { archivedAt: new Date(), status: AutomationStatus.PAUSED },
		});
	}

	listWebhooks(scope: Prisma.WebhookEndpointWhereInput = {}) {
		return this.db.webhookEndpoint.findMany({
			where: { AND: [{ archivedAt: null }, scope] },
			orderBy: { createdAt: "desc" },
			include: { _count: { select: { deliveries: true } } },
		});
	}

	async createWebhook(input: WebhookCreateInput, actor: EffectivePrincipal) {
		if (!actor.userId)
			throw new BadRequestException("A user must create webhooks.");
		this.requireWebhookSecret();
		const provisionalLastFour = "pending";
		const endpoint = await this.db.webhookEndpoint.create({
			data: {
				...input,
				eventTypes: input.eventTypes,
				secretLastFour: provisionalLastFour,
				createdById: actor.userId,
			},
		});
		const secret = this.endpointSecret(endpoint.id, endpoint.secretVersion);
		await this.db.webhookEndpoint.update({
			where: { id: endpoint.id },
			data: { secretLastFour: secret.slice(-4) },
		});
		return { ...endpoint, secretLastFour: secret.slice(-4), secret };
	}

	async updateWebhook(
		input: WebhookUpdateInput,
		scope: Prisma.WebhookEndpointWhereInput = {},
	) {
		await this.requireWebhook(input.id, scope);
		const { id, ...data } = input;
		return this.db.webhookEndpoint.update({
			where: { id },
			data: {
				...data,
				...(data.eventTypes ? { eventTypes: data.eventTypes } : {}),
			},
		});
	}

	async rotateWebhookSecret(
		id: string,
		scope: Prisma.WebhookEndpointWhereInput = {},
	) {
		this.requireWebhookSecret();
		await this.requireWebhook(id, scope);
		const endpoint = await this.db.webhookEndpoint.update({
			where: { id },
			data: { secretVersion: { increment: 1 } },
			select: { id: true, secretVersion: true },
		});
		const secret = this.endpointSecret(endpoint.id, endpoint.secretVersion);
		await this.db.webhookEndpoint.update({
			where: { id },
			data: { secretLastFour: secret.slice(-4) },
		});
		return { id, secret, secretLastFour: secret.slice(-4) };
	}

	async processBatch() {
		const events = await this.claimEvents(25);
		let queuedRuns = 0;
		let queuedDeliveries = 0;
		for (const event of events) {
			if (event.depth >= MAX_DEPTH) {
				await this.completeEvent(event.id);
				continue;
			}
			const [runs, deliveries] = await Promise.all([
				this.dispatchAutomations(event),
				this.dispatchWebhooks(event),
			]);
			queuedRuns += runs;
			queuedDeliveries += deliveries;
			await this.completeEvent(event.id);
		}

		const [automationRuns, webhookDeliveries] = await Promise.all([
			this.processAutomationRuns(25),
			this.processWebhookDeliveries(25),
		]);
		return {
			events: events.length,
			queuedRuns,
			queuedDeliveries,
			automationRuns,
			webhookDeliveries,
		};
	}

	private async claimEvents(limit: number) {
		const now = new Date();
		const candidates = await this.db.domainEvent.findMany({
			where: {
				completedAt: null,
				availableAt: { lte: now },
				OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
			},
			orderBy: { occurredAt: "asc" },
			take: limit,
		});
		const claimed: DomainEvent[] = [];
		for (const candidate of candidates) {
			const lease = new Date(Date.now() + LEASE_MS);
			const updated = await this.db.domainEvent.updateMany({
				where: {
					id: candidate.id,
					completedAt: null,
					OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
				},
				data: { leasedUntil: lease, attempts: { increment: 1 } },
			});
			if (updated.count === 1)
				claimed.push({ ...candidate, leasedUntil: lease });
		}
		return claimed;
	}

	private async dispatchAutomations(event: DomainEvent) {
		const candidates = await this.db.automation.findMany({
			where: {
				status: AutomationStatus.ACTIVE,
				archivedAt: null,
				AND: [
					{
						OR: [
							{ businessUnitId: null },
							{ businessUnitId: event.businessUnitId },
						],
					},
					{ OR: [{ teamId: null }, { teamId: event.teamId }] },
				],
			},
		});
		let queued = 0;
		for (const automation of candidates) {
			const trigger = automation.trigger as { eventTypes?: string[] };
			if (!trigger.eventTypes?.includes(event.type)) continue;
			if (!matchesConditions(automation.conditions, event)) continue;
			const result = await this.db.automationRun.createMany({
				data: [
					{
						automationId: automation.id,
						eventId: event.id,
						version: automation.version,
					},
				],
				skipDuplicates: true,
			});
			queued += result.count;
		}
		return queued;
	}

	private async dispatchWebhooks(event: DomainEvent) {
		const endpoints = await this.db.webhookEndpoint.findMany({
			where: {
				isActive: true,
				archivedAt: null,
				AND: [
					{
						OR: [
							{ businessUnitId: null },
							{ businessUnitId: event.businessUnitId },
						],
					},
					{ OR: [{ teamId: null }, { teamId: event.teamId }] },
				],
			},
		});
		const matching = endpoints.filter((endpoint) =>
			(endpoint.eventTypes as string[]).includes(event.type),
		);
		if (matching.length === 0) return 0;
		const result = await this.db.webhookDelivery.createMany({
			data: matching.map((endpoint) => ({
				endpointId: endpoint.id,
				eventId: event.id,
				eventType: event.type,
				payload: webhookPayload(event),
			})),
			skipDuplicates: true,
		});
		return result.count;
	}

	private async processAutomationRuns(limit: number) {
		const runs = await this.db.automationRun.findMany({
			where: {
				status: {
					in: [AutomationRunStatus.QUEUED, AutomationRunStatus.FAILED],
				},
				availableAt: { lte: new Date() },
				OR: [{ leasedUntil: null }, { leasedUntil: { lt: new Date() } }],
			},
			include: { automation: true, event: true },
			orderBy: { createdAt: "asc" },
			take: limit,
		});
		let processed = 0;
		for (const run of runs) {
			const claimed = await this.db.automationRun.updateMany({
				where: { id: run.id, status: run.status },
				data: {
					status: AutomationRunStatus.RUNNING,
					attempts: { increment: 1 },
					startedAt: new Date(),
					leasedUntil: new Date(Date.now() + LEASE_MS),
				},
			});
			if (claimed.count !== 1) continue;
			try {
				await this.executeActions(
					run.automation.id,
					run.automation.actions,
					run.event,
				);
				await this.db.automationRun.update({
					where: { id: run.id },
					data: {
						status: AutomationRunStatus.SUCCEEDED,
						finishedAt: new Date(),
						leasedUntil: null,
						output: { actions: (run.automation.actions as unknown[]).length },
					},
				});
			} catch (error) {
				const attempts = run.attempts + 1;
				await this.db.automationRun.update({
					where: { id: run.id },
					data: {
						status:
							attempts >= MAX_ATTEMPTS
								? AutomationRunStatus.DEAD
								: AutomationRunStatus.FAILED,
						availableAt: retryAt(attempts),
						leasedUntil: null,
						errorCode: safeErrorCode(error),
						finishedAt: new Date(),
					},
				});
			}
			processed += 1;
		}
		return processed;
	}

	private async executeActions(
		automationId: string,
		actionsJson: Prisma.JsonValue,
		event: DomainEvent,
	) {
		if (!event.recordId) throw new BadRequestException("Event has no record.");
		const principal = await this.accessControl.forAutomation(automationId);
		const actions = actionsJson as Array<{
			type: string;
			lifecycleStage?: Parameters<
				ContactLifecycleService["setLifecycle"]
			>[0]["lifecycleStage"];
			marketingScore?: number | null;
			qualificationReason?: string | null;
			ownerId?: string | null;
			teamId?: string | null;
		}>;
		for (const action of actions) {
			await this.accessControl.assertRecord(
				principal,
				"contacts",
				action.type === "archive_contact"
					? PermissionAction.ARCHIVE
					: PermissionAction.UPDATE,
				event.recordId,
			);
			if (action.type === "set_lifecycle" && action.lifecycleStage) {
				this.accessControl.assertAssignment(
					principal,
					"contacts",
					PermissionAction.UPDATE,
					{
						businessUnitId: event.businessUnitId,
						teamId: event.teamId,
					},
				);
				await this.lifecycle.setLifecycle(
					{
						contactId: event.recordId,
						businessUnitId:
							event.businessUnitId ?? principal.primaryBusinessUnitId ?? "",
						teamId: event.teamId,
						lifecycleStage: action.lifecycleStage,
						marketingScore: action.marketingScore,
						qualificationReason: action.qualificationReason,
					},
					principal,
					{ causationId: event.id, depth: event.depth + 1 },
				);
			} else if (action.type === "assign_contact") {
				this.accessControl.assertAssignment(
					principal,
					"contacts",
					PermissionAction.UPDATE,
					{
						businessUnitId: event.businessUnitId,
						teamId: action.teamId ?? event.teamId,
						ownerId: action.ownerId,
					},
				);
				await this.db.contactBusinessUnitState.update({
					where: {
						contactId_businessUnitId: {
							contactId: event.recordId,
							businessUnitId:
								event.businessUnitId ?? principal.primaryBusinessUnitId ?? "",
						},
					},
					data: { ownerId: action.ownerId, teamId: action.teamId },
				});
			} else if (action.type === "archive_contact") {
				this.accessControl.assert(
					principal,
					"contacts",
					PermissionAction.ARCHIVE,
				);
				await this.db.contact.update({
					where: { id: event.recordId },
					data: { archivedAt: new Date() },
				});
			}
		}
	}

	private async processWebhookDeliveries(limit: number) {
		if (!this.webhookMasterSecret) return 0;
		const deliveries = await this.db.webhookDelivery.findMany({
			where: {
				status: {
					in: [WebhookDeliveryStatus.PENDING, WebhookDeliveryStatus.FAILED],
				},
				availableAt: { lte: new Date() },
				OR: [{ leasedUntil: null }, { leasedUntil: { lt: new Date() } }],
			},
			include: { endpoint: true },
			orderBy: { createdAt: "asc" },
			take: limit,
		});
		let processed = 0;
		for (const delivery of deliveries) {
			const claimed = await this.db.webhookDelivery.updateMany({
				where: { id: delivery.id, status: delivery.status },
				data: {
					status: WebhookDeliveryStatus.LEASED,
					attempts: { increment: 1 },
					leasedUntil: new Date(Date.now() + LEASE_MS),
				},
			});
			if (claimed.count !== 1) continue;
			const body = JSON.stringify(delivery.payload);
			try {
				const response = await fetch(delivery.endpoint.url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-crm-event": delivery.eventType,
						"x-crm-delivery": delivery.id,
						"x-crm-signature": `sha256=${this.signature(delivery.endpoint.id, delivery.endpoint.secretVersion, body)}`,
					},
					body,
					signal: AbortSignal.timeout(10_000),
				});
				if (!response.ok) throw new Error(`HTTP_${response.status}`);
				await this.db.webhookDelivery.update({
					where: { id: delivery.id },
					data: {
						status: WebhookDeliveryStatus.SUCCEEDED,
						deliveredAt: new Date(),
						responseStatus: response.status,
						leasedUntil: null,
					},
				});
			} catch (error) {
				const attempts = delivery.attempts + 1;
				await this.db.webhookDelivery.update({
					where: { id: delivery.id },
					data: {
						status:
							attempts >= MAX_ATTEMPTS
								? WebhookDeliveryStatus.DEAD
								: WebhookDeliveryStatus.FAILED,
						availableAt: retryAt(attempts),
						leasedUntil: null,
						errorCode: safeErrorCode(error),
					},
				});
			}
			processed += 1;
		}
		return processed;
	}

	private completeEvent(id: string) {
		return this.db.domainEvent.update({
			where: { id },
			data: { completedAt: new Date(), leasedUntil: null },
		});
	}

	private async assertDelegateRole(roleId: string) {
		const role = await this.db.role.findFirst({
			where: { id: roleId, archivedAt: null },
			select: { id: true, isAdmin: true },
		});
		if (!role) throw new NotFoundException("Automation role not found.");
		if (role.isAdmin) {
			throw new BadRequestException(
				"Automations cannot execute as a global administrator.",
			);
		}
	}

	private async requireAutomation(
		id: string,
		scope: Prisma.AutomationWhereInput,
	) {
		const automation = await this.db.automation.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!automation) throw new NotFoundException("Automation not found.");
	}

	private async requireWebhook(
		id: string,
		scope: Prisma.WebhookEndpointWhereInput,
	) {
		const endpoint = await this.db.webhookEndpoint.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!endpoint) throw new NotFoundException("Webhook not found.");
	}

	private requireWebhookSecret() {
		if (!this.webhookMasterSecret) {
			throw new ServiceUnavailableException(
				"Set WEBHOOK_SIGNING_SECRET before creating webhooks.",
			);
		}
	}

	private endpointSecret(endpointId: string, version: number) {
		this.requireWebhookSecret();
		return createHmac("sha256", this.webhookMasterSecret as string)
			.update(`endpoint:${endpointId}:v${version}`)
			.digest("base64url");
	}

	private signature(endpointId: string, version: number, body: string) {
		return createHmac("sha256", this.endpointSecret(endpointId, version))
			.update(body)
			.digest("hex");
	}
}

function matchesConditions(
	conditionsJson: Prisma.JsonValue,
	event: DomainEvent,
) {
	const conditions = conditionsJson as Array<{
		path: string;
		operator: "eq" | "neq" | "exists" | "contains";
		value?: unknown;
	}>;
	const source = { event, payload: event.payload };
	return conditions.every((condition) => {
		const value = readPath(source, condition.path);
		if (condition.operator === "exists")
			return value !== undefined && value !== null;
		if (condition.operator === "eq") return value === condition.value;
		if (condition.operator === "neq") return value !== condition.value;
		return Array.isArray(value)
			? value.includes(condition.value)
			: String(value ?? "").includes(String(condition.value ?? ""));
	});
}

function readPath(source: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((current, segment) => {
		if (typeof current !== "object" || current === null) return undefined;
		return (current as Record<string, unknown>)[segment];
	}, source);
}

function webhookPayload(event: DomainEvent): Prisma.InputJsonObject {
	return {
		id: event.id,
		type: event.type,
		resource: event.resource,
		recordId: event.recordId,
		businessUnitId: event.businessUnitId,
		teamId: event.teamId,
		occurredAt: event.occurredAt.toISOString(),
		data: event.payload,
	};
}

function retryAt(attempts: number) {
	const seconds = Math.min(2 ** attempts * 30, 6 * 60 * 60);
	return new Date(Date.now() + seconds * 1000);
}

function safeErrorCode(error: unknown) {
	if (error instanceof Error) return error.message.slice(0, 160);
	return "UNKNOWN_ERROR";
}

function toJson(value: unknown): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
