import { describe, expect, it } from "bun:test";
import {
	buildWorkflowGraph,
	cleanWorkflowLayout,
	createWorkflowStep,
	findWorkflowStep,
	insertWorkflowStep,
	layoutWorkflowGraph,
	removeWorkflowStep,
} from "../app/(app)/settings/automation-flow-model";
import type { WorkflowStep } from "../app/(app)/settings/automation-workflow-builder";

const workflow: WorkflowStep[] = [
	{
		id: "condition",
		type: "condition",
		logic: "all",
		rules: [{ path: "payload.source", operator: "eq", value: "website" }],
		ifTrue: [
			{
				id: "yes-action",
				type: "action",
				action: { type: "set_lifecycle", lifecycleStage: "MQL" },
			},
		],
		ifFalse: [],
	},
	{ id: "delay", type: "delay", duration: 10, unit: "minutes" },
];

describe("automation visual workflow model", () => {
	it("maps nested branches into labelled graph edges that converge", () => {
		const graph = buildWorkflowGraph(workflow, "Lead submitted");
		expect(graph.nodes.map((node) => node.id)).toEqual([
			"workflow-trigger",
			"condition",
			"yes-action",
			"delay",
		]);
		expect(
			graph.edges.map(({ source, target, label }) => ({
				source,
				target,
				label,
			})),
		).toEqual([
			{ source: "workflow-trigger", target: "condition", label: undefined },
			{ source: "condition", target: "yes-action", label: "Yes" },
			{ source: "yes-action", target: "delay", label: undefined },
			{ source: "condition", target: "delay", label: "No" },
		]);
	});

	it("adds a dropped node to an explicit condition branch", () => {
		const action = createWorkflowStep("action");
		const next = insertWorkflowStep(workflow, action, "condition", "no");
		const condition = findWorkflowStep(next, "condition");
		expect(condition?.type).toBe("condition");
		if (condition?.type !== "condition") throw new Error("Missing condition");
		expect(condition.ifFalse.map((step) => step.id)).toEqual([action.id]);
		expect(condition.ifTrue.map((step) => step.id)).toEqual(["yes-action"]);
	});

	it("removes nested nodes and cleans their persisted positions", () => {
		const next = removeWorkflowStep(workflow, "condition");
		expect(next.map((step) => step.id)).toEqual(["delay"]);
		expect(
			cleanWorkflowLayout(
				{
					condition: { x: 1, y: 2 },
					"yes-action": { x: 3, y: 4 },
					delay: { x: 5, y: 6 },
				},
				next,
			),
		).toEqual({ delay: { x: 5, y: 6 } });
	});

	it("uses saved positions while automatically laying out new nodes", () => {
		const graph = buildWorkflowGraph(workflow, "Lead submitted");
		const positions = layoutWorkflowGraph(graph.nodes, graph.edges, {
			condition: { x: 120, y: 240 },
		});
		expect(positions.condition).toEqual({ x: 120, y: 240 });
		expect(Number.isFinite(positions.delay?.x)).toBe(true);
		expect(Number.isFinite(positions.delay?.y)).toBe(true);
	});
});
