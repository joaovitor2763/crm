"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useState } from "react";
import {
	DASHBOARD_DIMENSIONS,
	DASHBOARD_METRICS,
	DASHBOARD_VISUALIZATIONS,
	type DashboardDimension,
	type DashboardDraft,
	dashboardDraft,
	withAttributeFilter,
} from "./studio-dashboard-definition-data";

const LABELS: Record<string, string> = {
	conversionRate: "Conversion rate",
	conversionTime: "Time to conversion",
	stageRate: "Stage rates",
	stageTime: "Stage times",
	breakdown: "Breakdown",
	macroBowtie: "Macro bowtie",
	deals: "Deals",
	closedDeals: "Closed deals",
	pipelineEntries: "Pipeline entries",
	bar: "Bar",
	line: "Line",
	doughnut: "Doughnut",
	table: "Table",
	kpi: "KPI",
	none: "None",
};
const SLOTS = ["one", "two", "three"] as const;

export function StudioDashboardDefinitionEditor({
	initial,
	editing,
	pending,
	onCancel,
	onSubmit,
}: {
	initial?: Partial<DashboardDraft> & {
		spec?: Partial<DashboardDraft["spec"]>;
	};
	editing: boolean;
	pending: boolean;
	onCancel: () => void;
	onSubmit: (draft: DashboardDraft) => void;
}) {
	const [draft, setDraft] = useState(() => dashboardDraft(initial));
	const spec = draft.spec;
	const updateSpec = (next: Partial<typeof spec>) =>
		setDraft((current) => ({ ...current, spec: { ...current.spec, ...next } }));
	const dimensions = [spec.groupBy[0], spec.groupBy[1], spec.groupBy[2]];
	const updateDimension = (index: number, value: string) => {
		const next = dimensions.map((dimension, position) =>
			position === index && value !== "none"
				? (value as DashboardDimension)
				: position === index
					? undefined
					: dimension,
		);
		updateSpec({
			groupBy: [...new Set(next.filter(Boolean) as DashboardDimension[])],
		});
	};
	const attributeKey =
		spec.filters.find((filter) => filter.key === "attributeKey")?.value ?? "";
	const pipelineId =
		spec.filters.find((filter) => filter.key === "pipelineId")?.value ?? "";

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{editing ? "Edit dashboard definition" : "New dashboard definition"}
				</CardTitle>
				<CardDescription>
					Define the semantic metric and its governed cuts. Rendering stays
					provider-neutral and returns ChartCDN-compatible JSON.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				<div className="grid gap-3 md:grid-cols-2">
					<Field>
						<FieldLabel htmlFor="dashboard-definition-key">Key</FieldLabel>
						<Input
							id="dashboard-definition-key"
							value={draft.key}
							disabled={editing}
							onChange={(event) =>
								setDraft((current) => ({ ...current, key: event.target.value }))
							}
							placeholder="channel-performance"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="dashboard-definition-name">Name</FieldLabel>
						<Input
							id="dashboard-definition-name"
							value={draft.name}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									name: event.target.value,
								}))
							}
							placeholder="Channel performance"
						/>
					</Field>
				</div>
				<Field>
					<FieldLabel htmlFor="dashboard-definition-description">
						Description
					</FieldLabel>
					<Input
						id="dashboard-definition-description"
						value={draft.description}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								description: event.target.value,
							}))
						}
						placeholder="What this view answers"
					/>
				</Field>
				<div className="grid gap-3 md:grid-cols-3">
					<EnumField
						label="Metric"
						value={spec.metric}
						options={DASHBOARD_METRICS}
						onChange={(value) =>
							updateSpec({
								metric: value as typeof spec.metric,
								groupBy:
									value === "breakdown" && spec.groupBy.length === 0
										? ["channel"]
										: spec.groupBy,
							})
						}
					/>
					<EnumField
						label="Population"
						value={spec.population}
						options={["deals", "closedDeals", "pipelineEntries"] as const}
						onChange={(value) =>
							updateSpec({ population: value as typeof spec.population })
						}
					/>
					<EnumField
						label="Visualization"
						value={spec.visualization}
						options={DASHBOARD_VISUALIZATIONS}
						onChange={(value) =>
							updateSpec({ visualization: value as typeof spec.visualization })
						}
					/>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					{SLOTS.map((slot, index) => (
						<EnumField
							key={`dimension-${slot}`}
							label={`Group by ${index + 1}`}
							value={dimensions[index] ?? "none"}
							options={["none", ...DASHBOARD_DIMENSIONS] as const}
							onChange={(value) => updateDimension(index, value)}
						/>
					))}
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<EnumField
						label="Time grain"
						value={spec.timeRange.grain}
						options={["day", "week", "month", "quarter"] as const}
						onChange={(value) =>
							updateSpec({
								timeRange: {
									...spec.timeRange,
									grain: value as typeof spec.timeRange.grain,
								},
							})
						}
					/>
					<EnumField
						label="Comparison"
						value={spec.comparison}
						options={["none", "previousPeriod", "previousYear"] as const}
						onChange={(value) =>
							updateSpec({ comparison: value as typeof spec.comparison })
						}
					/>
					<Field>
						<FieldLabel htmlFor="dashboard-pipeline-filter">
							Pipeline ID filter
						</FieldLabel>
						<Input
							id="dashboard-pipeline-filter"
							value={pipelineId}
							onChange={(event) => updatePipelineFilter(event.target.value)}
							placeholder="Optional pipeline ID"
						/>
					</Field>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<Field>
						<FieldLabel htmlFor="dashboard-from">From</FieldLabel>
						<Input
							type="date"
							id="dashboard-from"
							value={dateValue(spec.timeRange.from)}
							onChange={(event) =>
								updateSpec({
									timeRange: {
										...spec.timeRange,
										from: event.target.value || undefined,
									},
								})
							}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="dashboard-to">To</FieldLabel>
						<Input
							type="date"
							id="dashboard-to"
							value={dateValue(spec.timeRange.to)}
							onChange={(event) =>
								updateSpec({
									timeRange: {
										...spec.timeRange,
										to: event.target.value || undefined,
									},
								})
							}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="dashboard-timezone">Timezone</FieldLabel>
						<Input
							id="dashboard-timezone"
							value={spec.timeRange.timezone}
							onChange={(event) =>
								updateSpec({
									timeRange: {
										...spec.timeRange,
										timezone: event.target.value,
									},
								})
							}
							placeholder="America/Sao_Paulo"
						/>
					</Field>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					{SLOTS.map((slot, index) => (
						<EnumField
							key={`breakdown-${slot}`}
							label={`Breakdown ${index + 1}`}
							value={spec.breakdowns[index] ?? "none"}
							options={["none", ...DASHBOARD_DIMENSIONS] as const}
							onChange={(value) => {
								const next = [...spec.breakdowns];
								if (value === "none") next.splice(index, 1);
								else next[index] = value as DashboardDimension;
								updateSpec({
									breakdowns: [
										...new Set(next.filter(Boolean)),
									] as DashboardDimension[],
								});
							}}
						/>
					))}
				</div>
				<Field>
					<FieldLabel htmlFor="dashboard-attribute-filter">
						Deal attribute key
					</FieldLabel>
					<Input
						id="dashboard-attribute-filter"
						value={attributeKey}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								spec: withAttributeFilter(current.spec, event.target.value),
							}))
						}
						placeholder="Required when grouping by dealAttribute"
					/>
				</Field>
				<div className="flex flex-wrap justify-end gap-2">
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={pending || !draft.key.trim() || !draft.name.trim()}
						onClick={() => onSubmit(draft)}
					>
						{pending ? "Saving…" : editing ? "Save draft" : "Create draft"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);

	function updatePipelineFilter(value: string) {
		setDraft((current) => {
			const filters = current.spec.filters.filter(
				(filter) => filter.key !== "pipelineId",
			);
			return {
				...current,
				spec: value.trim()
					? {
							...current.spec,
							filters: [
								...filters,
								{ key: "pipelineId", operator: "eq", value: value.trim() },
							],
						}
					: { ...current.spec, filters },
			};
		});
	}
}

function dateValue(value: string | undefined) {
	return value?.slice(0, 10) ?? "";
}

function EnumField({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: readonly string[];
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{LABELS[option] ?? option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</Field>
	);
}
