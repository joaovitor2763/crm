"use client";

import Add from "@carbon/icons-react/es/Add";
import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import ArrowsVertical from "@carbon/icons-react/es/ArrowsVertical";
import Locked from "@carbon/icons-react/es/Locked";
import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import SettingsAdjust from "@carbon/icons-react/es/SettingsAdjust";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DateRangePicker } from "@crm/ui/components/date-range-picker";
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
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { formatMoneyCompact, formatPercent } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryState,
} from "nuqs";
import {
	type DragEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useDeferredValue,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	AreaTrend,
	BarTrend,
	DonutStat,
	FunnelChart,
	RadialStat,
} from "@/components/dashboard-charts";
import { useTRPC } from "@/lib/trpc/client";
import {
	type AnalyticsView,
	chartConfig,
	chartRows,
	formatMetric,
} from "../studio/studio-analytics-data";
import {
	type DashboardSpec,
	DEFAULT_DASHBOARD_SPEC,
} from "../studio/studio-dashboard-definition-data";
import { studioMutationOptions } from "../studio/studio-trpc";

type Widget = {
	id: string;
	title: string;
	description: string | null;
	width: number;
	height: number;
	spec: DashboardSpec;
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
				widgets: Array<{
					id: string;
					position: number;
					width: number;
					height?: number;
				}>;
			}
		>(trpc.dashboard.updateWidgetLayout, {
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const updateWidget = useMutation(
		studioMutationOptions<
			unknown,
			{
				id: string;
				title?: string;
				description?: string | null;
				spec?: DashboardSpec;
			}
		>(trpc.dashboard.updateWidget, {
			onSuccess: async () => {
				await refresh();
				toast.success("Widget updated.");
			},
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
	const archive = useMutation(
		studioMutationOptions<unknown, { id: string }>(
			trpc.dashboard.archiveWorkspace,
			{
				onSuccess: async () => {
					await refresh();
					await setDashboardId("");
					toast.success("Dashboard archived.");
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
				onAdd={(input) => add.mutate({ dashboardId, ...input })}
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
				onResize={(widgetId, size) =>
					updateLayout.mutate({
						dashboardId,
						widgets: (workspace.data.widgets as unknown as Widget[]).map(
							(widget, position) => ({
								id: widget.id,
								position,
								width:
									widget.id === widgetId
										? (size.width ?? widget.width)
										: widget.width,
								height:
									widget.id === widgetId
										? (size.height ?? widget.height)
										: widget.height,
							}),
						),
					})
				}
				onSaveWidget={(input) => updateWidget.mutate(input)}
				onRemove={(id) => remove.mutate({ id })}
				onArchive={() => archive.mutate({ id: dashboardId })}
				busy={
					add.isPending ||
					updateLayout.isPending ||
					updateWidget.isPending ||
					remove.isPending ||
					archive.isPending
				}
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
					<SelectTrigger
						className="w-full sm:w-44"
						aria-label="Dashboard visibility"
					>
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
	onSaveWidget,
	onRemove,
	onArchive,
	busy,
}: {
	workspace: Workspace;
	templates: Template[];
	addOpen: boolean;
	setAddOpen: (open: boolean) => void;
	onBack: () => void;
	onAdd: (input: {
		title: string;
		description: string | null;
		spec: DashboardSpec;
		width: number;
	}) => void;
	onMove: (id: string, direction: -1 | 1) => void;
	onReorder: (id: string, targetId: string) => void;
	onResize: (id: string, size: { width?: number; height?: number }) => void;
	onSaveWidget: (input: {
		id: string;
		title?: string;
		description?: string | null;
		spec?: DashboardSpec;
	}) => void;
	onRemove: (id: string) => void;
	onArchive: () => void;
	busy: boolean;
}) {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [archiveOpen, setArchiveOpen] = useState(false);
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
					<div className="flex gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									aria-label="Dashboard actions"
								>
									<Icon icon={OverflowMenuHorizontal} />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setArchiveOpen(true)}
								>
									<Icon icon={TrashCan} /> Archive dashboard
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button onClick={() => setAddOpen(true)}>
							<Icon icon={Add} /> Add widget
						</Button>
					</div>
				) : null}
			</div>
			{workspace.widgets.length ? (
				<div
					className="relative grid grid-cols-1 gap-3 lg:grid-cols-12"
					aria-busy={busy}
				>
					{/* The grid a widget is about to land on, visible only while one
					    is in the air. */}
					{draggingId ? (
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 z-0 hidden gap-3 lg:grid lg:grid-cols-12"
						>
							{["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map(
								(column) => (
									<div
										key={column}
										className="border border-border/70 border-dashed bg-muted/30"
									/>
								),
							)}
						</div>
					) : null}
					{workspace.widgets.map((widget, index) => (
						<WorkspaceWidget
							key={widget.id}
							widget={widget}
							canEdit={workspace.canEdit}
							onMoveUp={() => onMove(widget.id, -1)}
							onMoveDown={() => onMove(widget.id, 1)}
							moveUpDisabled={index === 0}
							moveDownDisabled={index === workspace.widgets.length - 1}
							dragging={draggingId === widget.id}
							dropTarget={dragOverId === widget.id && draggingId !== widget.id}
							onDragStart={(event) => {
								setDraggingId(widget.id);
								event.dataTransfer.effectAllowed = "move";
								event.dataTransfer.setData("text/plain", widget.id);
							}}
							onDragEnd={() => {
								setDraggingId(null);
								setDragOverId(null);
							}}
							onDragOver={(event) => {
								if (draggingId && draggingId !== widget.id) {
									event.preventDefault();
									event.dataTransfer.dropEffect = "move";
									setDragOverId(widget.id);
								}
							}}
							onDragLeave={() => {
								setDragOverId((current) =>
									current === widget.id ? null : current,
								);
							}}
							onDrop={(event) => {
								event.preventDefault();
								const sourceId =
									draggingId || event.dataTransfer.getData("text/plain");
								if (sourceId && sourceId !== widget.id) {
									onReorder(sourceId, widget.id);
								}
								setDraggingId(null);
								setDragOverId(null);
							}}
							onResize={(size) => onResize(widget.id, size)}
							onSave={(input) => onSaveWidget({ id: widget.id, ...input })}
							onRemove={() => onRemove(widget.id)}
							busy={busy}
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
			{addOpen ? (
				<WidgetComposerDialog
					templates={templates}
					open={addOpen}
					onOpenChange={setAddOpen}
					onSubmit={(input) => onAdd({ ...input, width: 6 })}
					submitLabel="Add to dashboard"
					busy={busy}
				/>
			) : null}
			<Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Archive {workspace.name}?</DialogTitle>
						<DialogDescription>
							The dashboard will disappear from dashboard lists. Its widgets and
							configuration will no longer be available to viewers.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setArchiveOpen(false)}>
							Cancel
						</Button>
						<Button variant="destructive" disabled={busy} onClick={onArchive}>
							Archive dashboard
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

/** The column spans the canvas grid can actually render. */
const WIDGET_SPANS = [3, 6, 9, 12] as const;

function snapSpan(cols: number): number {
	let best: number = WIDGET_SPANS[0];
	for (const span of WIDGET_SPANS) {
		if (Math.abs(span - cols) < Math.abs(best - cols)) best = span;
	}
	return best;
}

function spanClass(width: number) {
	return width >= 12
		? "lg:col-span-12"
		: width >= 9
			? "lg:col-span-9"
			: width >= 6
				? "lg:col-span-6"
				: "lg:col-span-3";
}

/** One grid row of widget height, in pixels of plot. */
const ROW_PX = 52;
const HEIGHT_ROWS = { min: 2, max: 10 } as const;

type WidgetSlice = { key: string; label: string; value: number; color: string };

/** The first dataset as labelled slices, colored from the chart cycle. */
function widgetSlices(view: AnalyticsView): WidgetSlice[] {
	const labels = view.chart.data.labels ?? [];
	const data = view.chart.data.datasets[0]?.data ?? [];
	return labels.map((label, index) => ({
		key: `slice-${index}`,
		label: String(label),
		value: Number(data[index] ?? 0),
		color: `var(--chart-${(index % 5) + 1})`,
	}));
}

/**
 * "Sales pipeline · Demo booked" seven times over is noise once every label
 * shares the pipeline; keep the prefix only when it still distinguishes rows.
 */
function trimSharedPrefix(slices: WidgetSlice[]): WidgetSlice[] {
	const separator = " · ";
	const first = slices[0]?.label ?? "";
	const cut = first.indexOf(separator);
	if (cut < 0 || slices.length < 2) return slices;
	const prefix = first.slice(0, cut + separator.length);
	if (!slices.every((slice) => slice.label.startsWith(prefix))) return slices;
	return slices.map((slice) => ({
		...slice,
		label: slice.label.slice(prefix.length),
	}));
}

/**
 * The categorical legend under a widget plot — a quiet table, not recharts'
 * centered chip row. Axis labels overlap long before the reader gives up on a
 * list, so wide categories live here and the axis stays hidden.
 */
function WidgetLegend({
	slices,
	formatValue = formatMetric,
}: {
	slices: WidgetSlice[];
	formatValue?: (value: number | string) => string;
}) {
	return (
		<ul className="flex flex-col px-1">
			{slices.slice(0, 10).map((slice) => (
				<li
					key={slice.key}
					className="flex items-center gap-2 border-t py-1.5 text-xs first:border-t-0"
				>
					<span
						aria-hidden
						className="size-1.5 shrink-0"
						style={{ backgroundColor: slice.color }}
					/>
					<span className="min-w-0 flex-1 truncate">{slice.label}</span>
					<span className="shrink-0 font-medium tabular-nums">
						{formatValue(slice.value)}
					</span>
				</li>
			))}
		</ul>
	);
}

type WidgetOptions = {
	legend?: boolean;
	stacked?: boolean;
	/** Which field of the view's rows to plot; the dataset's default otherwise. */
	valueField?: "deals" | "won" | "valueCents" | "conversionRate";
	/** Funnel bubbles: share of the first stage, or rate vs. the previous one. */
	funnelRates?: "cumulative" | "step";
};

/** What a breakdown row can put on the Y axis, and how to read it back. */
const VALUE_FIELDS = [
	{ value: "deals", label: "Deal count" },
	{ value: "won", label: "Deals won" },
	{ value: "valueCents", label: "Deal value (sum)" },
	{ value: "conversionRate", label: "Win rate" },
] as const;

function valueFieldFormatter(
	field: WidgetOptions["valueField"],
): (value: number | string) => string {
	if (field === "valueCents")
		return (value) => formatMoneyCompact(Number(value));
	if (field === "conversionRate")
		return (value) => formatPercent(Number(value));
	return formatMetric;
}

/**
 * One rendered view, drawn as whatever the spec asked for. Shared between the
 * widgets on the canvas and the live preview in the add-widget builder so the
 * two can never disagree about what "Funnel" looks like.
 */
function WidgetChart({
	view,
	visualization,
	options,
	height,
	wide = true,
}: {
	view: AnalyticsView;
	visualization: string;
	options: WidgetOptions;
	height: number;
	/** Whether the plot has room for centered axis ticks. */
	wide?: boolean;
}) {
	// A chosen row field (deal value, win rate…) replaces the dataset's default
	// measure — the rows carry every cut the engine computed, so switching the
	// Y axis is a client-side re-read, not another query.
	const valueField = options.valueField;
	const fieldRows =
		valueField && view.rows.some((row) => typeof row[valueField] === "number")
			? view.rows
			: null;
	const slices = trimSharedPrefix(
		fieldRows && valueField
			? fieldRows.map((row, index) => ({
					key: `slice-${index}`,
					label: String(row.label ?? ""),
					value: Number(row[valueField] ?? 0),
					color: `var(--chart-${(index % 5) + 1})`,
				}))
			: widgetSlices(view),
	);
	const formatValue = fieldRows
		? valueFieldFormatter(valueField)
		: formatMetric;
	const cartesianData = fieldRows
		? slices.map((slice) => ({ label: slice.label, value: slice.value }))
		: chartRows(view);
	const cartesianConfig = fieldRows
		? {
				value: {
					label:
						VALUE_FIELDS.find((field) => field.value === valueField)?.label ??
						"Value",
					color: "var(--chart-1)",
				},
			}
		: chartConfig(view);
	const hasData = slices.some((slice) => slice.value !== 0);
	// Room for readable centered ticks, or hand the labels to the legend list.
	const axisFits =
		wide &&
		slices.length <= 4 &&
		slices.every((slice) => slice.label.length <= 16);
	const showLegendList =
		options.legend !== false &&
		["bar", "doughnut", "pie", "radial", "funnel"].includes(visualization) &&
		!axisFits;

	if (!hasData) {
		return (
			<div
				className="flex items-center justify-center text-muted-foreground text-sm"
				style={{ height }}
			>
				No data in this window. Try a wider date range or another pipeline.
			</div>
		);
	}

	const funnelData = [...slices]
		.sort((left, right) => right.value - left.value)
		.map((slice) => ({
			label: slice.label,
			value: slice.value,
			color: slice.color,
		}));
	// Step rates read each stage against the one before it; the component's own
	// default is cumulative (share of the first stage).
	const funnelPercentages =
		options.funnelRates === "step"
			? funnelData.map((stage, index) => {
					const previous = funnelData[index - 1];
					if (!previous) return 100;
					return previous.value > 0 ? (stage.value / previous.value) * 100 : 0;
				})
			: undefined;

	const plot =
		visualization === "funnel" ? (
			<FunnelChart
				data={funnelData}
				percentages={funnelPercentages}
				showLabels={false}
				showValues={false}
				labelLayout="grouped"
				formatValue={(value) => formatValue(value)}
				style={{ maxHeight: height, aspectRatio: "auto", height }}
			/>
		) : visualization === "doughnut" || visualization === "pie" ? (
			<DonutStat data={slices} height={height} formatValue={formatValue} />
		) : visualization === "radial" ? (
			<RadialStat data={slices} height={height} formatValue={formatValue} />
		) : visualization === "line" || visualization === "area" ? (
			<AreaTrend
				data={cartesianData}
				config={cartesianConfig}
				xKey="label"
				height={height}
				showXAxis={axisFits || view.key === "timeSeries"}
				showLegend={options.legend === true && view.key === "timeSeries"}
				stacked={options.stacked === true}
				formatValue={formatValue}
			/>
		) : (
			<BarTrend
				data={cartesianData}
				config={cartesianConfig}
				xKey="label"
				height={height}
				showXAxis={axisFits}
				showLegend={false}
				stacked={options.stacked === true}
				formatValue={formatValue}
			/>
		);

	return (
		<>
			{plot}
			{showLegendList ? (
				<WidgetLegend slices={slices} formatValue={formatValue} />
			) : null}
		</>
	);
}

function WorkspaceWidget({
	widget,
	canEdit,
	onMoveUp,
	onMoveDown,
	moveUpDisabled,
	moveDownDisabled,
	dragging,
	dropTarget,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDragLeave,
	onDrop,
	onResize,
	onSave,
	onRemove,
	busy,
}: {
	widget: Widget;
	canEdit: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	moveUpDisabled: boolean;
	moveDownDisabled: boolean;
	dragging: boolean;
	dropTarget: boolean;
	onDragStart: (event: DragEvent<HTMLElement>) => void;
	onDragEnd: () => void;
	onDragOver: (event: DragEvent<HTMLElement>) => void;
	onDragLeave: () => void;
	onDrop: (event: DragEvent<HTMLElement>) => void;
	onResize: (size: { width?: number; height?: number }) => void;
	onSave: (input: {
		title?: string;
		description?: string | null;
		spec?: DashboardSpec;
	}) => void;
	onRemove: () => void;
	busy: boolean;
}) {
	const trpc = useTRPC();
	const rendered = useQuery(
		trpc.dashboard.renderWidget.queryOptions({ id: widget.id }),
	);
	const view = rendered.data?.view as AnalyticsView | undefined;
	const [editOpen, setEditOpen] = useState(false);

	const spec = widget.spec;
	const options = (spec?.options ?? {}) as WidgetOptions;
	// "bar" is the enum default the old bowtie template shipped with; a bowtie
	// that never chose a shape gets the funnel it was named after.
	const visualization =
		spec?.metric === "macroBowtie" && spec.visualization === "bar"
			? "funnel"
			: (spec?.visualization ?? "bar");
	const chartHeight = Math.max(widget.height, HEIGHT_ROWS.min) * ROW_PX;

	const cardRef = useRef<HTMLDivElement>(null);
	// The size shown while a handle is mid-drag; committed on release.
	const [preview, setPreview] = useState<{
		width: number;
		height: number;
	} | null>(null);
	const resizeStart = useRef<{
		axis: "x" | "y";
		x: number;
		y: number;
		width: number;
		height: number;
		colPx: number;
	} | null>(null);

	const beginResize =
		(axis: "x" | "y") => (event: ReactPointerEvent<HTMLElement>) => {
			const card = cardRef.current;
			if (!card) return;
			// The card is draggable for reordering; a resize must not also start a
			// drag, and the pointer stays ours even when it leaves the handle.
			event.preventDefault();
			event.stopPropagation();
			event.currentTarget.setPointerCapture(event.pointerId);
			resizeStart.current = {
				axis,
				x: event.clientX,
				y: event.clientY,
				width: widget.width,
				height: widget.height,
				colPx: card.offsetWidth / widget.width,
			};
		};
	const moveResize = (event: ReactPointerEvent<HTMLElement>) => {
		const start = resizeStart.current;
		if (!start) return;
		if (start.axis === "x") {
			const cols = start.width + (event.clientX - start.x) / start.colPx;
			setPreview({ width: snapSpan(cols), height: start.height });
		} else {
			const rows = Math.round(
				start.height + (event.clientY - start.y) / ROW_PX,
			);
			setPreview({
				width: start.width,
				height: Math.min(Math.max(rows, HEIGHT_ROWS.min), HEIGHT_ROWS.max),
			});
		}
	};
	const endResize = () => {
		const start = resizeStart.current;
		resizeStart.current = null;
		if (
			start &&
			preview &&
			(preview.width !== widget.width || preview.height !== widget.height)
		) {
			onResize({ width: preview.width, height: preview.height });
		}
		setPreview(null);
	};

	const previewHeight = preview?.height ?? widget.height;
	const plotHeight =
		preview !== null
			? Math.max(previewHeight, HEIGHT_ROWS.min) * ROW_PX
			: chartHeight;
	const plot = view ? (
		<WidgetChart
			view={view}
			visualization={visualization}
			options={options}
			height={plotHeight}
			wide={(preview?.width ?? widget.width) >= 6}
		/>
	) : null;

	return (
		<Card
			ref={cardRef}
			className={cn(
				"group/widget relative z-10 min-w-0 bg-background transition-opacity",
				canEdit && "cursor-grab active:cursor-grabbing",
				dragging && "opacity-50",
				dropTarget && "ring-1 ring-ring",
				preview !== null && "select-none ring-1 ring-ring",
				spanClass(preview?.width ?? widget.width),
			)}
			draggable={canEdit && preview === null}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<CardHeader>
				<div className="min-w-0">
					<CardTitle>{widget.title}</CardTitle>
					<CardDescription>{widget.description}</CardDescription>
				</div>
				{canEdit ? (
					<CardAction>
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
								<DropdownMenuItem onClick={() => setEditOpen(true)}>
									<Icon icon={SettingsAdjust} /> Edit widget
								</DropdownMenuItem>
								<DropdownMenuItem disabled={moveUpDisabled} onClick={onMoveUp}>
									<Icon icon={ArrowsVertical} /> Move earlier
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={moveDownDisabled}
									onClick={onMoveDown}
								>
									<Icon icon={ArrowsVertical} /> Move later
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onClick={onRemove}>
									<Icon icon={TrashCan} /> Remove
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent>
				{rendered.isLoading ? (
					<div
						className="flex items-center justify-center"
						style={{ height: plotHeight }}
					>
						<Spinner />
					</div>
				) : view ? (
					plot
				) : (
					<p
						role="alert"
						className="py-12 text-center text-destructive text-xs"
					>
						{rendered.error?.message ?? "Widget data is unavailable."}
					</p>
				)}
			</CardContent>
			{canEdit ? (
				<>
					<button
						type="button"
						aria-label={`Resize ${widget.title} width`}
						draggable={false}
						onPointerDown={beginResize("x")}
						onPointerMove={moveResize}
						onPointerUp={endResize}
						onPointerCancel={endResize}
						onDragStart={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
						className="-right-1.5 absolute inset-y-0 z-10 hidden w-3 cursor-col-resize items-center justify-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover/widget:opacity-100 lg:flex"
					>
						<span className="h-8 w-1 bg-border transition-colors group-hover/widget:bg-muted-foreground/50" />
					</button>
					<button
						type="button"
						aria-label={`Resize ${widget.title} height`}
						draggable={false}
						onPointerDown={beginResize("y")}
						onPointerMove={moveResize}
						onPointerUp={endResize}
						onPointerCancel={endResize}
						onDragStart={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
						className="-bottom-1.5 absolute inset-x-0 z-10 hidden h-3 cursor-row-resize items-center justify-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover/widget:opacity-100 lg:flex"
					>
						<span className="h-1 w-8 bg-border transition-colors group-hover/widget:bg-muted-foreground/50" />
					</button>
				</>
			) : null}
			{editOpen ? (
				<WidgetComposerDialog
					initial={{
						title: widget.title,
						description: widget.description,
						spec: widget.spec,
					}}
					open={editOpen}
					onOpenChange={setEditOpen}
					busy={busy}
					submitLabel="Save widget"
					onSubmit={(input) => {
						onSave(input);
						setEditOpen(false);
					}}
				/>
			) : null}
		</Card>
	);
}

const VISUALIZATIONS = [
	{ value: "bar", label: "Bars" },
	{ value: "line", label: "Line" },
	{ value: "area", label: "Area" },
	{ value: "doughnut", label: "Donut" },
	{ value: "pie", label: "Pie" },
	{ value: "radial", label: "Radial" },
	{ value: "funnel", label: "Funnel" },
] as const;

const GRAINS = [
	{ value: "day", label: "Day" },
	{ value: "week", label: "Week" },
	{ value: "month", label: "Month" },
	{ value: "quarter", label: "Quarter" },
] as const;

const METRICS: Array<{ value: DashboardSpec["metric"]; label: string }> = [
	{ value: "conversionRate", label: "Pipeline created vs. won" },
	{ value: "conversionTime", label: "Time to convert" },
	{ value: "stageRate", label: "Stage conversion rates" },
	{ value: "stageTime", label: "Time in each stage" },
	{ value: "breakdown", label: "Deals by dimension" },
	{ value: "macroBowtie", label: "Funnel across pipelines" },
];

const BREAKDOWN_DIMENSIONS: Array<{
	value: DashboardSpec["groupBy"][number];
	label: string;
}> = [
	{ value: "channel", label: "Channel" },
	{ value: "owner", label: "Owner" },
	{ value: "utmSource", label: "UTM source" },
	{ value: "utmMedium", label: "UTM medium" },
	{ value: "utmCampaign", label: "UTM campaign" },
	{ value: "utmTerm", label: "UTM term" },
	{ value: "utmContent", label: "UTM content" },
	{ value: "dealAttribute", label: "Deal attribute" },
];
/** What is being dragged from the field palette, if anything. */
type PaletteDrag =
	| { kind: "metric"; value: DashboardSpec["metric"] }
	| { kind: "dimension"; value: DashboardSpec["groupBy"][number] };

function PaletteChip({
	label,
	onDragStart,
	onDragEnd,
}: {
	label: string;
	onDragStart: () => void;
	onDragEnd: () => void;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag source only; keyboard users get the same fields via the comboboxes in the wells
		<span
			draggable
			onDragStart={(event) => {
				event.dataTransfer.effectAllowed = "copy";
				event.dataTransfer.setData("text/plain", label);
				onDragStart();
			}}
			onDragEnd={onDragEnd}
			className="cursor-grab select-none border bg-background px-2 py-1 text-xs hover:bg-muted/50 active:cursor-grabbing"
		>
			{label}
		</span>
	);
}

/**
 * A slot a palette chip can land on. Quiet until a compatible chip is in the
 * air, then dashed and inviting, the way HubSpot's "Arraste campos" wells work.
 */
function DropZone({
	active,
	over,
	onDrop,
	onDragEnter,
	onDragLeave,
	children,
}: {
	active: boolean;
	over: boolean;
	onDrop: () => void;
	onDragEnter: () => void;
	onDragLeave: () => void;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drop target only; dropping is a pointer shortcut for the picker rendered inside it
		<div
			onDragOver={(event) => {
				if (active) event.preventDefault();
			}}
			onDragEnter={() => {
				if (active) onDragEnter();
			}}
			onDragLeave={onDragLeave}
			onDrop={(event) => {
				if (!active) return;
				event.preventDefault();
				onDrop();
			}}
			className={cn(
				"flex flex-col gap-1.5 p-2 transition-colors",
				active
					? "border border-muted-foreground/50 border-dashed bg-muted/30"
					: "border border-transparent",
				over && "border-ring bg-muted/60",
			)}
		>
			{children}
		</div>
	);
}

/**
 * The one editor a widget ever gets, whether it exists yet or not — now the
 * full HubSpot shape: a full-screen surface, configuration rail on the left,
 * the live chart taking the rest, and a field palette whose chips drag onto
 * the Measure and Break down wells.
 */
function WidgetComposerDialog({
	templates,
	initial,
	open,
	onOpenChange,
	onSubmit,
	submitLabel,
	busy,
}: {
	/** Offered as starting points; omit when editing an existing widget. */
	templates?: Template[];
	initial?: { title: string; description: string | null; spec: DashboardSpec };
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: {
		title: string;
		description: string | null;
		spec: DashboardSpec;
	}) => void;
	submitLabel: string;
	busy: boolean;
}) {
	const trpc = useTRPC();
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const baseSpec = initial?.spec ?? DEFAULT_DASHBOARD_SPEC;
	const baseOptions = (baseSpec.options ?? {}) as WidgetOptions;

	const [title, setTitle] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [metric, setMetric] = useState<DashboardSpec["metric"]>(
		baseSpec.metric,
	);
	const [dimension, setDimension] = useState<DashboardSpec["groupBy"][number]>(
		baseSpec.groupBy.find((candidate) =>
			BREAKDOWN_DIMENSIONS.some((option) => option.value === candidate),
		) ?? "channel",
	);
	const [attributeKey, setAttributeKey] = useState(
		baseSpec.filters.find((filter) => filter.key === "attributeKey")?.value ??
			"",
	);
	const [visualization, setVisualization] = useState<string>(
		baseSpec.metric === "macroBowtie" && baseSpec.visualization === "bar"
			? "funnel"
			: baseSpec.visualization,
	);
	const [legend, setLegend] = useState(baseOptions.legend !== false);
	const [valueField, setValueField] = useState<
		NonNullable<WidgetOptions["valueField"]>
	>(baseOptions.valueField ?? "deals");
	const [funnelRates, setFunnelRates] = useState<
		NonNullable<WidgetOptions["funnelRates"]>
	>(baseOptions.funnelRates ?? "cumulative");
	const [pipelineId, setPipelineId] = useState(
		baseSpec.filters.find((filter) => filter.key === "pipelineId")?.value ??
			"all",
	);
	const [window, setWindow] = useState<{ from: string; to: string }>({
		from: baseSpec.timeRange.from?.slice(0, 10) ?? "",
		to: baseSpec.timeRange.to?.slice(0, 10) ?? "",
	});
	const [grain, setGrain] = useState<string>(baseSpec.timeRange.grain);

	// Palette drag state: dataTransfer is unreadable during dragover, so the
	// chip announces itself here and the wells key their highlight off it.
	const [dragging, setDragging] = useState<PaletteDrag | null>(null);
	const [overZone, setOverZone] = useState<"measure" | "breakdown" | null>(
		null,
	);

	const metricLabel =
		METRICS.find((option) => option.value === metric)?.label ?? "New widget";

	const applyTemplate = (key: string) => {
		const template = templates?.find((candidate) => candidate.key === key);
		if (!template) return;
		const spec = template.spec;
		setTitle(template.name);
		setDescription(template.description);
		setMetric(spec.metric);
		const analyticsDimension = spec.groupBy.find((candidate) =>
			BREAKDOWN_DIMENSIONS.some((option) => option.value === candidate),
		);
		if (analyticsDimension) setDimension(analyticsDimension);
		setAttributeKey(
			spec.filters.find((filter) => filter.key === "attributeKey")?.value ?? "",
		);
		setVisualization(
			spec.metric === "macroBowtie" && spec.visualization === "bar"
				? "funnel"
				: spec.visualization,
		);
		setPipelineId(
			spec.filters.find((filter) => filter.key === "pipelineId")?.value ??
				"all",
		);
		setWindow({
			from: spec.timeRange.from?.slice(0, 10) ?? "",
			to: spec.timeRange.to?.slice(0, 10) ?? "",
		});
		setGrain(spec.timeRange.grain);
	};

	const needsAttributeKey =
		metric === "breakdown" && dimension === "dealAttribute" && !attributeKey;

	const spec: DashboardSpec = {
		...baseSpec,
		metric,
		groupBy:
			metric === "breakdown"
				? [dimension]
				: metric === "macroBowtie" || metric === "conversionRate"
					? ["pipeline", "stage"]
					: [],
		filters: [
			...(pipelineId !== "all"
				? [
						{
							key: "pipelineId" as const,
							operator: "eq" as const,
							value: pipelineId,
						},
					]
				: []),
			...(metric === "breakdown" &&
			dimension === "dealAttribute" &&
			attributeKey
				? [
						{
							key: "attributeKey" as const,
							operator: "eq" as const,
							value: attributeKey,
						},
					]
				: []),
		],
		visualization: visualization as DashboardSpec["visualization"],
		timeRange: {
			...baseSpec.timeRange,
			from: window.from || undefined,
			to: window.to || undefined,
			grain: grain as DashboardSpec["timeRange"]["grain"],
		},
		options: {
			...baseSpec.options,
			legend,
			valueField: metric === "breakdown" ? valueField : undefined,
			funnelRates,
		},
	};

	// One render per settled spec, not one per keystroke.
	const deferredSpec = useDeferredValue(JSON.stringify(spec));
	const preview = useQuery({
		...trpc.dashboard.previewWidget.queryOptions({
			spec: JSON.parse(deferredSpec) as DashboardSpec,
		}),
		enabled: open && !needsAttributeKey,
		placeholderData: (previous) => previous,
	});
	const previewView = preview.data?.view as AnalyticsView | undefined;

	const endDrag = () => {
		setDragging(null);
		setOverZone(null);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[94dvh] flex-col sm:top-[3dvh] sm:max-w-[min(96vw,1600px)] sm:translate-y-0">
				<DialogHeader>
					<DialogTitle>
						{initial ? "Edit widget" : "Build a widget"}
					</DialogTitle>
					<DialogDescription>
						Drag a field onto Measure or Break down, or pick from the lists —
						the chart updates as you go.
					</DialogDescription>
				</DialogHeader>
				{/* col-span utilities rather than an arbitrary template: these classes
				    have been in the stylesheet since the canvas shipped, so a stale
				    cached CSS chunk cannot collapse the editor into one column. */}
				<div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-12">
					<div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 lg:col-span-3">
						{templates?.length ? (
							<Field>
								<FieldLabel>Start from</FieldLabel>
								<SearchCombobox
									value=""
									onValueChange={applyTemplate}
									options={templates.map((template) => ({
										value: template.key,
										label: template.name,
										description: template.description,
									}))}
									placeholder="A template (optional)"
									searchPlaceholder="Search templates…"
									className="w-full"
								/>
							</Field>
						) : null}
						<Field>
							<FieldLabel htmlFor="composer-title">Title</FieldLabel>
							<Input
								id="composer-title"
								value={title}
								placeholder={metricLabel}
								onChange={(event) => setTitle(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="composer-description">
								Description
							</FieldLabel>
							<Input
								id="composer-description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</Field>

						<p className="mt-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Chart data
						</p>
						<DropZone
							active={dragging !== null}
							over={overZone === "measure"}
							onDragEnter={() => setOverZone("measure")}
							onDragLeave={() =>
								setOverZone((zone) => (zone === "measure" ? null : zone))
							}
							onDrop={() => {
								if (!dragging) return;
								if (dragging.kind === "metric") setMetric(dragging.value);
								else {
									setMetric("breakdown");
									setDimension(dragging.value);
								}
								endDrag();
							}}
						>
							<FieldLabel>Measure</FieldLabel>
							<SearchCombobox
								value={metric}
								onValueChange={(value) =>
									setMetric(value as DashboardSpec["metric"])
								}
								options={METRICS.map((option) => ({ ...option }))}
								searchPlaceholder="Search measures…"
								className="w-full"
							/>
						</DropZone>
						<DropZone
							active={dragging?.kind === "dimension"}
							over={overZone === "breakdown"}
							onDragEnter={() => setOverZone("breakdown")}
							onDragLeave={() =>
								setOverZone((zone) => (zone === "breakdown" ? null : zone))
							}
							onDrop={() => {
								if (dragging?.kind !== "dimension") return;
								setMetric("breakdown");
								setDimension(dragging.value);
								endDrag();
							}}
						>
							<FieldLabel>Break down by</FieldLabel>
							{metric === "breakdown" ? (
								<SearchCombobox
									value={dimension}
									onValueChange={(value) =>
										setDimension(value as DashboardSpec["groupBy"][number])
									}
									options={BREAKDOWN_DIMENSIONS.map((option) => ({
										...option,
									}))}
									searchPlaceholder="Search dimensions…"
									className="w-full"
								/>
							) : (
								<p className="py-1 text-muted-foreground text-xs">
									Drop a dimension here to cut deals by it.
								</p>
							)}
						</DropZone>
						{metric === "breakdown" ? (
							<Field>
								<FieldLabel>Value</FieldLabel>
								<SearchCombobox
									value={valueField}
									onValueChange={(value) =>
										setValueField(
											value as NonNullable<WidgetOptions["valueField"]>,
										)
									}
									options={VALUE_FIELDS.map((option) => ({ ...option }))}
									searchPlaceholder="Search values…"
									className="w-full"
								/>
							</Field>
						) : null}
						{metric === "breakdown" && dimension === "dealAttribute" ? (
							<Field>
								<FieldLabel htmlFor="composer-attribute">
									Attribute key
								</FieldLabel>
								<Input
									id="composer-attribute"
									value={attributeKey}
									placeholder="e.g. segment"
									onChange={(event) => setAttributeKey(event.target.value)}
								/>
							</Field>
						) : null}

						<p className="mt-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Fields — drag onto a well above
						</p>
						<div className="flex flex-wrap gap-1.5">
							{METRICS.map((option) => (
								<PaletteChip
									key={option.value}
									label={option.label}
									onDragStart={() =>
										setDragging({ kind: "metric", value: option.value })
									}
									onDragEnd={endDrag}
								/>
							))}
						</div>
						<div className="flex flex-wrap gap-1.5">
							{BREAKDOWN_DIMENSIONS.map((option) => (
								<PaletteChip
									key={option.value}
									label={option.label}
									onDragStart={() =>
										setDragging({ kind: "dimension", value: option.value })
									}
									onDragEnd={endDrag}
								/>
							))}
						</div>

						<p className="mt-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Display
						</p>
						<Field>
							<FieldLabel>Chart type</FieldLabel>
							<SearchCombobox
								value={visualization}
								onValueChange={setVisualization}
								options={VISUALIZATIONS.map((option) => ({ ...option }))}
								searchPlaceholder="Search chart types…"
								className="w-full"
							/>
						</Field>
						{visualization === "funnel" ? (
							<Field>
								<FieldLabel>Stage rates</FieldLabel>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									spacing={0}
									value={funnelRates}
									onValueChange={(next) => {
										if (next === "cumulative" || next === "step")
											setFunnelRates(next);
									}}
									aria-label="How funnel percentages read"
								>
									<ToggleGroupItem value="cumulative">
										Cumulative
									</ToggleGroupItem>
									<ToggleGroupItem value="step">Per step</ToggleGroupItem>
								</ToggleGroup>
							</Field>
						) : null}
						<label
							htmlFor="composer-legend"
							className="flex items-center justify-between gap-3 border p-3 text-sm"
						>
							<span>
								Legend
								<span className="block text-muted-foreground text-xs">
									List the categories with their values under the chart
								</span>
							</span>
							<Switch
								id="composer-legend"
								checked={legend}
								onCheckedChange={setLegend}
							/>
						</label>

						<p className="mt-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Filters
						</p>
						<Field>
							<FieldLabel>Pipeline</FieldLabel>
							<SearchCombobox
								value={pipelineId}
								onValueChange={setPipelineId}
								options={[
									{ value: "all", label: "All pipelines" },
									...(pipelines.data ?? []).map((pipeline) => ({
										value: pipeline.id,
										label: pipeline.name,
									})),
								]}
								searchPlaceholder="Search pipelines…"
								className="w-full"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="composer-window">Date window</FieldLabel>
							<DateRangePicker
								id="composer-window"
								value={window}
								onChange={setWindow}
							/>
						</Field>
						<Field>
							<FieldLabel>Frequency</FieldLabel>
							<SearchCombobox
								value={grain}
								onValueChange={setGrain}
								options={GRAINS.map((option) => ({ ...option }))}
								searchPlaceholder="Search frequencies…"
								className="w-full"
							/>
						</Field>
					</div>
					<div className="flex min-h-0 flex-col border p-5 lg:col-span-9">
						{needsAttributeKey ? (
							<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
								Enter the deal attribute key to preview this cut.
							</div>
						) : preview.isLoading ? (
							<div className="flex flex-1 items-center justify-center">
								<Spinner />
							</div>
						) : previewView ? (
							<div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
								<WidgetChart
									view={previewView}
									visualization={visualization}
									options={{
										legend,
										valueField: metric === "breakdown" ? valueField : undefined,
										funnelRates,
									}}
									height={440}
								/>
							</div>
						) : (
							<div className="flex flex-1 items-center justify-center text-destructive text-xs">
								{preview.error?.message ?? "Preview is unavailable."}
							</div>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={busy || needsAttributeKey}
						onClick={() =>
							onSubmit({
								title: title.trim() || metricLabel,
								description: description.trim() || null,
								spec,
							})
						}
					>
						{submitLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
