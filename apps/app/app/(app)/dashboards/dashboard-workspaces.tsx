"use client";

import Add from "@carbon/icons-react/es/Add";
import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import ArrowsVertical from "@carbon/icons-react/es/ArrowsVertical";
import Locked from "@carbon/icons-react/es/Locked";
import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import { type DragEvent, useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { BarTrend } from "@/components/dashboard-charts";
import { useTRPC } from "@/lib/trpc/client";
import {
	type AnalyticsView,
	chartConfig,
	chartRows,
	formatMetric,
} from "../studio/studio-analytics-data";
import type { DashboardSpec } from "../studio/studio-dashboard-definition-data";
import { studioMutationOptions } from "../studio/studio-trpc";

type Widget = {
	id: string;
	title: string;
	description: string | null;
	width: number;
};
type Workspace = {
	id: string;
	name: string;
	description: string | null;
	visibility: "PRIVATE" | "PUBLIC";
	owner: { id: string; name: string; image: string | null };
	widgets: Widget[];
	canEdit: boolean;
};
type Template = {
	key: string;
	name: string;
	description: string;
	spec: DashboardSpec;
};
type CreatedWorkspace = { id: string };

export function DashboardWorkspaces() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [scope, setScope] = useQueryState(
		"scope",
		parseAsStringLiteral(["all", "mine", "public"] as const).withDefault("all"),
	);
	const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
	const [dashboardId, setDashboardId] = useQueryState(
		"dashboard",
		parseAsString.withDefault(""),
	);
	const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
	const deferredQ = useDeferredValue(q);
	const [createOpen, setCreateOpen] = useState(false);
	const [addOpen, setAddOpen] = useState(false);
	const listInput = { scope, q: deferredQ, page, pageSize: 24 } as const;
	const workspaces = useQuery(
		trpc.dashboard.workspacesList.queryOptions(listInput),
	);
	const workspace = useQuery({
		...trpc.dashboard.workspace.queryOptions({ id: dashboardId }),
		enabled: Boolean(dashboardId),
	});
	const templates = useQuery(trpc.dashboard.definitionTemplates.queryOptions());

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries(
				trpc.dashboard.workspacesList.queryFilter(),
			),
			queryClient.invalidateQueries(trpc.dashboard.workspace.queryFilter()),
		]);
	};
	const create = useMutation(
		studioMutationOptions<
			CreatedWorkspace,
			{
				name: string;
				description?: string | null;
				visibility: "PRIVATE" | "PUBLIC";
			}
		>(trpc.dashboard.createWorkspace, {
			onSuccess: async (row) => {
				await refresh();
				setCreateOpen(false);
				await setDashboardId(row.id);
				toast.success("Dashboard created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const add = useMutation(
		studioMutationOptions<
			unknown,
			{
				dashboardId: string;
				title: string;
				description?: string | null;
				spec: Template["spec"];
				width: number;
			}
		>(trpc.dashboard.addWidget, {
			onSuccess: async () => {
				await refresh();
				setAddOpen(false);
				toast.success("Widget added.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateLayout = useMutation(
		studioMutationOptions<
			unknown,
			{
				dashboardId: string;
				widgets: Array<{ id: string; position: number; width: number }>;
			}
		>(trpc.dashboard.updateWidgetLayout, {
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		studioMutationOptions<unknown, { id: string }>(
			trpc.dashboard.removeWidget,
			{
				onSuccess: async () => {
					await refresh();
					toast.success("Widget removed.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);

	if (dashboardId) {
		return workspace.isLoading ? (
			<div className="flex justify-center py-16">
				<Spinner />
			</div>
		) : workspace.data ? (
			<DashboardCanvas
				workspace={workspace.data as unknown as Workspace}
				templates={(templates.data ?? []) as unknown as Template[]}
				addOpen={addOpen}
				setAddOpen={setAddOpen}
				onBack={() => setDashboardId("")}
				onAdd={(template) =>
					add.mutate({
						dashboardId,
						title: template.name,
						description: template.description,
						spec: template.spec,
						width: template.spec.layout.w,
					})
				}
				onMove={(widgetId, direction) => {
					const widgets = [...(workspace.data.widgets as unknown as Widget[])];
					const index = widgets.findIndex((widget) => widget.id === widgetId);
					const target = index + direction;
					if (index < 0 || target < 0 || target >= widgets.length) return;
					const current = widgets[index];
					const replacement = widgets[target];
					if (!current || !replacement) return;
					widgets[index] = replacement;
					widgets[target] = current;
					updateLayout.mutate({
						dashboardId,
						widgets: widgets.map((widget, position) => ({
							id: widget.id,
							position,
							width: widget.width,
						})),
					});
				}}
				onReorder={(widgetId, targetId) => {
					const widgets = [...(workspace.data.widgets as unknown as Widget[])];
					const source = widgets.findIndex((widget) => widget.id === widgetId);
					const target = widgets.findIndex((widget) => widget.id === targetId);
					if (source < 0 || target < 0 || source === target) return;
					const [moved] = widgets.splice(source, 1);
					if (!moved) return;
					widgets.splice(target, 0, moved);
					updateLayout.mutate({
						dashboardId,
						widgets: widgets.map((widget, position) => ({
							id: widget.id,
							position,
							width: widget.width,
						})),
					});
				}}
				onResize={(widgetId, width) =>
					updateLayout.mutate({
						dashboardId,
						widgets: (workspace.data.widgets as unknown as Widget[]).map(
							(widget, position) => ({
								id: widget.id,
								position,
								width: widget.id === widgetId ? width : widget.width,
							}),
						),
					})
				}
				onRemove={(id) => remove.mutate({ id })}
				busy={add.isPending || updateLayout.isPending || remove.isPending}
			/>
		) : (
			<Empty className="border">
				<EmptyHeader>
					<EmptyTitle>Dashboard unavailable</EmptyTitle>
					<EmptyDescription>
						{workspace.error?.message ??
							"It may have been removed or made private."}
					</EmptyDescription>
				</EmptyHeader>
				<Button variant="outline" onClick={() => void setDashboardId("")}>
					Back to dashboards
				</Button>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<Input
					value={q}
					onChange={(event) => {
						void setQ(event.target.value);
						void setPage(1);
					}}
					placeholder="Search dashboards…"
					aria-label="Search dashboards"
					className="sm:max-w-sm"
				/>
				<Select
					value={scope}
					onValueChange={(value) => {
						void setScope(value as typeof scope);
						void setPage(1);
					}}
				>
					<SelectTrigger className="w-full sm:w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Mine and public</SelectItem>
						<SelectItem value="mine">My dashboards</SelectItem>
						<SelectItem value="public">Public dashboards</SelectItem>
					</SelectContent>
				</Select>
				<Button className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
					<Icon icon={Add} /> New dashboard
				</Button>
			</div>

			{workspaces.isLoading ? (
				<div className="flex justify-center py-16">
					<Spinner />
				</div>
			) : workspaces.data?.rows.length ? (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{workspaces.data.rows.map((row) => (
						<button
							key={row.id}
							type="button"
							className="group flex min-h-40 flex-col border p-4 text-left transition-colors hover:bg-muted/40"
							onClick={() => void setDashboardId(row.id)}
						>
							<div className="mb-8 flex items-start justify-between gap-3">
								<StatusIndicator
									tone={row.visibility === "PUBLIC" ? "info" : "neutral"}
									label={row.visibility === "PUBLIC" ? "Public" : "Private"}
								/>
								<Icon
									icon={row.visibility === "PUBLIC" ? UserMultiple : Locked}
									className="text-muted-foreground"
								/>
							</div>
							<p className="font-medium text-base">{row.name}</p>
							<p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
								{row.description || "No description"}
							</p>
							<p className="mt-auto pt-4 text-muted-foreground text-xs">
								{row._count.widgets} widgets · {row.owner.name}
							</p>
						</button>
					))}
				</div>
			) : (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>No dashboards found</EmptyTitle>
						<EmptyDescription>
							Create a private canvas for yourself or publish one for everyone.
						</EmptyDescription>
					</EmptyHeader>
					<Button onClick={() => setCreateOpen(true)}>Create dashboard</Button>
				</Empty>
			)}
			{workspaces.data && workspaces.data.total > 24 ? (
				<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-muted-foreground text-xs">
					<span>
						{workspaces.data.total} dashboards · page {page} of{" "}
						{Math.ceil(workspaces.data.total / 24)}
					</span>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => void setPage(page - 1)}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= Math.ceil(workspaces.data.total / 24)}
							onClick={() => void setPage(page + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			) : null}

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							create.mutate({
								name: String(form.get("name")),
								description: String(form.get("description") || "") || null,
								visibility: String(form.get("visibility")) as
									| "PRIVATE"
									| "PUBLIC",
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>New dashboard</DialogTitle>
							<DialogDescription>
								Start with an empty grid, then add reusable widgets.
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 grid gap-3">
							<Field>
								<FieldLabel htmlFor="dashboard-name">Name</FieldLabel>
								<Input id="dashboard-name" name="name" required autoFocus />
							</Field>
							<Field>
								<FieldLabel htmlFor="dashboard-description">
									Description
								</FieldLabel>
								<Input id="dashboard-description" name="description" />
							</Field>
							<Field>
								<FieldLabel>Visibility</FieldLabel>
								<Select name="visibility" defaultValue="PRIVATE">
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="PRIVATE">Only me</SelectItem>
										<SelectItem value="PUBLIC">Everyone</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setCreateOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={create.isPending}>
								Create dashboard
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function DashboardCanvas({
	workspace,
	templates,
	addOpen,
	setAddOpen,
	onBack,
	onAdd,
	onMove,
	onReorder,
	onResize,
	onRemove,
	busy,
}: {
	workspace: Workspace;
	templates: Template[];
	addOpen: boolean;
	setAddOpen: (open: boolean) => void;
	onBack: () => void;
	onAdd: (template: Template) => void;
	onMove: (id: string, direction: -1 | 1) => void;
	onReorder: (id: string, targetId: string) => void;
	onResize: (id: string, width: number) => void;
	onRemove: (id: string) => void;
	busy: boolean;
}) {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
				<div className="flex min-w-0 items-start gap-3">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Back to dashboards"
						onClick={onBack}
					>
						<Icon icon={ArrowLeft} />
					</Button>
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-medium text-xl">{workspace.name}</h2>
							<StatusIndicator
								tone={workspace.visibility === "PUBLIC" ? "info" : "neutral"}
								label={workspace.visibility === "PUBLIC" ? "Public" : "Private"}
							/>
						</div>
						<p className="mt-1 text-muted-foreground text-xs">
							{workspace.description || `Owned by ${workspace.owner.name}`}
						</p>
					</div>
				</div>
				{workspace.canEdit ? (
					<Button onClick={() => setAddOpen(true)}>
						<Icon icon={Add} /> Add widget
					</Button>
				) : null}
			</div>
			{workspace.widgets.length ? (
				<div
					className="grid grid-cols-1 gap-3 lg:grid-cols-12"
					aria-busy={busy}
				>
					{workspace.widgets.map((widget, index) => (
						<WorkspaceWidget
							key={widget.id}
							widget={widget}
							canEdit={workspace.canEdit}
							className={
								widget.width >= 12
									? "lg:col-span-12"
									: widget.width >= 9
										? "lg:col-span-9"
										: widget.width >= 6
											? "lg:col-span-6"
											: "lg:col-span-3"
							}
							onMoveUp={() => onMove(widget.id, -1)}
							onMoveDown={() => onMove(widget.id, 1)}
							moveUpDisabled={index === 0}
							moveDownDisabled={index === workspace.widgets.length - 1}
							dragging={draggingId === widget.id}
							onDragStart={(event) => {
								setDraggingId(widget.id);
								event.dataTransfer.effectAllowed = "move";
								event.dataTransfer.setData("text/plain", widget.id);
							}}
							onDragEnd={() => setDraggingId(null)}
							onDragOver={(event) => {
								if (draggingId && draggingId !== widget.id) {
									event.preventDefault();
									event.dataTransfer.dropEffect = "move";
								}
							}}
							onDrop={(event) => {
								event.preventDefault();
								const sourceId =
									draggingId || event.dataTransfer.getData("text/plain");
								if (sourceId && sourceId !== widget.id) {
									onReorder(sourceId, widget.id);
								}
								setDraggingId(null);
							}}
							onResize={(width) => onResize(widget.id, width)}
							onRemove={() => onRemove(widget.id)}
						/>
					))}
				</div>
			) : (
				<Empty className="min-h-72 border border-dashed">
					<EmptyHeader>
						<EmptyTitle>Build your first view</EmptyTitle>
						<EmptyDescription>
							Add a widget, then reorder and resize the grid. On mobile every
							widget becomes a readable full-width card.
						</EmptyDescription>
					</EmptyHeader>
					{workspace.canEdit ? (
						<Button onClick={() => setAddOpen(true)}>
							<Icon icon={Add} /> Add widget
						</Button>
					) : null}
				</Empty>
			)}
			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Add a widget</DialogTitle>
						<DialogDescription>
							Choose a governed metric template. You can rearrange and resize it
							after adding.
						</DialogDescription>
					</DialogHeader>
					<div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
						{templates.map((template) => (
							<button
								key={template.key}
								type="button"
								disabled={busy}
								className="border p-3 text-left hover:bg-muted/50"
								onClick={() => onAdd(template)}
							>
								<p className="font-medium text-sm">{template.name}</p>
								<p className="mt-1 text-muted-foreground text-xs">
									{template.description}
								</p>
							</button>
						))}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function WorkspaceWidget({
	widget,
	canEdit,
	className,
	onMoveUp,
	onMoveDown,
	moveUpDisabled,
	moveDownDisabled,
	dragging,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDrop,
	onResize,
	onRemove,
}: {
	widget: Widget;
	canEdit: boolean;
	className?: string;
	onMoveUp: () => void;
	onMoveDown: () => void;
	moveUpDisabled: boolean;
	moveDownDisabled: boolean;
	dragging: boolean;
	onDragStart: (event: DragEvent<HTMLElement>) => void;
	onDragEnd: () => void;
	onDragOver: (event: DragEvent<HTMLElement>) => void;
	onDrop: (event: DragEvent<HTMLElement>) => void;
	onResize: (width: number) => void;
	onRemove: () => void;
}) {
	const trpc = useTRPC();
	const rendered = useQuery(
		trpc.dashboard.renderWidget.queryOptions({ id: widget.id }),
	);
	const view = rendered.data?.view as AnalyticsView | undefined;
	return (
		<Card
			className={cn(
				"min-w-0 transition-opacity",
				canEdit && "cursor-grab active:cursor-grabbing",
				dragging && "opacity-50",
				className,
			)}
			draggable={canEdit}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={onDragOver}
			onDrop={onDrop}
		>
			<CardHeader className="flex-row items-start justify-between gap-3">
				<div className="min-w-0">
					<CardTitle>{widget.title}</CardTitle>
					<CardDescription>{widget.description}</CardDescription>
				</div>
				{canEdit ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Widget actions for ${widget.title}`}
							>
								<Icon icon={OverflowMenuHorizontal} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem disabled={moveUpDisabled} onClick={onMoveUp}>
								<Icon icon={ArrowsVertical} /> Move earlier
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={moveDownDisabled}
								onClick={onMoveDown}
							>
								<Icon icon={ArrowsVertical} /> Move later
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onResize(3)}>
								Quarter width
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onResize(6)}>
								Half width
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onResize(12)}>
								Full width
							</DropdownMenuItem>
							<DropdownMenuItem variant="destructive" onClick={onRemove}>
								<Icon icon={TrashCan} /> Remove
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</CardHeader>
			<CardContent>
				{rendered.isLoading ? (
					<div className="flex h-56 items-center justify-center">
						<Spinner />
					</div>
				) : view ? (
					<BarTrend
						data={chartRows(view)}
						config={chartConfig(view)}
						xKey="label"
						height={230}
						showXAxis={view.chart.data.labels.length < 10}
						formatValue={formatMetric}
					/>
				) : (
					<p
						role="alert"
						className="py-12 text-center text-destructive text-xs"
					>
						{rendered.error?.message ?? "Widget data is unavailable."}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
