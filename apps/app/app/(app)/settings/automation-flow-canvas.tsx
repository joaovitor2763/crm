"use client";

import Branch from "@carbon/icons-react/es/Branch";
import Flow from "@carbon/icons-react/es/Flow";
import TaskAdd from "@carbon/icons-react/es/TaskAdd";
import Time from "@carbon/icons-react/es/Time";
import { Button } from "@crm/ui/components/button";
import {
	WorkflowNode,
	WorkflowNodeBody,
	WorkflowNodeDescription,
	WorkflowNodeEyebrow,
	WorkflowNodeHeader,
	WorkflowNodeHeading,
	WorkflowNodeIcon,
	WorkflowNodeTitle,
} from "@crm/ui/components/workflow-node";
import {
	Background,
	BackgroundVariant,
	Controls,
	type Edge,
	Handle,
	MarkerType,
	MiniMap,
	type Node,
	type NodeChange,
	type NodeProps,
	Panel,
	Position,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import { useMemo } from "react";
import "@xyflow/react/dist/style.css";
import {
	buildWorkflowGraph,
	cleanWorkflowLayout,
	createWorkflowStep,
	findWorkflowStep,
	insertWorkflowStep,
	layoutWorkflowGraph,
	type WorkflowNodeKind,
	workflowTriggerNodeId,
} from "./automation-flow-model";
import type {
	WorkflowNodePosition,
	WorkflowStep,
} from "./automation-workflow-builder";

type WorkflowNodeData = Record<string, unknown> & {
	kind: WorkflowNodeKind;
	title: string;
	summary: string;
};
type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;
type NodeTemplate = "condition" | "delay" | "action";

const nodeTypes = { workflow: WorkflowCanvasNode };
const snapGrid: [number, number] = [16, 16];

export function AutomationFlowCanvas({
	steps,
	layout,
	eventLabel,
	selectedId,
	onSelect,
	onChange,
}: {
	steps: WorkflowStep[];
	layout: Record<string, WorkflowNodePosition>;
	eventLabel: string;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onChange: (
		steps: WorkflowStep[],
		layout: Record<string, WorkflowNodePosition>,
	) => void;
}) {
	return (
		<ReactFlowProvider>
			<WorkflowCanvasSurface
				steps={steps}
				layout={layout}
				eventLabel={eventLabel}
				selectedId={selectedId}
				onSelect={onSelect}
				onChange={onChange}
			/>
		</ReactFlowProvider>
	);
}

function WorkflowCanvasSurface({
	steps,
	layout,
	eventLabel,
	selectedId,
	onSelect,
	onChange,
}: {
	steps: WorkflowStep[];
	layout: Record<string, WorkflowNodePosition>;
	eventLabel: string;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onChange: (
		steps: WorkflowStep[],
		layout: Record<string, WorkflowNodePosition>,
	) => void;
}) {
	const flow = useReactFlow<WorkflowFlowNode, Edge>();
	const graph = useMemo(
		() => buildWorkflowGraph(steps, eventLabel),
		[steps, eventLabel],
	);
	const positions = useMemo(
		() => layoutWorkflowGraph(graph.nodes, graph.edges, layout),
		[graph, layout],
	);
	const selected = findWorkflowStep(steps, selectedId);
	const nodes: WorkflowFlowNode[] = graph.nodes.map((node) => ({
		id: node.id,
		type: "workflow",
		dragHandle: ".workflow-node-drag-handle",
		position: positions[node.id] ?? { x: 0, y: 0 },
		selected: node.id === selectedId,
		draggable: node.id !== workflowTriggerNodeId,
		data: {
			kind: node.kind,
			title: node.title,
			summary: node.summary,
		},
	}));
	const edges: Edge[] = graph.edges.map((edge) => ({
		...edge,
		type: "smoothstep",
		markerEnd: { type: MarkerType.ArrowClosed },
		selectable: false,
	}));

	const addNode = (
		type: NodeTemplate,
		position?: WorkflowNodePosition,
		branch?: "yes" | "no",
	) => {
		const step = createWorkflowStep(type);
		const nextSteps = insertWorkflowStep(steps, step, selectedId, branch);
		const nextLayout = cleanWorkflowLayout(
			position ? { ...layout, [step.id]: position } : layout,
			nextSteps,
		);
		onChange(nextSteps, nextLayout);
		onSelect(step.id);
	};

	const onNodesChange = (changes: NodeChange<WorkflowFlowNode>[]) => {
		let nextLayout = layout;
		for (const change of changes) {
			if (
				change.type !== "position" ||
				!change.position ||
				change.id === workflowTriggerNodeId
			)
				continue;
			nextLayout = { ...nextLayout, [change.id]: change.position };
		}
		if (nextLayout !== layout) onChange(steps, nextLayout);
	};

	return (
		<div className="grid min-h-[42rem] overflow-hidden lg:grid-cols-[12rem_minmax(0,1fr)]">
			<aside className="flex flex-col gap-4 border-r bg-muted/20 p-3">
				<div>
					<p className="font-medium text-sm">Nodes</p>
					<p className="text-muted-foreground text-xs/relaxed">
						Drag to the canvas or click to add after the selected node.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<PaletteButton
						icon={Branch}
						label="If / Else"
						type="condition"
						onAdd={() => addNode("condition")}
					/>
					<PaletteButton
						icon={Time}
						label="Delay"
						type="delay"
						onAdd={() => addNode("delay")}
					/>
					<PaletteButton
						icon={TaskAdd}
						label="Action"
						type="action"
						onAdd={() => addNode("action")}
					/>
				</div>
				{selected?.type === "condition" ? (
					<div className="flex flex-col gap-2 border-t pt-3">
						<p className="font-medium text-xs">Selected condition</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => addNode("action", undefined, "yes")}
						>
							Add action to Yes
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => addNode("action", undefined, "no")}
						>
							Add action to No
						</Button>
					</div>
				) : null}
				<div className="mt-auto border-t pt-3 text-muted-foreground text-xs/relaxed">
					Connections define execution order. Node positions are saved with the
					workflow.
				</div>
			</aside>
			<div className="min-h-[42rem] bg-background">
				<ReactFlow
					aria-label="Automation workflow canvas"
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					onNodesChange={onNodesChange}
					onNodeClick={(_, node) =>
						onSelect(node.id === workflowTriggerNodeId ? null : node.id)
					}
					onPaneClick={() => onSelect(null)}
					onDragOver={(event) => {
						event.preventDefault();
						event.dataTransfer.dropEffect = "move";
					}}
					onDrop={(event) => {
						event.preventDefault();
						const type = event.dataTransfer.getData(
							"application/x-crm-workflow-node",
						) as NodeTemplate;
						if (!isNodeTemplate(type)) return;
						addNode(
							type,
							flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
						);
					}}
					colorMode="system"
					fitView
					fitViewOptions={{ padding: 0.2 }}
					minZoom={0.25}
					maxZoom={1.8}
					snapToGrid
					snapGrid={snapGrid}
					nodesConnectable={false}
					edgesReconnectable={false}
					deleteKeyCode={null}
				>
					<Background variant={BackgroundVariant.Dots} gap={24} size={1} />
					<MiniMap pannable zoomable />
					<Controls showInteractive={false} />
					<Panel position="top-right">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								onChange(steps, {});
								requestAnimationFrame(
									() => void flow.fitView({ padding: 0.2 }),
								);
							}}
						>
							<Flow data-icon="inline-start" />
							Auto layout
						</Button>
					</Panel>
				</ReactFlow>
			</div>
		</div>
	);
}

function PaletteButton({
	icon: NodeIcon,
	label,
	type,
	onAdd,
}: {
	icon: typeof Branch;
	label: string;
	type: NodeTemplate;
	onAdd: () => void;
}) {
	return (
		<Button
			type="button"
			variant="outline"
			className="justify-start"
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData("application/x-crm-workflow-node", type);
				event.dataTransfer.effectAllowed = "move";
			}}
			onClick={onAdd}
		>
			<NodeIcon data-icon="inline-start" />
			{label}
		</Button>
	);
}

function WorkflowCanvasNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
	const NodeIcon =
		data.kind === "trigger"
			? Flow
			: data.kind === "condition"
				? Branch
				: data.kind === "delay"
					? Time
					: TaskAdd;
	return (
		<WorkflowNode kind={data.kind} selected={selected}>
			{data.kind !== "trigger" ? (
				<Handle type="target" position={Position.Left} className="size-3" />
			) : null}
			<WorkflowNodeHeader className="workflow-node-drag-handle">
				<WorkflowNodeIcon>
					<NodeIcon />
				</WorkflowNodeIcon>
				<WorkflowNodeHeading>
					<WorkflowNodeEyebrow>{data.kind}</WorkflowNodeEyebrow>
					<WorkflowNodeTitle>{data.title}</WorkflowNodeTitle>
				</WorkflowNodeHeading>
			</WorkflowNodeHeader>
			<WorkflowNodeBody>
				<WorkflowNodeDescription>{data.summary}</WorkflowNodeDescription>
			</WorkflowNodeBody>
			{data.kind === "condition" ? (
				<>
					<Handle
						id="yes"
						type="source"
						position={Position.Right}
						className="size-3"
						style={{ top: "38%" }}
					/>
					<Handle
						id="no"
						type="source"
						position={Position.Right}
						className="size-3"
						style={{ top: "74%" }}
					/>
				</>
			) : (
				<Handle type="source" position={Position.Right} className="size-3" />
			)}
		</WorkflowNode>
	);
}

function isNodeTemplate(value: string): value is NodeTemplate {
	return value === "condition" || value === "delay" || value === "action";
}
