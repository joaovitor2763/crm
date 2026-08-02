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
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	type DashboardDefinition,
	type DashboardDraft,
	type DashboardRendered,
	type DashboardSpec,
	dashboardDraft,
	definitionDraft,
	latestDefinitions,
	templateDraft,
} from "./studio-dashboard-definition-data";
import { DashboardDefinitionDetail } from "./studio-dashboard-definition-detail";
import { StudioDashboardDefinitionEditor } from "./studio-dashboard-definition-editor";
import { studioParsers } from "./studio-search-params";
import { studioMutationOptions } from "./studio-trpc";

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
			DashboardDefinition,
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
			DashboardDefinition,
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
		studioMutationOptions<DashboardDefinition, { id: string; key: string }>(
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
		studioMutationOptions<DashboardDefinition, { id: string }>(
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
		studioMutationOptions<DashboardDefinition, { id: string }>(
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
		studioMutationOptions<DashboardDefinition, { id: string }>(
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
		(definitions.data ?? []) as unknown as DashboardDefinition[],
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
				<DashboardDefinitionDetail
					definition={selected.data as unknown as DashboardDefinition}
					rendered={rendered.data as unknown as DashboardRendered | undefined}
					canManage={canManage}
					busy={
						publish.isPending ||
						archive.isPending ||
						duplicate.isPending ||
						version.isPending
					}
					onEdit={() => {
						const definition = selected.data as unknown as DashboardDefinition;
						setEditingId(definition.id);
						setEditor(definitionDraft(definition));
					}}
					onDuplicate={() => {
						const definition = selected.data as unknown as DashboardDefinition;
						const key = window.prompt(
							"New definition key",
							`${definition.key}-copy`,
						);
						if (key?.trim())
							duplicate.mutate({ id: definition.id, key: key.trim() });
					}}
					onVersion={() =>
						version.mutate({
							id: (selected.data as unknown as DashboardDefinition).id,
						})
					}
					onPublish={() => {
						if (window.confirm("Publish this dashboard definition?"))
							publish.mutate({
								id: (selected.data as unknown as DashboardDefinition).id,
							});
					}}
					onArchive={() => {
						if (window.confirm("Archive this dashboard definition?"))
							archive.mutate({
								id: (selected.data as unknown as DashboardDefinition).id,
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
