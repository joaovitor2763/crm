import { db, PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";

const condition = z.object({
	id: z.string().min(1).max(80).optional(),
	path: z.string().min(1).max(240),
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

const action = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("set_lifecycle"),
		lifecycleStage: z.enum([
			"LEAD",
			"MQL",
			"SQL",
			"OPPORTUNITY",
			"CUSTOMER",
			"DISQUALIFIED",
		]),
		marketingScore: z.number().nullable().optional(),
		qualificationReason: z.string().nullable().optional(),
	}),
	z.object({
		type: z.literal("assign_contact"),
		ownerId: z.string().nullable().optional(),
		teamId: z.string().nullable().optional(),
	}),
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
			.refine((fields) => Object.keys(fields).length > 0),
	}),
	z.object({
		type: z.literal("create_task"),
		subject: z.string().min(1),
		body: z.string().nullable().optional(),
		dueInMinutes: z.number().int().min(0).nullable().optional(),
	}),
	z.object({
		type: z.literal("add_note"),
		subject: z.string().nullable().optional(),
		body: z.string().min(1),
	}),
	z.object({
		type: z.literal("move_deal"),
		stageId: z.string().min(1),
		closedReason: z.string().nullable().optional(),
	}),
	z.object({
		type: z.literal("update_deal"),
		fields: z
			.object({
				ownerId: z.string().min(1).optional(),
				amountCents: z.number().int().min(0).nullable().optional(),
				expectedCloseDate: z.string().nullable().optional(),
			})
			.refine((fields) => Object.keys(fields).length > 0),
	}),
	z.object({ type: z.literal("archive_contact") }),
	z.object({
		type: z.literal("emit_event"),
		eventType: z
			.string()
			.min(3)
			.max(120)
			.regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/),
		payload: z.record(z.string(), z.unknown()).default({}),
	}),
]);

type Step =
	| {
			id: string;
			type: "delay";
			label?: string;
			duration: number;
			unit: "minutes" | "hours" | "days";
	  }
	| {
			id: string;
			type: "action";
			label?: string;
			action: z.infer<typeof action>;
	  }
	| {
			id: string;
			type: "condition";
			label?: string;
			logic: "all" | "any";
			rules: z.infer<typeof condition>[];
			ifTrue: Step[];
			ifFalse: Step[];
	  };

const step: z.ZodType<Step> = z.lazy(() =>
	z.discriminatedUnion("type", [
		z.object({
			id: z.string().min(1).max(80),
			type: z.literal("delay"),
			label: z.string().max(160).optional(),
			duration: z.number().int().min(1).max(525_600),
			unit: z.enum(["minutes", "hours", "days"]),
		}),
		z.object({
			id: z.string().min(1).max(80),
			type: z.literal("action"),
			label: z.string().max(160).optional(),
			action,
		}),
		z.object({
			id: z.string().min(1).max(80),
			type: z.literal("condition"),
			label: z.string().max(160).optional(),
			logic: z.enum(["all", "any"]),
			rules: z.array(condition).min(1),
			ifTrue: z.array(step),
			ifFalse: z.array(step),
		}),
	]),
);

const inputSchema = z.object({
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(1000).nullable().optional(),
	roleId: z.string().min(1),
	businessUnitId: z.string().nullable(),
	workflow: z
		.object({
			version: z.literal(1),
			trigger: z.object({
				eventTypes: z
					.array(
						z.enum([
							"lead.submitted",
							"contact.created",
							"contact.became_mql",
							"contact.lifecycle_changed",
							"deal.created",
							"deal.stage_changed",
						]),
					)
					.min(1),
			}),
			steps: z.array(step).min(1).max(100),
		})
		.superRefine((workflow, context) => {
			const ids = new Set<string>();
			let count = 0;
			const visit = (steps: Step[]) => {
				for (const workflowStep of steps) {
					count += 1;
					if (ids.has(workflowStep.id)) {
						context.addIssue({
							code: "custom",
							message: `Duplicate workflow node id: ${workflowStep.id}`,
						});
					}
					ids.add(workflowStep.id);
					if (workflowStep.type === "condition") {
						visit(workflowStep.ifTrue);
						visit(workflowStep.ifFalse);
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
		}),
});

export default defineTool({
	description:
		"Return a complete editable CRM automation draft after reading the automation catalog. This never activates or saves anything. Use valid catalog IDs and short unique node IDs.",
	inputSchema,
	async execute(input, ctx) {
		const access = await crmAccess(ctx, PermissionAction.MANAGE, "automations");
		const stageIds = workflowActions(input.workflow.steps)
			.filter((workflowAction) => workflowAction.type === "move_deal")
			.map((workflowAction) => workflowAction.stageId);
		const [role, businessUnit, stages] = await Promise.all([
			db.role.findFirst({
				where: { id: input.roleId, archivedAt: null, isAdmin: false },
				select: { id: true },
			}),
			input.businessUnitId
				? db.businessUnit.findFirst({
						where: { id: input.businessUnitId, archivedAt: null },
						select: { id: true },
					})
				: null,
			db.pipelineStage.findMany({
				where: {
					id: { in: stageIds },
					pipeline: {
						archivedAt: null,
						...(access.isAdmin || access.isSystem
							? {}
							: {
									OR: [
										{ businessUnitId: null },
										{
											businessUnitId: {
												in: [...(access.businessUnitTreeIds ?? [])],
											},
										},
									],
								}),
					},
				},
				select: { id: true },
			}),
		]);
		if (!role)
			throw new Error(
				"Choose a valid non-admin execution role from the catalog.",
			);
		if (input.businessUnitId) {
			const allowed =
				Boolean(businessUnit) &&
				(access.isAdmin ||
					access.isSystem ||
					(access.businessUnitTreeIds ?? []).includes(input.businessUnitId));
			if (!allowed)
				throw new Error("That business unit is outside your CRM scope.");
		}
		if (
			new Set(stages.map((stage) => stage.id)).size !== new Set(stageIds).size
		) {
			throw new Error("Choose valid pipeline stage IDs from the live catalog.");
		}
		return { draft: input, saved: false, status: "DRAFT" as const };
	},
});

function workflowActions(steps: Step[]): z.infer<typeof action>[] {
	return steps.flatMap((workflowStep) =>
		workflowStep.type === "action"
			? [workflowStep.action]
			: workflowStep.type === "condition"
				? [
						...workflowActions(workflowStep.ifTrue),
						...workflowActions(workflowStep.ifFalse),
					]
				: [],
	);
}
