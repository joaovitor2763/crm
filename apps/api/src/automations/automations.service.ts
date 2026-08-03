import { createHmac, randomUUID } from "node:crypto";
import {
	ActivityType,
	AutomationRunStatus,
	AutomationStatus,
	type Db,
	PermissionAction,
	Prisma,
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
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { ActivitiesService } from "../activities/activities.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { ContactLifecycleService } from "../contacts/contact-lifecycle.service";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "../deals/deals.service";
import type {
	AutomationCreateInput,
	AutomationSimulateInput,
	AutomationUpdateInput,
	AutomationWorkflow,
	WebhookCreateInput,
	WebhookUpdateInput,
	WorkflowStep,
} from "./automations.contracts";
import { automationWorkflow } from "./automations.contracts";
import { assertPublicWebhookUrl, postPublicWebhook } from "./webhook-url";
import {
	delayUntil,
	legacyWorkflow,
	matchesRules,
	simulateWorkflow,
	type WorkflowState,
	type WorkflowTraceEntry,
} from "./workflow-engine";

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
		@Inject(ActivitiesService)
		private readonly activities: ActivitiesService,
		@Inject(DealsService)
		private readonly deals: DealsService,
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
				runs: {
					orderBy: { createdAt: "desc" },
					take: 1,
					select: {
						id: true,
						status: true,
						availableAt: true,
						finishedAt: true,
						errorCode: true,
						updatedAt: true,
					},
				},
			},
		});
	}

	runs(id: string, limit: number, scope: Prisma.AutomationWhereInput = {}) {
		return this.db.automationRun.findMany({
			where: { automationId: id, automation: scope },
			orderBy: { createdAt: "desc" },
			take: limit,
			select: {
				id: true,
				version: true,
				status: true,
				attempts: true,
				availableAt: true,
				startedAt: true,
				finishedAt: true,
				errorCode: true,
				output: true,
				trace: true,
				createdAt: true,
				event: {
					select: {
						id: true,
						type: true,
						resource: true,
						recordId: true,
						occurredAt: true,
					},
				},
			},
		});
	}

	simulate(input: AutomationSimulateInput) {
		return simulateWorkflow(input.workflow, input.event);
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
				workflow: input.workflow ? toJson(input.workflow) : undefined,
				createdById: actor.userId,
			},
		});
	}

	async update(
		input: AutomationUpdateInput,
		scope: Prisma.AutomationWhereInput = {},
		actor: EffectivePrincipal,
	) {
		const { id } = input;
		const current = await this.db.automation.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				version: true,
				businessUnitId: true,
				teamId: true,
			},
		});
		if (!current) throw new NotFoundException("Automation not found.");
		await this.accessControl.assertAssignment(
			actor,
			CRM_RESOURCE.automations,
			PermissionAction.MANAGE,
			{
				businessUnitId:
					input.businessUnitId !== undefined
						? input.businessUnitId
						: current.businessUnitId,
				teamId: input.teamId !== undefined ? input.teamId : current.teamId,
			},
		);
		if (input.roleId) await this.assertDelegateRole(input.roleId);
		const legacyDefinitionChanged = Boolean(
			input.trigger || input.conditions || input.actions,
		);
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
				...(input.workflow !== undefined
					? { workflow: toJson(input.workflow) }
					: legacyDefinitionChanged
						? { workflow: Prisma.DbNull }
						: {}),
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
			include: {
				_count: { select: { deliveries: true } },
				deliveries: {
					orderBy: { createdAt: "desc" },
					take: 1,
					select: {
						status: true,
						responseStatus: true,
						errorCode: true,
						deliveredAt: true,
						updatedAt: true,
					},
				},
			},
		});
	}

	async createWebhook(input: WebhookCreateInput, actor: EffectivePrincipal) {
		if (!actor.userId)
			throw new BadRequestException("A user must create webhooks.");
		this.requireWebhookSecret();
		await assertPublicWebhookUrl(input.url);
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
		if (input.url) await assertPublicWebhookUrl(input.url);
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

	async testWebhook(id: string, scope: Prisma.WebhookEndpointWhereInput = {}) {
		this.requireWebhookSecret();
		const endpoint = await this.db.webhookEndpoint.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				url: true,
				secretVersion: true,
				businessUnitId: true,
				teamId: true,
			},
		});
		if (!endpoint) throw new NotFoundException("Webhook not found.");

		const deliveryId = `test_${randomUUID()}`;
		const testedAt = new Date();
		const eventType = "webhook.test";
		const body = JSON.stringify({
			id: deliveryId,
			type: eventType,
			resource: "webhooks",
			recordId: endpoint.id,
			businessUnitId: endpoint.businessUnitId,
			teamId: endpoint.teamId,
			occurredAt: testedAt.toISOString(),
			data: {
				test: true,
				note: "Manual test delivery from CRM settings.",
			},
		});
		const startedAt = Date.now();
		try {
			const response = await postPublicWebhook(endpoint.url, {
				headers: {
					"content-type": "application/json",
					"x-crm-event": eventType,
					"x-crm-delivery": deliveryId,
					"x-crm-signature": `sha256=${this.signature(
						endpoint.id,
						endpoint.secretVersion,
						body,
					)}`,
				},
				body,
				signal: AbortSignal.timeout(10_000),
			});
			return {
				status: response.ok
					? WebhookDeliveryStatus.SUCCEEDED
					: WebhookDeliveryStatus.FAILED,
				responseStatus: response.status,
				errorCode: response.ok ? null : `HTTP_${response.status}`,
				durationMs: Date.now() - startedAt,
				testedAt: testedAt.toISOString(),
				eventType,
			};
		} catch (error) {
			return {
				status: WebhookDeliveryStatus.FAILED,
				responseStatus: null,
				errorCode: safeErrorCode(error),
				durationMs: Date.now() - startedAt,
				testedAt: testedAt.toISOString(),
				eventType,
			};
		}
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
			const workflow = this.workflowFor(automation);
			const trigger = workflow.trigger;
			if (!trigger.eventTypes?.includes(event.type)) continue;
			const result = await this.db.automationRun.createMany({
				data: [
					{
						automationId: automation.id,
						eventId: event.id,
						version: automation.version,
						workflow: toJson(workflow),
						state: toJson({ pending: workflow.steps }),
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
					in: [
						AutomationRunStatus.QUEUED,
						AutomationRunStatus.WAITING,
						AutomationRunStatus.FAILED,
					],
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
					attempts:
						run.status === AutomationRunStatus.WAITING
							? run.attempts
							: { increment: 1 },
					startedAt: run.startedAt ?? new Date(),
					finishedAt: null,
					leasedUntil: new Date(Date.now() + LEASE_MS),
				},
			});
			if (claimed.count !== 1) continue;
			try {
				await this.executeWorkflow(run);
			} catch (error) {
				const attempts = run.attempts + 1;
				await this.db.automationRun.update({
					where: { id: run.id },
					data: {
						attempts,
						status:
							attempts >= MAX_ATTEMPTS
								? AutomationRunStatus.DEAD
								: AutomationRunStatus.FAILED,
						availableAt: retryAt(attempts),
						leasedUntil: null,
						errorCode: safeErrorCode(error),
						finishedAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
					},
				});
			}
			processed += 1;
		}
		return processed;
	}

	private async executeWorkflow(
		run: Prisma.AutomationRunGetPayload<{
			include: { automation: true; event: true };
		}>,
	) {
		const workflow = run.workflow
			? automationWorkflow.parse(run.workflow)
			: this.workflowFor(run.automation);
		const state = (run.state as WorkflowState | null) ?? {
			pending: structuredClone(workflow.steps),
		};
		const trace = (run.trace as WorkflowTraceEntry[]) ?? [];
		const principal = await this.accessControl.forAutomation(run.automation.id);
		const record = await this.recordContext(run.event);
		const source = { event: run.event, payload: run.event.payload, record };
		let executedActions = trace.filter(
			(entry) => entry.type === "action" && entry.status === "SUCCEEDED",
		).length;

		while (state.pending.length > 0) {
			if (trace.length >= 100) {
				throw new BadRequestException("Workflow exceeded the 100-node limit.");
			}
			const step = state.pending[0];
			if (!step) break;
			const startedAt = new Date();
			if (step.type === "condition") {
				const matched = matchesRules(step.rules, step.logic, source);
				state.pending.shift();
				state.pending.unshift(
					...structuredClone(matched ? step.ifTrue : step.ifFalse),
				);
				trace.push({
					nodeId: step.id,
					type: step.type,
					label: step.label ?? null,
					status: "SUCCEEDED",
					branch: matched ? "true" : "false",
					startedAt: startedAt.toISOString(),
					finishedAt: new Date().toISOString(),
				});
				await this.saveRunProgress(run.id, state, trace);
				continue;
			}
			if (step.type === "delay") {
				state.pending.shift();
				const availableAt = delayUntil(step.duration, step.unit);
				trace.push({
					nodeId: step.id,
					type: step.type,
					label: step.label ?? null,
					status: "WAITING",
					availableAt: availableAt.toISOString(),
					startedAt: startedAt.toISOString(),
					finishedAt: new Date().toISOString(),
				});
				await this.db.automationRun.update({
					where: { id: run.id },
					data: {
						status: AutomationRunStatus.WAITING,
						availableAt,
						leasedUntil: null,
						state: toJson(state),
						trace: toJson(trace),
						output: { executedActions, pendingNodes: state.pending.length },
					},
				});
				return;
			}

			await this.executeAction(
				run.automation,
				step,
				run.event,
				principal,
				run.id,
			);
			state.pending.shift();
			executedActions += 1;
			trace.push({
				nodeId: step.id,
				type: step.type,
				label: step.label ?? null,
				status: "SUCCEEDED",
				startedAt: startedAt.toISOString(),
				finishedAt: new Date().toISOString(),
				output: { action: step.action.type },
			});
			await this.saveRunProgress(run.id, state, trace);
		}

		await this.db.automationRun.update({
			where: { id: run.id },
			data: {
				status: AutomationRunStatus.SUCCEEDED,
				finishedAt: new Date(),
				leasedUntil: null,
				state: toJson(state),
				trace: toJson(trace),
				output: { executedActions, pendingNodes: 0 },
				errorCode: null,
			},
		});
	}

	private async executeAction(
		automation: Prisma.AutomationGetPayload<Record<string, never>>,
		step: Extract<WorkflowStep, { type: "action" }>,
		event: DomainEvent,
		principal: EffectivePrincipal,
		runId: string,
	) {
		if (!event.recordId) throw new BadRequestException("Event has no record.");
		const action = step.action;
		if (
			action.type === "set_lifecycle" ||
			action.type === "assign_contact" ||
			action.type === "archive_contact" ||
			action.type === "update_contact"
		) {
			this.assertResource(event, "contacts");
			await this.accessControl.assertRecord(
				principal,
				"contacts",
				action.type === "archive_contact"
					? PermissionAction.ARCHIVE
					: PermissionAction.UPDATE,
				event.recordId,
			);
			if (action.type === "set_lifecycle") {
				await this.accessControl.assertAssignment(
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
				await this.accessControl.assertAssignment(
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
			} else if (action.type === "update_contact") {
				if (action.fields.ownerId !== undefined) {
					await this.accessControl.assertAssignment(
						principal,
						"contacts",
						PermissionAction.UPDATE,
						{
							businessUnitId: event.businessUnitId,
							teamId: event.teamId,
							ownerId: action.fields.ownerId,
						},
					);
				}
				await this.db.contact.update({
					where: { id: event.recordId },
					data: action.fields,
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
			return;
		}

		if (action.type === "move_deal" || action.type === "update_deal") {
			this.assertResource(event, "deals");
			await this.accessControl.assertRecord(
				principal,
				"deals",
				PermissionAction.UPDATE,
				event.recordId,
			);
			if (action.type === "move_deal") {
				await this.deals.setStage(
					{
						id: event.recordId,
						stageId: action.stageId,
						closedReason: action.closedReason ?? undefined,
					},
					automation.createdById,
					principal.roleKey,
					{
						actorType: principal.actorType,
						actorId: principal.actorId,
						causationId: event.id,
						depth: event.depth + 1,
					},
				);
			} else {
				if (action.fields.ownerId) {
					await this.accessControl.assertAssignment(
						principal,
						"deals",
						PermissionAction.UPDATE,
						{
							businessUnitId: event.businessUnitId,
							teamId: event.teamId,
							ownerId: action.fields.ownerId,
						},
					);
				}
				await this.deals.update(
					event.recordId,
					action.fields,
					this.accessControl.dealWhere(
						principal,
						"deals",
						PermissionAction.UPDATE,
					),
				);
			}
			return;
		}

		if (action.type === "create_task" || action.type === "add_note") {
			const existing = await this.db.activity.findFirst({
				where: {
					AND: [
						{ meta: { path: ["automationRunId"], equals: runId } },
						{ meta: { path: ["automationNodeId"], equals: step.id } },
					],
				},
				select: { id: true },
			});
			if (existing) return;
			const anchor = this.eventAnchor(event);
			const resource = this.recordResource(event);
			await this.accessControl.assertRecord(
				principal,
				resource,
				PermissionAction.READ,
				event.recordId,
			);
			await this.accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.activities,
				PermissionAction.CREATE,
				{ businessUnitId: event.businessUnitId, teamId: event.teamId },
			);
			await this.activities.create(
				{
					type:
						action.type === "create_task"
							? ActivityType.TASK
							: ActivityType.NOTE,
					subject:
						action.type === "create_task"
							? action.subject
							: (action.subject ?? undefined),
					body: action.body ?? undefined,
					...(action.type === "create_task" && action.dueInMinutes != null
						? {
								dueAt: new Date(
									Date.now() + action.dueInMinutes * 60_000,
								).toISOString(),
							}
						: {}),
					...anchor,
				},
				automation.createdById,
				{
					businessUnitId:
						event.businessUnitId ?? principal.primaryBusinessUnitId ?? "",
					teamId: event.teamId,
				},
				{ automationRunId: runId, automationNodeId: step.id },
			);
			return;
		}

		if (action.type === "emit_event") {
			await this.db.domainEvent.create({
				data: {
					eventKey: `automation:${runId}:${step.id}`,
					type: action.eventType,
					resource: event.resource,
					recordId: event.recordId,
					businessUnitId: event.businessUnitId,
					teamId: event.teamId,
					actorType: principal.actorType,
					actorId: principal.actorId,
					payload: toJson(action.payload),
					causationId: event.id,
					depth: event.depth + 1,
				},
			});
		}
	}

	private workflowFor(automation: {
		workflow: Prisma.JsonValue | null;
		trigger: Prisma.JsonValue;
		conditions: Prisma.JsonValue;
		actions: Prisma.JsonValue;
	}): AutomationWorkflow {
		return automation.workflow
			? automationWorkflow.parse(automation.workflow)
			: legacyWorkflow(automation);
	}

	private saveRunProgress(
		id: string,
		state: WorkflowState,
		trace: WorkflowTraceEntry[],
	) {
		return this.db.automationRun.update({
			where: { id },
			data: { state: toJson(state), trace: toJson(trace) },
		});
	}

	private async recordContext(event: DomainEvent) {
		if (!event.recordId) return null;
		if (event.resource === "contacts") {
			return this.db.contact.findUnique({
				where: { id: event.recordId },
				include: {
					unitStates: event.businessUnitId
						? { where: { businessUnitId: event.businessUnitId }, take: 1 }
						: false,
				},
			});
		}
		if (event.resource === "deals") {
			return this.db.deal.findUnique({
				where: { id: event.recordId },
				include: { stage: true, pipeline: true, company: true },
			});
		}
		if (event.resource === "companies") {
			return this.db.company.findUnique({ where: { id: event.recordId } });
		}
		return null;
	}

	private assertResource(event: DomainEvent, resource: string) {
		if (event.resource !== resource) {
			throw new BadRequestException(
				`This action requires a ${resource} event, received ${event.resource}.`,
			);
		}
	}

	private eventAnchor(event: DomainEvent) {
		if (event.resource === "contacts")
			return { contactId: event.recordId ?? undefined };
		if (event.resource === "companies")
			return { companyId: event.recordId ?? undefined };
		if (event.resource === "deals")
			return { dealId: event.recordId ?? undefined };
		throw new BadRequestException(
			"Tasks and notes require a CRM record event.",
		);
	}

	private recordResource(
		event: DomainEvent,
	): "contacts" | "companies" | "deals" {
		if (
			event.resource === "contacts" ||
			event.resource === "companies" ||
			event.resource === "deals"
		) {
			return event.resource;
		}
		throw new BadRequestException(
			"This event is not attached to a CRM record.",
		);
	}

	private async processWebhookDeliveries(limit: number) {
		if (!this.webhookMasterSecret) return 0;
		const deliveries = await this.db.webhookDelivery.findMany({
			where: {
				endpoint: { isActive: true },
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
				where: {
					id: delivery.id,
					status: delivery.status,
					endpoint: { isActive: true },
				},
				data: {
					status: WebhookDeliveryStatus.LEASED,
					attempts: { increment: 1 },
					leasedUntil: new Date(Date.now() + LEASE_MS),
				},
			});
			if (claimed.count !== 1) continue;
			const body = JSON.stringify(delivery.payload);
			try {
				const response = await postPublicWebhook(delivery.endpoint.url, {
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
