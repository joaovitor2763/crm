import { AutomationStatus, LifecycleStage } from "@crm/db";
import { z } from "zod";

const eventTrigger = z.object({
	eventTypes: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
});

const condition = z.object({
	id: z.string().trim().min(1).max(80).optional(),
	path: z.string().trim().min(1).max(240),
	operator: z.enum([
		"eq",
		"neq",
		"exists",
		"not_exists",
		"contains",
		"not_contains",
		"starts_with",
		"ends_with",
		"gt",
		"gte",
		"lt",
		"lte",
		"in",
		"not_in",
	]),
	value: z.unknown().optional(),
});

const automationAction = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("set_lifecycle"),
		lifecycleStage: z.enum(LifecycleStage),
		marketingScore: z.number().finite().nullable().optional(),
		qualificationReason: z.string().trim().max(1000).nullable().optional(),
	}),
	z.object({
		type: z.literal("assign_contact"),
		ownerId: z.string().nullable().optional(),
		teamId: z.string().nullable().optional(),
	}),
	z.object({ type: z.literal("archive_contact") }),
	z.object({
		type: z.literal("update_contact"),
		fields: z
			.object({
				firstName: z.string().trim().min(1).max(160).optional(),
				lastName: z.string().trim().max(160).nullable().optional(),
				email: z.string().email().nullable().optional(),
				phone: z.string().trim().max(80).nullable().optional(),
				title: z.string().trim().max(240).nullable().optional(),
				ownerId: z.string().nullable().optional(),
			})
			.refine((fields) => Object.keys(fields).length > 0, {
				message: "Choose at least one contact field to update.",
			}),
	}),
	z.object({
		type: z.literal("create_task"),
		subject: z.string().trim().min(1).max(240),
		body: z.string().trim().max(4000).nullable().optional(),
		dueInMinutes: z.number().int().min(0).max(525_600).nullable().optional(),
	}),
	z.object({
		type: z.literal("add_note"),
		subject: z.string().trim().max(240).nullable().optional(),
		body: z.string().trim().min(1).max(4000),
	}),
	z.object({
		type: z.literal("move_deal"),
		stageId: z.string().min(1),
		closedReason: z.string().trim().max(1000).nullable().optional(),
	}),
	z.object({
		type: z.literal("update_deal"),
		fields: z
			.object({
				ownerId: z.string().min(1).optional(),
				amountCents: z.number().int().min(0).nullable().optional(),
				expectedCloseDate: z.string().nullable().optional(),
			})
			.refine((fields) => Object.keys(fields).length > 0, {
				message: "Choose at least one deal field to update.",
			}),
	}),
	z.object({
		type: z.literal("emit_event"),
		eventType: z
			.string()
			.trim()
			.min(3)
			.max(120)
			.regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/),
		payload: z.record(z.string(), z.unknown()).default({}),
	}),
]);

const workflowDelay = z.object({
	id: z.string().trim().min(1).max(80),
	type: z.literal("delay"),
	label: z.string().trim().max(160).optional(),
	duration: z.number().int().min(1).max(525_600),
	unit: z.enum(["minutes", "hours", "days"]),
});

const workflowAction = z.object({
	id: z.string().trim().min(1).max(80),
	type: z.literal("action"),
	label: z.string().trim().max(160).optional(),
	action: automationAction,
});

export type AutomationCondition = z.infer<typeof condition>;
export type AutomationAction = z.infer<typeof automationAction>;
export type WorkflowStep =
	| z.infer<typeof workflowDelay>
	| z.infer<typeof workflowAction>
	| {
			id: string;
			type: "condition";
			label?: string;
			logic: "all" | "any";
			rules: AutomationCondition[];
			ifTrue: WorkflowStep[];
			ifFalse: WorkflowStep[];
	  };

const workflowStep: z.ZodType<WorkflowStep> = z.lazy(() =>
	z.discriminatedUnion("type", [
		workflowDelay,
		workflowAction,
		z.object({
			id: z.string().trim().min(1).max(80),
			type: z.literal("condition"),
			label: z.string().trim().max(160).optional(),
			logic: z.enum(["all", "any"]).default("all"),
			rules: z.array(condition).min(1).max(20),
			ifTrue: z.array(workflowStep).max(100).default([]),
			ifFalse: z.array(workflowStep).max(100).default([]),
		}),
	]),
);

export const automationWorkflow = z
	.object({
		version: z.literal(1),
		trigger: eventTrigger,
		steps: z.array(workflowStep).min(1).max(100),
	})
	.superRefine((workflow, context) => {
		const ids = new Set<string>();
		let count = 0;
		const visit = (steps: WorkflowStep[]) => {
			for (const step of steps) {
				count += 1;
				if (ids.has(step.id)) {
					context.addIssue({
						code: "custom",
						message: `Workflow node id ${step.id} is duplicated.`,
					});
				}
				ids.add(step.id);
				if (step.type === "condition") {
					visit(step.ifTrue);
					visit(step.ifFalse);
				}
			}
		};
		visit(workflow.steps);
		if (count > 100) {
			context.addIssue({
				code: "custom",
				message: "A workflow can contain at most 100 nodes.",
			});
		}
	});

export const automationCreateInput = z.object({
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(1000).nullable().optional(),
	roleId: z.string(),
	businessUnitId: z.string().nullable().optional(),
	teamId: z.string().nullable().optional(),
	trigger: eventTrigger,
	conditions: z.array(condition).max(50).default([]),
	actions: z.array(automationAction).min(1).max(100),
	workflow: automationWorkflow.optional(),
});

export const automationUpdateInput = automationCreateInput.partial().extend({
	id: z.string(),
	status: z.enum(AutomationStatus).optional(),
});

export const automationIdInput = z.object({ id: z.string() });

export const automationRunsInput = z.object({
	id: z.string(),
	limit: z.number().int().min(1).max(50).default(20),
});

export const automationSimulateInput = z.object({
	workflow: automationWorkflow,
	event: z.object({
		type: z.string().trim().min(1).max(120),
		resource: z.string().trim().min(1).max(80).default("contacts"),
		recordId: z.string().nullable().default("example-record"),
		businessUnitId: z.string().nullable().default(null),
		teamId: z.string().nullable().default(null),
		payload: z.record(z.string(), z.unknown()).default({}),
	}),
});

export const webhookCreateInput = z.object({
	name: z.string().trim().min(1).max(160),
	url: z.url().refine((url) => url.startsWith("https://"), {
		message: "Production webhooks require HTTPS.",
	}),
	eventTypes: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
	businessUnitId: z.string().nullable().optional(),
	teamId: z.string().nullable().optional(),
});

export const webhookUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).max(160).optional(),
	url: z
		.url()
		.refine((url) => url.startsWith("https://"))
		.optional(),
	eventTypes: z
		.array(z.string().trim().min(1).max(120))
		.min(1)
		.max(100)
		.optional(),
	isActive: z.boolean().optional(),
});

export type AutomationCreateInput = z.infer<typeof automationCreateInput>;
export type AutomationUpdateInput = z.infer<typeof automationUpdateInput>;
export type AutomationWorkflow = z.infer<typeof automationWorkflow>;
export type AutomationSimulateInput = z.infer<typeof automationSimulateInput>;
export type WebhookCreateInput = z.infer<typeof webhookCreateInput>;
export type WebhookUpdateInput = z.infer<typeof webhookUpdateInput>;
