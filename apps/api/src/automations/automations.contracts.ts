import { AutomationStatus, LifecycleStage } from "@crm/db";
import { z } from "zod";

const eventTrigger = z.object({
	eventTypes: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
});

const condition = z.object({
	path: z.string().trim().min(1).max(240),
	operator: z.enum(["eq", "neq", "exists", "contains"]),
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
]);

export const automationCreateInput = z.object({
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(1000).nullable().optional(),
	roleId: z.string(),
	businessUnitId: z.string().nullable().optional(),
	teamId: z.string().nullable().optional(),
	trigger: eventTrigger,
	conditions: z.array(condition).max(50).default([]),
	actions: z.array(automationAction).min(1).max(20),
});

export const automationUpdateInput = automationCreateInput.partial().extend({
	id: z.string(),
	status: z.enum(AutomationStatus).optional(),
});

export const automationIdInput = z.object({ id: z.string() });

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
export type WebhookCreateInput = z.infer<typeof webhookCreateInput>;
export type WebhookUpdateInput = z.infer<typeof webhookUpdateInput>;
