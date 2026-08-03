import { describe, expect, it } from "bun:test";
import {
	type AutomationWorkflow,
	automationWorkflow,
} from "../src/automations/automations.contracts";
import {
	legacyWorkflow,
	matchesRules,
	simulateWorkflow,
} from "../src/automations/workflow-engine";

describe("automation workflow engine", () => {
	it("takes the matching branch and preserves delays and actions", () => {
		const workflow: AutomationWorkflow = {
			version: 1,
			trigger: { eventTypes: ["lead.submitted"] },
			layout: {},
			steps: [
				{
					id: "paid-source",
					type: "condition",
					logic: "all",
					rules: [
						{ path: "payload.utmSource", operator: "eq", value: "google" },
						{ path: "payload.score", operator: "gte", value: 70 },
					],
					ifTrue: [
						{
							id: "wait-ten",
							type: "delay",
							duration: 10,
							unit: "minutes",
						},
						{
							id: "qualify",
							type: "action",
							action: {
								type: "set_lifecycle",
								lifecycleStage: "MQL",
							},
						},
					],
					ifFalse: [
						{
							id: "manual-task",
							type: "action",
							action: { type: "create_task", subject: "Review lead" },
						},
					],
				},
			],
		};

		const result = simulateWorkflow(workflow, {
			type: "lead.submitted",
			resource: "contacts",
			recordId: "contact-1",
			businessUnitId: "unit-1",
			teamId: null,
			payload: { utmSource: "Google", score: 80 },
		});

		expect(result.matchedTrigger).toBe(true);
		expect(result.trace.map((entry) => entry.nodeId)).toEqual([
			"paid-source",
			"wait-ten",
			"qualify",
		]);
		expect(result.trace[0]?.branch).toBe("true");
		expect(result.trace[1]?.status).toBe("WAITING");
		expect(result.trace[2]?.status).toBe("WOULD_RUN");
	});

	it("supports negative, collection and numeric operators", () => {
		const source = { payload: { source: "website", score: 42 } };
		expect(
			matchesRules(
				[
					{ path: "payload.source", operator: "not_in", value: ["spam"] },
					{ path: "payload.source", operator: "starts_with", value: "web" },
					{ path: "payload.score", operator: "lt", value: 100 },
				],
				"all",
				source,
			),
		).toBe(true);
	});

	it("upgrades legacy action lists to a versioned workflow", () => {
		const workflow = legacyWorkflow({
			trigger: { eventTypes: ["contact.created"] },
			conditions: [{ path: "payload.source", operator: "eq", value: "MANUAL" }],
			actions: [{ type: "archive_contact" }],
		});
		expect(workflow.version).toBe(1);
		expect(workflow.layout).toEqual({});
		expect(workflow.steps[0]?.type).toBe("condition");
	});

	it("persists positions only for nodes that belong to the workflow", () => {
		const input = {
			version: 1 as const,
			trigger: { eventTypes: ["lead.submitted"] },
			steps: [
				{
					id: "action",
					type: "action" as const,
					action: { type: "archive_contact" as const },
				},
			],
			layout: { action: { x: 240, y: 120 } },
		};
		expect(automationWorkflow.parse(input).layout).toEqual(input.layout);
		expect(() =>
			automationWorkflow.parse({
				...input,
				layout: { removed: { x: 0, y: 0 } },
			}),
		).toThrow("Workflow layout references unknown node removed.");
	});
});
