"use client";

import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import type { EveMessage } from "eve/react";
import { useEveAgent } from "eve/react";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Overview = RouterOutputs["governance"]["directory"];
type EventCatalog = ReadonlyArray<
	RouterOutputs["automations"]["eventCatalog"][number]
>;
type Pipelines = RouterOutputs["pipelines"]["list"];
type RuleOperator =
	| "eq"
	| "neq"
	| "exists"
	| "not_exists"
	| "contains"
	| "not_contains"
	| "starts_with"
	| "ends_with"
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "in"
	| "not_in";
type Rule = {
	id?: string;
	path: string;
	operator: RuleOperator;
	value?: unknown;
};
type AutomationAction =
	| {
			type: "set_lifecycle";
			lifecycleStage: (typeof lifecycleStages)[number];
			marketingScore?: number | null;
			qualificationReason?: string | null;
	  }
	| { type: "assign_contact"; ownerId?: string | null; teamId?: string | null }
	| { type: "archive_contact" }
	| {
			type: "update_contact";
			fields: {
				firstName?: string;
				lastName?: string | null;
				email?: string | null;
				phone?: string | null;
				title?: string | null;
				ownerId?: string | null;
			};
	  }
	| {
			type: "create_task";
			subject: string;
			body?: string | null;
			dueInMinutes?: number | null;
	  }
	| { type: "add_note"; subject?: string | null; body: string }
	| { type: "move_deal"; stageId: string; closedReason?: string | null }
	| {
			type: "update_deal";
			fields: {
				ownerId?: string;
				amountCents?: number | null;
				expectedCloseDate?: string | null;
			};
	  }
	| { type: "emit_event"; eventType: string; payload: Record<string, unknown> };
export type AutomationWorkflowDraft = {
	version: 1;
	trigger: { eventTypes: string[] };
	steps: WorkflowStep[];
};
type WorkflowStep =
	| {
			id: string;
			type: "delay";
			label?: string;
			duration: number;
			unit: "minutes" | "hours" | "days";
	  }
	| { id: string; type: "action"; label?: string; action: AutomationAction }
	| {
			id: string;
			type: "condition";
			label?: string;
			logic: "all" | "any";
			rules: Rule[];
			ifTrue: WorkflowStep[];
			ifFalse: WorkflowStep[];
	  };
type ActionStep = Extract<WorkflowStep, { type: "action" }>;
type ConditionStep = Extract<WorkflowStep, { type: "condition" }>;
export type AutomationBuilderInput = {
	name: string;
	description?: string | null;
	roleId: string;
	businessUnitId?: string | null;
	teamId?: string | null;
	trigger: { eventTypes: string[] };
	conditions: [];
	actions: AutomationAction[];
	workflow: AutomationWorkflowDraft;
};

const lifecycleStages = [
	"LEAD",
	"MQL",
	"SQL",
	"OPPORTUNITY",
	"CUSTOMER",
	"DISQUALIFIED",
] as const;

const rulePaths = [
	{ value: "payload.source", label: "Event · source" },
	{ value: "payload.utmSource", label: "Event · UTM source" },
	{ value: "payload.utmCampaign", label: "Event · UTM campaign" },
	{ value: "payload.to", label: "Event · destination lifecycle" },
	{ value: "record.globalLifecycleStage", label: "Contact · lifecycle" },
	{ value: "record.title", label: "Contact · title" },
	{ value: "record.email", label: "Contact · email" },
	{ value: "record.amount", label: "Deal · amount" },
	{ value: "record.stageId", label: "Deal · stage" },
	{ value: "record.ownerId", label: "Record · owner" },
	{ value: "event.teamId", label: "Event · team" },
] as const;

const operators: Array<{ value: RuleOperator; label: string }> = [
	{ value: "eq", label: "equals" },
	{ value: "neq", label: "does not equal" },
	{ value: "contains", label: "contains" },
	{ value: "not_contains", label: "does not contain" },
	{ value: "starts_with", label: "starts with" },
	{ value: "ends_with", label: "ends with" },
	{ value: "gt", label: "greater than" },
	{ value: "gte", label: "greater than or equal" },
	{ value: "lt", label: "less than" },
	{ value: "lte", label: "less than or equal" },
	{ value: "exists", label: "exists" },
	{ value: "not_exists", label: "does not exist" },
	{ value: "in", label: "is one of" },
	{ value: "not_in", label: "is not one of" },
];

export function AutomationWorkflowBuilder({
	data,
	events,
	pipelines,
	initial,
	busy,
	onSubmit,
}: {
	data?: Overview;
	events: EventCatalog;
	pipelines: Pipelines;
	initial?: Partial<AutomationBuilderInput> & { id?: string };
	busy?: boolean;
	onSubmit: (input: AutomationBuilderInput) => void;
}) {
	const trpc = useTRPC();
	const initialWorkflow = initial?.workflow ?? defaultWorkflow();
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [roleId, setRoleId] = useState(initial?.roleId ?? "");
	const [businessUnitId, setBusinessUnitId] = useState(
		initial?.businessUnitId ?? "global",
	);
	const [eventType, setEventType] = useState(
		initialWorkflow.trigger.eventTypes[0] ?? "lead.submitted",
	);
	const [steps, setSteps] = useState<WorkflowStep[]>(initialWorkflow.steps);
	const [prompt, setPrompt] = useState("");
	const ai = useEveAgent();
	const aiDraft = automationDraftFromMessages(ai.data.messages);
	const aiBusy = ai.status === "submitted" || ai.status === "streaming";
	const [sample, setSample] = useState(
		'{\n  "source": "website",\n  "utmSource": "google",\n  "marketingScore": 80\n}',
	);
	const simulate = useMutation(
		trpc.automations.simulate.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);
	const eligibleEvents = events.filter((event) => event.automationEligible);
	const workflow: AutomationWorkflowDraft = {
		version: 1,
		trigger: { eventTypes: [eventType] },
		steps,
	};

	return (
		<div className="flex flex-col gap-5">
			<section className="border bg-muted/20 p-4">
				<div className="mb-3">
					<p className="font-medium text-sm">Build with AI</p>
					<p className="text-muted-foreground text-xs/relaxed">
						The agent reads the live roles, triggers and pipeline stages, then
						returns an editable draft. It cannot activate the workflow.
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<Textarea
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						placeholder="When a website lead arrives, if UTM source is Google, wait 10 minutes, mark as MQL and create a follow-up task."
						aria-label="Describe the automation"
						className="min-h-24 flex-1"
					/>
					<div className="flex shrink-0 flex-col gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={!prompt.trim() || aiBusy}
							onClick={() => {
								void ai.send({
									message: `Build an editable CRM automation for this request. Load the building-automations skill, call read_automation_catalog, then call draft_automation_workflow with the complete result. Do not save or activate it. Request: ${prompt.trim()}`,
								});
							}}
						>
							{aiBusy ? "AI is drafting…" : "Generate with AI"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							disabled={!prompt.trim() || aiBusy}
							onClick={() => {
								const draft = draftFromDescription(prompt, pipelines);
								applyDraft(
									{ name: shortName(prompt), workflow: draft },
									{
										setName,
										setDescription,
										setRoleId,
										setBusinessUnitId,
										setEventType,
										setSteps,
									},
								);
								toast.success("Quick editable draft generated.");
							}}
						>
							Quick draft
						</Button>
					</div>
				</div>
				{aiDraft ? (
					<div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
						<p className="text-xs">
							AI draft ready · {countNodes(aiDraft.workflow.steps)} nodes ·
							review before saving
						</p>
						<Button
							type="button"
							size="sm"
							onClick={() => {
								applyDraft(aiDraft, {
									setName,
									setDescription,
									setRoleId,
									setBusinessUnitId,
									setEventType,
									setSteps,
								});
								toast.success("AI draft applied to the canvas.");
							}}
						>
							Apply AI draft
						</Button>
					</div>
				) : null}
			</section>

			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (!roleId) {
						toast.error("Choose an execution role.");
						return;
					}
					if (steps.length === 0) {
						toast.error("Add at least one workflow node.");
						return;
					}
					onSubmit({
						name,
						description: description || null,
						roleId,
						businessUnitId: businessUnitId === "global" ? null : businessUnitId,
						teamId: null,
						trigger: workflow.trigger,
						conditions: [],
						actions: allActions(steps),
						workflow,
					});
				}}
			>
				<FieldGroup>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="workflow-name">Name</FieldLabel>
							<Input
								id="workflow-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Qualify paid leads"
								required
							/>
						</Field>
						<Field>
							<FieldLabel>Execution role</FieldLabel>
							<Select value={roleId} onValueChange={setRoleId}>
								<SelectTrigger>
									<SelectValue placeholder="Choose a role" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{data?.roles.map((role) => (
											<SelectItem key={role.id} value={role.id}>
												{role.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="workflow-description">Description</FieldLabel>
						<Input
							id="workflow-description"
							value={description ?? ""}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="What this workflow owns and why"
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field>
							<FieldLabel>Business unit</FieldLabel>
							<Select value={businessUnitId} onValueChange={setBusinessUnitId}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="global">
											Global · all units and pipelines
										</SelectItem>
										{data?.businessUnits.map((unit) => (
											<SelectItem key={unit.id} value={unit.id}>
												{unit.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>Trigger</FieldLabel>
							<SearchCombobox
								value={eventType}
								onValueChange={setEventType}
								options={eligibleEvents.map((item) => ({
									value: item.id,
									label: item.label,
								}))}
								placeholder="Choose an event"
								searchPlaceholder="Search triggers…"
								className="w-full"
							/>
							<FieldDescription>
								{
									eligibleEvents.find((item) => item.id === eventType)
										?.description
								}
							</FieldDescription>
						</Field>
					</div>

					<section
						aria-labelledby="workflow-canvas-title"
						className="flex flex-col gap-3"
					>
						<div>
							<h3 id="workflow-canvas-title" className="font-medium text-sm">
								Workflow canvas
							</h3>
							<p className="text-muted-foreground text-xs/relaxed">
								Nodes run top to bottom. Conditions open independent Yes and No
								branches.
							</p>
						</div>
						<div className="border-l pl-4">
							<NodeList
								steps={steps}
								pipelines={pipelines}
								onChange={setSteps}
							/>
						</div>
					</section>

					<section className="border bg-muted/20 p-4">
						<p className="font-medium text-sm">Test with sample event data</p>
						<p className="mb-3 text-muted-foreground text-xs/relaxed">
							Simulation evaluates branches and shows planned actions without
							changing CRM data.
						</p>
						<Textarea
							value={sample}
							onChange={(event) => setSample(event.target.value)}
							className="min-h-28 font-mono text-xs"
							aria-label="Sample event JSON"
						/>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<Button
								type="button"
								variant="outline"
								disabled={simulate.isPending}
								onClick={() => {
									try {
										simulate.mutate({
											workflow,
											event: {
												type: eventType,
												resource: eventType.startsWith("deal.")
													? "deals"
													: "contacts",
												recordId: "example-record",
												businessUnitId:
													businessUnitId === "global" ? null : businessUnitId,
												teamId: null,
												payload: JSON.parse(sample) as Record<string, unknown>,
											},
										} as never);
									} catch {
										toast.error("Sample event must be valid JSON.");
									}
								}}
							>
								{simulate.isPending ? "Simulating…" : "Run simulation"}
							</Button>
							{simulate.data ? (
								<span className="text-muted-foreground text-xs">
									{simulate.data.trace.length} nodes evaluated ·{" "}
									{
										simulate.data.trace.filter(
											(item) => item.status === "WOULD_RUN",
										).length
									}{" "}
									actions would run
								</span>
							) : null}
						</div>
						{simulate.data?.trace.length ? (
							<ol className="mt-3 flex flex-col gap-1 text-xs">
								{simulate.data.trace.map((entry) => (
									<li
										key={`${entry.nodeId}-${entry.startedAt}`}
										className="border bg-background px-3 py-2"
									>
										{entry.type} · {entry.status}
										{entry.branch ? ` · branch ${entry.branch}` : ""}
									</li>
								))}
							</ol>
						) : null}
					</section>

					<Button type="submit" disabled={busy}>
						{busy
							? "Saving…"
							: initial?.id
								? "Save new version"
								: "Create draft"}
					</Button>
				</FieldGroup>
			</form>
		</div>
	);
}

function NodeList({
	steps,
	pipelines,
	onChange,
	branch,
}: {
	steps: WorkflowStep[];
	pipelines: Pipelines;
	onChange: (steps: WorkflowStep[]) => void;
	branch?: "Yes" | "No";
}) {
	const update = (index: number, step: WorkflowStep) =>
		onChange(
			steps.map((item, candidate) => (candidate === index ? step : item)),
		);
	return (
		<div className="flex flex-col gap-3">
			{branch ? <p className="font-medium text-xs">{branch} branch</p> : null}
			{steps.map((step, index) => (
				<div key={step.id} className="relative border bg-background p-3">
					<div className="mb-3 flex items-center justify-between gap-2">
						<p className="font-medium text-xs">{nodeTitle(step)}</p>
						<div className="flex gap-1">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={index === 0}
								onClick={() => onChange(move(steps, index, -1))}
							>
								↑
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={index === steps.length - 1}
								onClick={() => onChange(move(steps, index, 1))}
							>
								↓
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() =>
									onChange(steps.filter((_, candidate) => candidate !== index))
								}
							>
								Remove
							</Button>
						</div>
					</div>
					{step.type === "condition" ? (
						<ConditionEditor
							step={step}
							pipelines={pipelines}
							onChange={(next) => update(index, next)}
						/>
					) : step.type === "delay" ? (
						<div className="grid gap-2 sm:grid-cols-2">
							<Input
								type="number"
								min={1}
								value={step.duration}
								onChange={(event) =>
									update(index, {
										...step,
										duration: Number(event.target.value),
									})
								}
								aria-label="Delay duration"
							/>
							<Select
								value={step.unit}
								onValueChange={(unit) =>
									update(index, { ...step, unit: unit as typeof step.unit })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="minutes">Minutes</SelectItem>
										<SelectItem value="hours">Hours</SelectItem>
										<SelectItem value="days">Days</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					) : (
						<ActionEditor
							step={step}
							pipelines={pipelines}
							onChange={(next) => update(index, next)}
						/>
					)}
				</div>
			))}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onChange([...steps, defaultCondition()])}
				>
					+ If / Else
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() =>
						onChange([
							...steps,
							{ id: nodeId(), type: "delay", duration: 10, unit: "minutes" },
						])
					}
				>
					+ Delay
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onChange([...steps, defaultAction()])}
				>
					+ Action
				</Button>
			</div>
		</div>
	);
}

function ConditionEditor({
	step,
	pipelines,
	onChange,
}: {
	step: ConditionStep;
	pipelines: Pipelines;
	onChange: (step: ConditionStep) => void;
}) {
	return (
		<div className="flex flex-col gap-3">
			<Select
				value={step.logic}
				onValueChange={(logic) =>
					onChange({ ...step, logic: logic as "all" | "any" })
				}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value="all">All rules match</SelectItem>
						<SelectItem value="any">Any rule matches</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			{step.rules.map((rule, index) => (
				<div
					key={`${step.id}-${rule.id ?? `${rule.path}-${rule.operator}-${displayValue(rule.value)}`}`}
					className="grid gap-2 md:grid-cols-[1fr_11rem_1fr_auto]"
				>
					<SearchCombobox
						value={rule.path}
						onValueChange={(path) =>
							onChange({
								...step,
								rules: replace(step.rules, index, { ...rule, path }),
							})
						}
						options={rulePaths.map((item) => ({ ...item }))}
						placeholder="Field path"
						searchPlaceholder="Search fields…"
						className="w-full"
					/>
					<Select
						value={rule.operator}
						onValueChange={(operator) =>
							onChange({
								...step,
								rules: replace(step.rules, index, {
									...rule,
									operator: operator as RuleOperator,
								}),
							})
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{operators.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Input
						value={displayValue(rule.value)}
						disabled={
							rule.operator === "exists" || rule.operator === "not_exists"
						}
						onChange={(event) =>
							onChange({
								...step,
								rules: replace(step.rules, index, {
									...rule,
									value: parseValue(event.target.value),
								}),
							})
						}
						placeholder={
							rule.operator === "in" || rule.operator === "not_in"
								? '["a", "b"]'
								: "Value"
						}
					/>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={step.rules.length === 1}
						onClick={() =>
							onChange({
								...step,
								rules: step.rules.filter((_, candidate) => candidate !== index),
							})
						}
					>
						×
					</Button>
				</div>
			))}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				onClick={() =>
					onChange({ ...step, rules: [...step.rules, defaultRule()] })
				}
			>
				+ Add rule
			</Button>
			<div className="grid gap-4 border-t pt-3 lg:grid-cols-2">
				<div className="border-l border-foreground/30 pl-3">
					<NodeList
						branch="Yes"
						steps={step.ifTrue}
						pipelines={pipelines}
						onChange={(ifTrue) => onChange({ ...step, ifTrue })}
					/>
				</div>
				<div className="border-l border-dashed pl-3">
					<NodeList
						branch="No"
						steps={step.ifFalse}
						pipelines={pipelines}
						onChange={(ifFalse) => onChange({ ...step, ifFalse })}
					/>
				</div>
			</div>
		</div>
	);
}

function ActionEditor({
	step,
	pipelines,
	onChange,
}: {
	step: ActionStep;
	pipelines: Pipelines;
	onChange: (step: ActionStep) => void;
}) {
	const action = step.action;
	const setAction = (next: ActionStep["action"]) =>
		onChange({ ...step, action: next });
	return (
		<div className="flex flex-col gap-3">
			<Select
				value={action.type}
				onValueChange={(type) => setAction(actionFor(type))}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value="set_lifecycle">Set contact lifecycle</SelectItem>
						<SelectItem value="assign_contact">Assign contact</SelectItem>
						<SelectItem value="update_contact">Update contact field</SelectItem>
						<SelectItem value="create_task">Create task</SelectItem>
						<SelectItem value="add_note">Add note</SelectItem>
						<SelectItem value="move_deal">Move deal to stage</SelectItem>
						<SelectItem value="update_deal">Update deal</SelectItem>
						<SelectItem value="archive_contact">Archive contact</SelectItem>
						<SelectItem value="emit_event">Emit custom event</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			{action.type === "set_lifecycle" ? (
				<div className="grid gap-2 sm:grid-cols-2">
					<Select
						value={action.lifecycleStage}
						onValueChange={(lifecycleStage) =>
							setAction({
								...action,
								lifecycleStage: lifecycleStage as typeof action.lifecycleStage,
							})
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{lifecycleStages.map((stage) => (
									<SelectItem key={stage} value={stage}>
										{stage}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Input
						value={action.qualificationReason ?? ""}
						onChange={(event) =>
							setAction({
								...action,
								qualificationReason: event.target.value || null,
							})
						}
						placeholder="Qualification reason"
					/>
				</div>
			) : action.type === "assign_contact" ? (
				<Input
					value={action.ownerId ?? ""}
					onChange={(event) =>
						setAction({ ...action, ownerId: event.target.value || null })
					}
					placeholder="Owner user ID"
				/>
			) : action.type === "update_contact" ? (
				<div className="grid gap-2 sm:grid-cols-2">
					<Input
						value={action.fields.title ?? ""}
						onChange={(event) =>
							setAction({
								...action,
								fields: {
									...action.fields,
									title: event.target.value || null,
								},
							})
						}
						placeholder="New job title"
					/>
					<Input
						value={action.fields.phone ?? ""}
						onChange={(event) =>
							setAction({
								...action,
								fields: {
									...action.fields,
									phone: event.target.value || null,
								},
							})
						}
						placeholder="New phone"
					/>
				</div>
			) : action.type === "create_task" ? (
				<div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
					<Input
						value={action.subject}
						onChange={(event) =>
							setAction({ ...action, subject: event.target.value })
						}
						placeholder="Follow up with lead"
					/>
					<Input
						type="number"
						min={0}
						value={action.dueInMinutes ?? ""}
						onChange={(event) =>
							setAction({
								...action,
								dueInMinutes: event.target.value
									? Number(event.target.value)
									: null,
							})
						}
						placeholder="Due in minutes"
					/>
				</div>
			) : action.type === "add_note" ? (
				<Textarea
					value={action.body}
					onChange={(event) =>
						setAction({ ...action, body: event.target.value })
					}
					placeholder="Note written by this automation"
				/>
			) : action.type === "move_deal" ? (
				<div className="grid gap-2 sm:grid-cols-2">
					<Select
						value={action.stageId}
						onValueChange={(stageId) => setAction({ ...action, stageId })}
					>
						<SelectTrigger>
							<SelectValue placeholder="Choose target stage" />
						</SelectTrigger>
						<SelectContent>
							{pipelines.map((pipeline) => (
								<SelectGroup key={pipeline.id}>
									{pipeline.stages.map((stage) => (
										<SelectItem key={stage.id} value={stage.id}>
											{pipeline.name} · {stage.name}
										</SelectItem>
									))}
								</SelectGroup>
							))}
						</SelectContent>
					</Select>
					<Input
						value={action.closedReason ?? ""}
						onChange={(event) =>
							setAction({ ...action, closedReason: event.target.value || null })
						}
						placeholder="Closed/lost reason if required"
					/>
				</div>
			) : action.type === "update_deal" ? (
				<Input
					type="number"
					min={0}
					value={action.fields.amountCents ?? ""}
					onChange={(event) =>
						setAction({
							...action,
							fields: {
								amountCents: event.target.value
									? Number(event.target.value)
									: null,
							},
						})
					}
					placeholder="Amount in cents"
				/>
			) : action.type === "emit_event" ? (
				<Input
					value={action.eventType}
					onChange={(event) =>
						setAction({
							...action,
							eventType: event.target.value.toLowerCase(),
						})
					}
					placeholder="sales.followup_requested"
				/>
			) : action.type === "archive_contact" ? (
				<p className="text-muted-foreground text-xs">
					The contact that triggered this run will be archived.
				</p>
			) : null}
		</div>
	);
}

function defaultWorkflow(): AutomationWorkflowDraft {
	return {
		version: 1,
		trigger: { eventTypes: ["lead.submitted"] },
		steps: [defaultAction()],
	};
}

function defaultAction(): ActionStep {
	return {
		id: nodeId(),
		type: "action",
		action: {
			type: "set_lifecycle",
			lifecycleStage: "MQL",
			qualificationReason: "Matched workflow rules",
		},
	};
}

function defaultCondition(): ConditionStep {
	return {
		id: nodeId(),
		type: "condition",
		logic: "all",
		rules: [defaultRule()],
		ifTrue: [defaultAction()],
		ifFalse: [],
	};
}

function defaultRule(): Rule {
	return {
		id: nodeId(),
		path: "payload.utmSource",
		operator: "eq",
		value: "google",
	};
}

function actionFor(type: string): ActionStep["action"] {
	switch (type) {
		case "assign_contact":
			return { type, ownerId: null, teamId: null };
		case "update_contact":
			return { type, fields: { title: "New title" } };
		case "create_task":
			return { type, subject: "Follow up", dueInMinutes: 60 };
		case "add_note":
			return { type, body: "Automation note" };
		case "move_deal":
			return { type, stageId: "" };
		case "update_deal":
			return { type, fields: { amountCents: 0 } };
		case "archive_contact":
			return { type };
		case "emit_event":
			return { type, eventType: "automation.completed", payload: {} };
		default:
			return {
				type: "set_lifecycle",
				lifecycleStage: "MQL",
				qualificationReason: "Matched workflow rules",
			};
	}
}

function allActions(steps: WorkflowStep[]): AutomationAction[] {
	return steps.flatMap((step) =>
		step.type === "action"
			? [step.action]
			: step.type === "condition"
				? [...allActions(step.ifTrue), ...allActions(step.ifFalse)]
				: [],
	);
}

function draftFromDescription(
	description: string,
	pipelines: Pipelines,
): AutomationWorkflowDraft {
	const text = description.toLocaleLowerCase();
	const trigger =
		text.includes("deal") ||
		text.includes("negócio") ||
		text.includes("pipeline") ||
		text.includes("etapa")
			? "deal.stage_changed"
			: text.includes("contato criado")
				? "contact.created"
				: "lead.submitted";
	const steps: WorkflowStep[] = [];
	const condition = text.match(
		/(?:utm|origem|source)[^a-z0-9]+(?:é|is|=)?\s*([a-z0-9_-]+)/i,
	);
	if (condition?.[1]) {
		steps.push({
			id: nodeId(),
			type: "condition",
			logic: "all",
			rules: [
				{ path: "payload.utmSource", operator: "eq", value: condition[1] },
			],
			ifTrue: [],
			ifFalse: [],
		});
	}
	const delay = text.match(
		/(?:esper[ae]|wait|delay)\s+(\d+)\s*(minuto|minutos|minutes?|hora|horas|hours?|dia|dias|days?)/i,
	);
	const target = steps[0]?.type === "condition" ? steps[0].ifTrue : steps;
	if (delay) {
		const unit = /dia|day/i.test(delay[2] ?? "")
			? "days"
			: /hora|hour/i.test(delay[2] ?? "")
				? "hours"
				: "minutes";
		target.push({
			id: nodeId(),
			type: "delay",
			duration: Number(delay[1]),
			unit,
		});
	}
	const lifecycle = lifecycleStages.find((stage) =>
		text.includes(stage.toLowerCase()),
	);
	if (lifecycle)
		target.push({
			id: nodeId(),
			type: "action",
			action: {
				type: "set_lifecycle",
				lifecycleStage: lifecycle,
				qualificationReason: "Generated from workflow description",
			},
		});
	const namedStage = pipelines
		.flatMap((pipeline) => pipeline.stages)
		.find((stage) => text.includes(stage.name.toLocaleLowerCase()));
	if (namedStage)
		target.push({
			id: nodeId(),
			type: "action",
			action: { type: "move_deal", stageId: namedStage.id },
		});
	if (/tarefa|task|follow[ -]?up/.test(text))
		target.push({
			id: nodeId(),
			type: "action",
			action: { type: "create_task", subject: "Follow up", dueInMinutes: 60 },
		});
	if (target.length === 0) target.push(defaultAction());
	return { version: 1, trigger: { eventTypes: [trigger] }, steps };
}

function nodeId() {
	return `node-${crypto.randomUUID()}`;
}

function move<T>(items: T[], index: number, delta: number) {
	const next = [...items];
	const target = index + delta;
	const [item] = next.splice(index, 1);
	if (item !== undefined) next.splice(target, 0, item);
	return next;
}

function replace<T>(items: T[], index: number, value: T) {
	return items.map((item, candidate) => (candidate === index ? value : item));
}

function parseValue(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function displayValue(value: unknown) {
	return typeof value === "string"
		? value
		: value === undefined
			? ""
			: JSON.stringify(value);
}

function nodeTitle(step: WorkflowStep) {
	if (step.type === "condition") return "IF / ELSE";
	if (step.type === "delay") return `WAIT · ${step.duration} ${step.unit}`;
	return `ACTION · ${step.action.type.replaceAll("_", " ")}`;
}

function shortName(value: string) {
	const first = value.trim().split(/[.!?\n]/)[0] ?? "New workflow";
	return first.slice(0, 80);
}

type DraftResult = {
	name: string;
	description?: string | null;
	roleId?: string;
	businessUnitId?: string | null;
	workflow: AutomationWorkflowDraft;
};

function automationDraftFromMessages(
	messages: readonly EveMessage[],
): DraftResult | null {
	for (const message of messages.toReversed()) {
		for (const part of message.parts.toReversed()) {
			const toolName =
				part.type === "dynamic-tool" && "toolName" in part
					? String(part.toolName)
					: part.type.replace(/^tool-/, "");
			if (toolName !== "draft_automation_workflow" || !("output" in part))
				continue;
			const output = part.output as { draft?: unknown } | undefined;
			if (output?.draft && isDraftResult(output.draft)) return output.draft;
		}
	}
	return null;
}

function isDraftResult(value: unknown): value is DraftResult {
	if (!value || typeof value !== "object") return false;
	const draft = value as Partial<DraftResult>;
	return (
		typeof draft.name === "string" &&
		Boolean(draft.workflow) &&
		draft.workflow?.version === 1 &&
		Array.isArray(draft.workflow.steps) &&
		Array.isArray(draft.workflow.trigger?.eventTypes)
	);
}

function applyDraft(
	draft: DraftResult,
	setters: {
		setName: (value: string) => void;
		setDescription: (value: string) => void;
		setRoleId: (value: string) => void;
		setBusinessUnitId: (value: string) => void;
		setEventType: (value: string) => void;
		setSteps: (value: WorkflowStep[]) => void;
	},
) {
	setters.setName(draft.name);
	setters.setDescription(draft.description ?? "");
	if (draft.roleId) setters.setRoleId(draft.roleId);
	setters.setBusinessUnitId(draft.businessUnitId ?? "global");
	setters.setEventType(
		draft.workflow.trigger.eventTypes[0] ?? "lead.submitted",
	);
	setters.setSteps(draft.workflow.steps);
}

function countNodes(steps: WorkflowStep[]): number {
	return steps.reduce(
		(total, step) =>
			total +
			1 +
			(step.type === "condition"
				? countNodes(step.ifTrue) + countNodes(step.ifFalse)
				: 0),
		0,
	);
}
