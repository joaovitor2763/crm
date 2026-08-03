import dagre from "@dagrejs/dagre";
import type {
	ActionStep,
	WorkflowNodePosition,
	WorkflowStep,
} from "./automation-workflow-builder";

export const workflowTriggerNodeId = "workflow-trigger";

export type WorkflowNodeKind = "trigger" | WorkflowStep["type"];
export type WorkflowGraphNode = {
	id: string;
	kind: WorkflowNodeKind;
	title: string;
	summary: string;
};
export type WorkflowGraphEdge = {
	id: string;
	source: string;
	target: string;
	sourceHandle?: "yes" | "no";
	label?: "Yes" | "No";
};

type Predecessor = {
	id: string;
	sourceHandle?: "yes" | "no";
	label?: "Yes" | "No";
};

const nodeWidth = 256;
const nodeHeight = 116;

export function buildWorkflowGraph(
	steps: WorkflowStep[],
	eventLabel: string,
): { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
	const nodes: WorkflowGraphNode[] = [
		{
			id: workflowTriggerNodeId,
			kind: "trigger",
			title: eventLabel,
			summary: "Starts the workflow when this event is emitted.",
		},
	];
	const edges: WorkflowGraphEdge[] = [];
	let edgeIndex = 0;

	const walk = (
		sequence: WorkflowStep[],
		predecessors: Predecessor[],
	): Predecessor[] => {
		let previous = predecessors;
		for (const step of sequence) {
			nodes.push({
				id: step.id,
				kind: step.type,
				title: workflowNodeTitle(step),
				summary: workflowNodeSummary(step),
			});
			for (const predecessor of previous) {
				edges.push({
					id: `workflow-edge-${edgeIndex++}`,
					source: predecessor.id,
					target: step.id,
					sourceHandle: predecessor.sourceHandle,
					label: predecessor.label,
				});
			}
			if (step.type !== "condition") {
				previous = [{ id: step.id }];
				continue;
			}
			const yesStart: Predecessor = {
				id: step.id,
				sourceHandle: "yes",
				label: "Yes",
			};
			const noStart: Predecessor = {
				id: step.id,
				sourceHandle: "no",
				label: "No",
			};
			const yesEnds =
				step.ifTrue.length > 0 ? walk(step.ifTrue, [yesStart]) : [yesStart];
			const noEnds =
				step.ifFalse.length > 0 ? walk(step.ifFalse, [noStart]) : [noStart];
			previous = [...yesEnds, ...noEnds];
		}
		return previous;
	};

	walk(steps, [{ id: workflowTriggerNodeId }]);
	return { nodes, edges };
}

export function layoutWorkflowGraph(
	nodes: WorkflowGraphNode[],
	edges: WorkflowGraphEdge[],
	saved: Record<string, WorkflowNodePosition>,
) {
	const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	graph.setGraph({
		rankdir: "LR",
		ranksep: 110,
		nodesep: 70,
		marginx: 48,
		marginy: 48,
	});
	for (const node of nodes)
		graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
	for (const edge of edges) graph.setEdge(edge.source, edge.target);
	dagre.layout(graph);

	return Object.fromEntries(
		nodes.map((node) => {
			const positioned = graph.node(node.id) as { x: number; y: number };
			return [
				node.id,
				saved[node.id] ?? {
					x: positioned.x - nodeWidth / 2,
					y: positioned.y - nodeHeight / 2,
				},
			];
		}),
	) as Record<string, WorkflowNodePosition>;
}

export function findWorkflowStep(
	steps: WorkflowStep[],
	id: string | null,
): WorkflowStep | null {
	if (!id) return null;
	for (const step of steps) {
		if (step.id === id) return step;
		if (step.type === "condition") {
			const nested =
				findWorkflowStep(step.ifTrue, id) ?? findWorkflowStep(step.ifFalse, id);
			if (nested) return nested;
		}
	}
	return null;
}

export function updateWorkflowStep(
	steps: WorkflowStep[],
	id: string,
	next: WorkflowStep,
): WorkflowStep[] {
	return steps.map((step) => {
		if (step.id === id) return next;
		if (step.type !== "condition") return step;
		return {
			...step,
			ifTrue: updateWorkflowStep(step.ifTrue, id, next),
			ifFalse: updateWorkflowStep(step.ifFalse, id, next),
		};
	});
}

export function removeWorkflowStep(
	steps: WorkflowStep[],
	id: string,
): WorkflowStep[] {
	return steps
		.filter((step) => step.id !== id)
		.map((step) =>
			step.type === "condition"
				? {
						...step,
						ifTrue: removeWorkflowStep(step.ifTrue, id),
						ifFalse: removeWorkflowStep(step.ifFalse, id),
					}
				: step,
		);
}

export function insertWorkflowStep(
	steps: WorkflowStep[],
	step: WorkflowStep,
	selectedId: string | null,
	branch?: "yes" | "no",
): WorkflowStep[] {
	if (!selectedId || selectedId === workflowTriggerNodeId)
		return [...steps, step];
	let inserted = false;
	const visit = (sequence: WorkflowStep[]): WorkflowStep[] => {
		const next: WorkflowStep[] = [];
		for (const candidate of sequence) {
			if (
				candidate.id === selectedId &&
				branch &&
				candidate.type === "condition"
			) {
				next.push({
					...candidate,
					ifTrue:
						branch === "yes" ? [...candidate.ifTrue, step] : candidate.ifTrue,
					ifFalse:
						branch === "no" ? [...candidate.ifFalse, step] : candidate.ifFalse,
				});
				inserted = true;
				continue;
			}
			const nested =
				candidate.type === "condition"
					? {
							...candidate,
							ifTrue: visit(candidate.ifTrue),
							ifFalse: visit(candidate.ifFalse),
						}
					: candidate;
			next.push(nested);
			if (candidate.id === selectedId && !inserted) {
				next.push(step);
				inserted = true;
			}
		}
		return next;
	};
	const result = visit(steps);
	return inserted ? result : [...steps, step];
}

export function createWorkflowStep(
	type: "condition" | "delay" | "action",
): WorkflowStep {
	if (type === "delay") {
		return { id: workflowNodeId(), type, duration: 10, unit: "minutes" };
	}
	if (type === "condition") {
		return {
			id: workflowNodeId(),
			type,
			logic: "all",
			rules: [defaultWorkflowRule()],
			ifTrue: [createWorkflowStep("action")],
			ifFalse: [],
		};
	}
	return {
		id: workflowNodeId(),
		type,
		action: {
			type: "set_lifecycle",
			lifecycleStage: "MQL",
			qualificationReason: "Matched workflow rules",
		},
	};
}

export function duplicateWorkflowStep(step: WorkflowStep): WorkflowStep {
	if (step.type === "condition") {
		return {
			...structuredClone(step),
			id: workflowNodeId(),
			rules: step.rules.map((rule) => ({ ...rule, id: workflowNodeId() })),
			ifTrue: step.ifTrue.map(duplicateWorkflowStep),
			ifFalse: step.ifFalse.map(duplicateWorkflowStep),
		};
	}
	return { ...structuredClone(step), id: workflowNodeId() };
}

export function collectWorkflowNodeIds(steps: WorkflowStep[]): Set<string> {
	const ids = new Set<string>();
	for (const step of steps) {
		ids.add(step.id);
		if (step.type === "condition") {
			for (const id of collectWorkflowNodeIds([
				...step.ifTrue,
				...step.ifFalse,
			]))
				ids.add(id);
		}
	}
	return ids;
}

export function cleanWorkflowLayout(
	layout: Record<string, WorkflowNodePosition>,
	steps: WorkflowStep[],
) {
	const ids = collectWorkflowNodeIds(steps);
	return Object.fromEntries(
		Object.entries(layout).filter(([id]) => ids.has(id)),
	) as Record<string, WorkflowNodePosition>;
}

export function defaultWorkflowRule() {
	return {
		id: workflowNodeId(),
		path: "payload.utmSource",
		operator: "eq" as const,
		value: "google",
	};
}

export function workflowNodeId() {
	return `node-${crypto.randomUUID()}`;
}

export function workflowNodeTitle(step: WorkflowStep) {
	if (step.label) return step.label;
	if (step.type === "condition") return "Condition";
	if (step.type === "delay") return "Wait";
	return actionTitle(step);
}

export function workflowNodeSummary(step: WorkflowStep) {
	if (step.type === "condition") {
		return `${step.logic === "all" ? "All" : "Any"} of ${step.rules.length} rule${step.rules.length === 1 ? "" : "s"} must match`;
	}
	if (step.type === "delay") {
		return `${step.duration} ${step.unit}`;
	}
	const action = step.action;
	switch (action.type) {
		case "set_lifecycle":
			return `Set lifecycle to ${action.lifecycleStage}`;
		case "assign_contact":
			return "Assign the triggering contact";
		case "update_contact":
			return "Update contact fields";
		case "create_task":
			return action.subject;
		case "add_note":
			return action.subject ?? "Add a timeline note";
		case "move_deal":
			return "Move deal to another stage";
		case "update_deal":
			return "Update deal fields";
		case "archive_contact":
			return "Archive the triggering contact";
		case "emit_event":
			return `Emit ${action.eventType}`;
	}
}

function actionTitle(step: ActionStep) {
	return step.action.type
		.split("_")
		.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}
