import { z } from "zod";

export const aiConfigurationUpdateInput = z
	.object({
		apiKey: z.string().trim().min(10).max(500).optional(),
		clearApiKey: z.boolean().default(false),
		models: z.array(z.string().trim().min(3).max(160)).min(1).max(100),
		modelContextWindows: z.record(
			z.string().trim().min(3).max(160),
			z.number().int().min(8_192).max(4_000_000),
		),
		defaults: z.object({
			interactive: z.string().trim().min(3).max(160),
			research: z.string().trim().min(3).max(160),
			enrichment: z.string().trim().min(3).max(160),
		}),
	})
	.superRefine((input, context) => {
		for (const model of input.models) {
			if (input.modelContextWindows[model]) continue;
			context.addIssue({
				code: "custom",
				path: ["modelContextWindows", model],
				message: "Every approved model needs its context window in tokens.",
			});
		}
		for (const [workload, selected] of Object.entries(input.defaults)) {
			if (input.models.includes(selected)) continue;
			context.addIssue({
				code: "custom",
				path: ["defaults", workload],
				message: "The default model must be in the approved model list.",
			});
		}
	});

export const agentTaskListInput = z.object({
	status: z
		.enum(["all", "pending", "running", "finished", "failed"])
		.default("all"),
	q: z.string().trim().max(120).default(""),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
});

export const agentTaskIdInput = z.object({ id: z.string().min(1) });

export type AiConfigurationUpdateInput = z.infer<
	typeof aiConfigurationUpdateInput
>;
export type AgentTaskListInput = z.infer<typeof agentTaskListInput>;
