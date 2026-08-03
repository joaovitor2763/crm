import type { Prisma } from "@crm/db";
import type {
	AutomationCondition,
	AutomationWorkflow,
	WorkflowStep,
} from "./automations.contracts";

export type WorkflowTraceEntry = {
	nodeId: string;
	type: WorkflowStep["type"];
	label: string | null;
	status: "SUCCEEDED" | "WAITING" | "WOULD_RUN";
	branch?: "true" | "false";
	availableAt?: string;
	startedAt: string;
	finishedAt: string;
	output?: Record<string, unknown>;
};

export type WorkflowState = { pending: WorkflowStep[] };

export function legacyWorkflow(input: {
	trigger: Prisma.JsonValue;
	conditions: Prisma.JsonValue;
	actions: Prisma.JsonValue;
}): AutomationWorkflow {
	const trigger = input.trigger as AutomationWorkflow["trigger"];
	const conditions = input.conditions as AutomationCondition[];
	const actions = input.actions as Array<
		Extract<WorkflowStep, { type: "action" }>["action"]
	>;
	const actionSteps: WorkflowStep[] = actions.map((action, index) => ({
		id: `legacy-action-${index + 1}`,
		type: "action",
		label: nullishLabel(action.type),
		action,
	}));
	return {
		version: 1,
		trigger,
		steps:
			conditions.length === 0
				? actionSteps
				: [
						{
							id: "legacy-condition",
							type: "condition",
							label: "Legacy conditions",
							logic: "all",
							rules: conditions,
							ifTrue: actionSteps,
							ifFalse: [],
						},
					],
	};
}

export function matchesRules(
	rules: AutomationCondition[],
	logic: "all" | "any",
	source: unknown,
) {
	const match = (condition: AutomationCondition) => {
		const current = readPath(source, condition.path);
		const expected = condition.value;
		switch (condition.operator) {
			case "exists":
				return current !== undefined && current !== null;
			case "not_exists":
				return current === undefined || current === null;
			case "eq":
				return comparable(current) === comparable(expected);
			case "neq":
				return comparable(current) !== comparable(expected);
			case "contains":
				return contains(current, expected);
			case "not_contains":
				return !contains(current, expected);
			case "starts_with":
				return String(current ?? "").startsWith(String(expected ?? ""));
			case "ends_with":
				return String(current ?? "").endsWith(String(expected ?? ""));
			case "gt":
				return numeric(current) > numeric(expected);
			case "gte":
				return numeric(current) >= numeric(expected);
			case "lt":
				return numeric(current) < numeric(expected);
			case "lte":
				return numeric(current) <= numeric(expected);
			case "in":
				return Array.isArray(expected)
					? expected.map(comparable).includes(comparable(current))
					: false;
			case "not_in":
				return Array.isArray(expected)
					? !expected.map(comparable).includes(comparable(current))
					: true;
		}
	};
	return logic === "all" ? rules.every(match) : rules.some(match);
}

export function simulateWorkflow(
	workflow: AutomationWorkflow,
	event: {
		type: string;
		resource: string;
		recordId: string | null;
		businessUnitId: string | null;
		teamId: string | null;
		payload: Record<string, unknown>;
	},
) {
	const pending = structuredClone(workflow.steps);
	const trace: WorkflowTraceEntry[] = [];
	const source = {
		event,
		payload: event.payload,
		record: event.payload.record,
	};
	while (pending.length > 0 && trace.length < 100) {
		const step = pending.shift();
		if (!step) break;
		const now = new Date().toISOString();
		if (step.type === "condition") {
			const matched = matchesRules(step.rules, step.logic, source);
			trace.push({
				nodeId: step.id,
				type: step.type,
				label: step.label ?? null,
				status: "SUCCEEDED",
				branch: matched ? "true" : "false",
				startedAt: now,
				finishedAt: now,
			});
			pending.unshift(...structuredClone(matched ? step.ifTrue : step.ifFalse));
			continue;
		}
		if (step.type === "delay") {
			const availableAt = delayUntil(step.duration, step.unit).toISOString();
			trace.push({
				nodeId: step.id,
				type: step.type,
				label: step.label ?? null,
				status: "WAITING",
				availableAt,
				startedAt: now,
				finishedAt: now,
			});
			continue;
		}
		trace.push({
			nodeId: step.id,
			type: step.type,
			label: step.label ?? null,
			status: "WOULD_RUN",
			startedAt: now,
			finishedAt: now,
			output: { action: step.action.type },
		});
	}
	return {
		matchedTrigger: workflow.trigger.eventTypes.includes(event.type),
		trace,
	};
}

export function delayUntil(
	duration: number,
	unit: "minutes" | "hours" | "days",
	now = Date.now(),
) {
	const minutes =
		unit === "days"
			? duration * 1_440
			: unit === "hours"
				? duration * 60
				: duration;
	return new Date(now + minutes * 60_000);
}

export function readPath(source: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((current, segment) => {
		if (typeof current !== "object" || current === null) return undefined;
		return (current as Record<string, unknown>)[segment];
	}, source);
}

function contains(current: unknown, expected: unknown) {
	return Array.isArray(current)
		? current.map(comparable).includes(comparable(expected))
		: String(current ?? "")
				.toLocaleLowerCase()
				.includes(String(expected ?? "").toLocaleLowerCase());
}

function numeric(value: unknown) {
	const number = Number(value);
	return Number.isFinite(number) ? number : Number.NaN;
}

function comparable(value: unknown) {
	if (typeof value === "string") return value.toLocaleLowerCase();
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	return JSON.stringify(value);
}

function nullishLabel(value: string) {
	return value.replaceAll("_", " ");
}
