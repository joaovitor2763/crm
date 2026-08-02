"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { BarTrend } from "@/components/dashboard-charts";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { AnalyticsView } from "./studio-analytics-data";
import { chartConfig, chartRows, formatMetric } from "./studio-analytics-data";
import {
	type DashboardDraft,
	type DashboardSpec,
	dashboardDraft,
} from "./studio-dashboard-definition-data";
import { StudioDashboardDefinitionEditor } from "./studio-dashboard-definition-editor";
import { studioParsers } from "./studio-search-params";
import { studioMutationOptions } from "./studio-trpc";

type Definition = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	version: number;
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
	spec: unknown;
};
type Template = {
	key: string;
	name: string;
	description: string;
	spec: unknown;
};
type Rendered = {
	view: AnalyticsView;
	comparisonSupport: { supported: boolean; reason?: string };
};

export function StudioDashboardDefinitions({
	canManage,
}: {
	canManage: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [selectedId, setSelectedId] = useQueryState(
		"dashboard",
		studioParsers.dashboard,
	);
	const [editor, setEditor] = useState<DashboardDraft | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const definitions = useQuery(
		trpc.dashboard.definitionsList.queryOptions({ includeVersions: true }),
	);
	const templates = useQuery(trpc.dashboard.definitionTemplates.queryOptions());
	const selected = useQuery({
		...trpc.dashboard.definition.queryOptions({ id: selectedId }),
		enabled: Boolean(selectedId),
	});
	const rendered = useQuery({
		...trpc.dashboard.renderDefinition.queryOptions({ id: selectedId }),
		enabled: Boolean(selectedId),
	});
	const create = useMutation(
		studioMutationOptions<
			Definition,
			{
				key: string;
				name: string;
				description: string | null;
				spec: DashboardSpec;
			}
		>(trpc.dashboard.createDefinition, {
			onSuccess: async (row) => {
				await cache.dashboardDefinitions();
				setEditor(null);
				setEditingId(null);
				await setSelectedId(row.id);
				toast.success("Dashboard definition created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		studioMutationOptions<
			Definition,
			{
				id: string;
				name: string;
				description: string | null;
				spec: DashboardSpec;
			}
		>(trpc.dashboard.updateDefinition, {
			onSuccess: async (row) => {
				await cache.dashboardDefinitions();
				setEditor(null);
				setEditingId(null);
				await setSelectedId(row.id);
				toast.success("Dashboard draft updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const duplicate = useMutation(
		studioMutationOptions<Definition, { id: string; key: string }>(
			trpc.dashboard.duplicateDefinition,
			{
				onSuccess: async (row) => {
					await cache.dashboardDefinitions();
					await setSelectedId(row.id);
					toast.success("Dashboard definition duplicated.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const version = useMutation(
		studioMutationOptions<Definition, { id: string }>(
			trpc.dashboard.versionDefinition,
			{
				onSuccess: async (row) => {
					await cache.dashboardDefinitions();
					await setSelectedId(row.id);
					toast.success("New dashboard version created.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const publish = useMutation(
		studioMutationOptions<Definition, { id: string }>(
			trpc.dashboard.publishDefinition,
			{
				onSuccess: async (row) => {
					await cache.dashboardDefinitions();
					await setSelectedId(row.id);
					toast.success("Dashboard definition published.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const archive = useMutation(
		studioMutationOptions<Definition, { id: string }>(
			trpc.dashboard.archiveDefinition,
			{
				onSuccess: async () => {
					await cache.dashboardDefinitions();
					toast.success("Dashboard definition archived.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const rows = latestDefinitions(
		(definitions.data ?? []) as unknown as Definition[],
	);
	const pending =
		create.isPending ||
		update.isPending ||
		duplicate.isPending ||
		version.isPending;

	return (
		<div className="flex flex-col gap-5">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>Dashboard definitions</CardTitle>
							<CardDescription>
								Versioned, reusable views with explicit metric, population,
								filters, breakdowns and visualization choices.
							</CardDescription>
						</div>
						{canManage ? (
							<Button
								type="button"
								size="sm"
								onClick={() => {
									setEditingId(null);
									setEditor(dashboardDraft());
								}}
							>
								New definition
							</Button>
						) : null}
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{templates.data?.length ? (
						<div className="flex flex-wrap gap-2">
							{templates.data.map((template) => (
								<Button
									key={template.key}
									type="button"
									variant="outline"
									size="sm"
									disabled={!canManage}
									onClick={() => {
										setEditingId(null);
										setEditor(templateDraft(template));
									}}
								>
									Use {template.name}
								</Button>
							))}
						</div>
					) : null}
					{definitions.isLoading ? (
						<div className="flex justify-center py-8">
							<Spinner />
						</div>
					) : rows.length === 0 ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyTitle>No saved definitions</EmptyTitle>
								<EmptyDescription>
									Start from a standard revenue template or create a custom
									view.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
							{rows.map((row) => (
								<button
									key={row.id}
									type="button"
									className="flex flex-col gap-1 border p-3 text-left hover:bg-muted/50"
									onClick={() => {
										void setSelectedId(row.id);
										setEditor(null);
										setEditingId(null);
									}}
								>
									<span className="font-medium text-sm">{row.name}</span>
									<span className="text-muted-foreground text-xs">
										{row.key} · v{row.version} · {row.status}
									</span>
								</button>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{editor ? (
				<StudioDashboardDefinitionEditor
					key={`editor:${editingId ?? (editor.key || "new")}`}
					initial={editor}
					editing={Boolean(editingId)}
					pending={pending}
					onCancel={() => {
						setEditor(null);
						setEditingId(null);
					}}
					onSubmit={(draft) => {
						if (editingId) {
							update.mutate({
								id: editingId,
								name: draft.name,
								description: draft.description || null,
								spec: draft.spec,
							});
						} else {
							create.mutate({
								key: draft.key,
								name: draft.name,
								description: draft.description || null,
								spec: draft.spec,
							});
						}
					}}
				/>
			) : selected.data ? (
				<DefinitionDetail
					definition={selected.data as unknown as Definition}
					rendered={rendered.data as unknown as Rendered | undefined}
					canManage={canManage}
					busy={
						publish.isPending ||
						archive.isPending ||
						duplicate.isPending ||
						version.isPending
					}
					onEdit={() => {
						const definition = selected.data as unknown as Definition;
						setEditingId(definition.id);
						setEditor(definitionDraft(definition));
					}}
					onDuplicate={() => {
						const definition = selected.data as unknown as Definition;
						const key = window.prompt(
							"New definition key",
							`${definition.key}-copy`,
						);
						if (key?.trim())
							duplicate.mutate({ id: definition.id, key: key.trim() });
					}}
					onVersion={() =>
						version.mutate({ id: (selected.data as unknown as Definition).id })
					}
					onPublish={() => {
						if (window.confirm("Publish this dashboard definition?"))
							publish.mutate({
								id: (selected.data as unknown as Definition).id,
							});
					}}
					onArchive={() => {
						if (window.confirm("Archive this dashboard definition?"))
							archive.mutate({
								id: (selected.data as unknown as Definition).id,
							});
					}}
				/>
			) : (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Select a definition</EmptyTitle>
						<EmptyDescription>
							Choose a saved view to inspect its rendered ChartCDN payload.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

function DefinitionDetail({
	definition,
	rendered,
	canManage,
	busy,
	onEdit,
	onDuplicate,
	onVersion,
	onPublish,
	onArchive,
}: {
	definition: Definition;
	rendered: Rendered | undefined;
	canManage: boolean;
	busy: boolean;
	onEdit: () => void;
	onDuplicate: () => void;
	onVersion: () => void;
	onPublish: () => void;
	onArchive: () => void;
}) {
	const view = rendered?.view as AnalyticsView | undefined;
	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>{definition.name}</CardTitle>
						<CardDescription>
							{definition.key} · version {definition.version} ·{" "}
							{definition.status}
						</CardDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						{canManage && definition.status === "DRAFT" ? (
							<>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onEdit}
								>
									Edit
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={busy}
									onClick={onPublish}
								>
									Publish
								</Button>
							</>
						) : null}
						{canManage ? (
							<>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={onDuplicate}
								>
									Duplicate
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={onVersion}
								>
									New version
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={onArchive}
								>
									Archive
								</Button>
							</>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{rendered?.comparisonSupport.supported === false ? (
					<p className="border border-destructive/40 p-3 text-destructive text-xs">
						Comparison metadata:{" "}
						{rendered.comparisonSupport.reason ?? "Unsupported"}
					</p>
				) : null}
				{view ? (
					<div className="border p-3">
						<p className="mb-3 font-medium text-sm">Rendered view</p>
						<BarTrend
							data={chartRows(view)}
							config={chartConfig(view)}
							xKey="label"
							height={260}
							showXAxis={view.chart.data.labels.length < 12}
							formatValue={formatMetric}
						/>
					</div>
				) : (
					<div className="flex justify-center border py-10">
						<Spinner />
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function latestDefinitions(rows: Definition[]) {
	const latest = new Map<string, Definition>();
	for (const row of rows) {
		const current = latest.get(row.key);
		if (!current || row.version > current.version) latest.set(row.key, row);
	}
	return [...latest.values()].sort((left, right) =>
		left.key.localeCompare(right.key),
	);
}

function templateDraft(template: Template): DashboardDraft {
	return dashboardDraft({
		key: template.key,
		name: template.name,
		description: template.description,
		spec: template.spec as unknown as DashboardSpec,
	});
}

function definitionDraft(definition: Definition): DashboardDraft {
	return dashboardDraft({
		key: definition.key,
		name: definition.name,
		description: definition.description ?? "",
		spec: definition.spec as unknown as DashboardSpec,
	});
}
