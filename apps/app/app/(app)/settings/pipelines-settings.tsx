"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { studioMutationOptions } from "../studio/studio-trpc";

type Pipeline = RouterOutputs["pipelines"]["list"][number];
type Stage = Pipeline["stages"][number];

export function PipelinesSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: true }),
	);
	const directory = useQuery(trpc.governance.directory.queryOptions());
	const [name, setName] = useState("");
	const [businessUnitId, setBusinessUnitId] = useState("");
	const [newStages, setNewStages] = useState<Record<string, string>>({});
	const [q, setQ] = useState("");
	const [status, setStatus] = useState<"active" | "archived" | "all">("active");
	const [creating, setCreating] = useState(false);
	const [editingPipelineId, setEditingPipelineId] = useState<string | null>(
		null,
	);
	const [editingStageId, setEditingStageId] = useState<string | null>(null);
	const [addingStagePipelineId, setAddingStagePipelineId] = useState<
		string | null
	>(null);
	const visiblePipelines = (pipelines.data ?? []).filter((pipeline) => {
		if (status === "active" && pipeline.archivedAt) return false;
		if (status === "archived" && !pipeline.archivedAt) return false;
		return pipeline.name.toLowerCase().includes(q.trim().toLowerCase());
	});

	const done = async (message: string) => {
		await cache.pipelines();
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);
	const create = useMutation(
		trpc.pipelines.create.mutationOptions({
			onSuccess: async () => {
				setName("");
				setCreating(false);
				await done("Pipeline created.");
			},
			onError: fail,
		}),
	);
	const update = useMutation(
		trpc.pipelines.update.mutationOptions({
			onSuccess: () => done("Pipeline updated."),
			onError: fail,
		}),
	);
	const archive = useMutation(
		trpc.pipelines.archive.mutationOptions({
			onSuccess: () => done("Pipeline archived."),
			onError: fail,
		}),
	);
	const restore = useMutation(
		trpc.pipelines.restore.mutationOptions({
			onSuccess: () => done("Pipeline restored."),
			onError: fail,
		}),
	);
	const createStage = useMutation(
		studioMutationOptions<
			unknown,
			{ pipelineId: string; name: string; type: "OPEN" }
		>(trpc.pipelines.createStage, {
			onSuccess: async (_, variables) => {
				setNewStages((current) => ({ ...current, [variables.pipelineId]: "" }));
				setAddingStagePipelineId(null);
				await done("Stage created.");
			},
			onError: fail,
		}),
	);
	const updateStage = useMutation(
		trpc.pipelines.updateStage.mutationOptions({
			onSuccess: () => done("Stage updated."),
			onError: fail,
		}),
	);
	const reorder = useMutation(
		trpc.pipelines.reorderStages.mutationOptions({
			onSuccess: () => done("Stage order updated."),
			onError: fail,
		}),
	);
	const removeStage = useMutation(
		trpc.pipelines.removeStage.mutationOptions({
			onSuccess: () => done("Stage removed."),
			onError: fail,
		}),
	);

	return (
		<Card className="overflow-hidden">
			<CardHeader>
				<CardTitle>Pipelines and stages</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_auto] sm:items-center">
					<Input
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder="Search pipelines…"
						aria-label="Search pipelines"
					/>
					<Select
						value={status}
						onValueChange={(value) => setStatus(value as typeof status)}
					>
						<SelectTrigger aria-label="Pipeline status">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="archived">Archived</SelectItem>
								<SelectItem value="all">All</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
					<span className="text-muted-foreground text-xs tabular-nums">
						{visiblePipelines.length} pipelines
					</span>
				</div>

				<div className="my-4 flex items-center justify-between border-y py-3">
					<div>
						<p className="font-medium text-sm">Sales processes</p>
						<p className="text-muted-foreground text-xs">
							Open a pipeline only when you need to change it.
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						onClick={() => setCreating((value) => !value)}
					>
						{creating ? "Cancel" : "New pipeline"}
					</Button>
				</div>

				{creating ? (
					<form
						className="mb-6 grid gap-3 bg-muted/30 p-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
						onSubmit={(event) => {
							event.preventDefault();
							if (name.trim())
								create.mutate({
									name,
									businessUnitId: businessUnitId || undefined,
								});
						}}
					>
						<Field>
							<FieldLabel htmlFor="new-pipeline">Pipeline name</FieldLabel>
							<Input
								id="new-pipeline"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Enterprise sales"
							/>
						</Field>
						<Field>
							<FieldLabel>Business unit</FieldLabel>
							<Select value={businessUnitId} onValueChange={setBusinessUnitId}>
								<SelectTrigger>
									<SelectValue placeholder="Primary unit" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{(directory.data?.businessUnits ?? []).map((unit) => (
											<SelectItem key={unit.id} value={unit.id}>
												{unit.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Button type="submit" disabled={!name.trim() || create.isPending}>
							Create pipeline
						</Button>
					</form>
				) : null}

				{visiblePipelines.map((pipeline) => (
					<section key={pipeline.id} className="border-b py-5 last:border-b-0">
						<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="font-medium text-base">{pipeline.name}</h3>
								{pipeline.businessUnit ? (
									<StatusIndicator
										tone="neutral"
										label={pipeline.businessUnit.name}
									/>
								) : null}
								{pipeline.isDefault ? (
									<StatusIndicator tone="success" label="Default" />
								) : null}
								{pipeline.archivedAt ? (
									<StatusIndicator tone="neutral" label="Archived" />
								) : null}
							</div>
							<div className="flex flex-wrap gap-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setEditingPipelineId(pipeline.id)}
								>
									Rename
								</Button>
								{!pipeline.isDefault && !pipeline.archivedAt ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											update.mutate({ id: pipeline.id, isDefault: true })
										}
									>
										Make default
									</Button>
								) : null}
								{pipeline.archivedAt ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => restore.mutate({ id: pipeline.id })}
									>
										Restore
									</Button>
								) : !pipeline.isDefault ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											if (
												window.confirm(
													`Archive ${pipeline.name}? Existing deals keep their pipeline history.`,
												)
											)
												archive.mutate({ id: pipeline.id });
										}}
									>
										Archive
									</Button>
								) : null}
							</div>
						</div>

						{editingPipelineId === pipeline.id ? (
							<form
								className="mb-4 flex gap-2 bg-muted/30 p-3"
								onSubmit={(event) => {
									event.preventDefault();
									const renamed = String(
										new FormData(event.currentTarget).get("name") ?? "",
									).trim();
									if (!renamed) return;
									update
										.mutateAsync({ id: pipeline.id, name: renamed })
										.then(() => setEditingPipelineId(null))
										.catch(() => undefined);
								}}
							>
								<Input
									name="name"
									defaultValue={pipeline.name}
									aria-label="Pipeline name"
								/>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setEditingPipelineId(null)}
								>
									Cancel
								</Button>
								<Button type="submit">Save</Button>
							</form>
						) : null}

						<div className="divide-y border-y">
							{pipeline.stages.map((stage, index) => (
								<StageRow
									key={stage.id}
									stage={stage}
									editing={editingStageId === stage.id}
									first={index === 0}
									last={index === pipeline.stages.length - 1}
									onEdit={() => setEditingStageId(stage.id)}
									onCancel={() => setEditingStageId(null)}
									onSave={(values) =>
										updateStage
											.mutateAsync({ id: stage.id, ...values })
											.then(() => undefined)
									}
									onMove={(direction) =>
										reorder.mutate({
											pipelineId: pipeline.id,
											stageIds: moved(pipeline.stages, index, direction),
										})
									}
									onRemove={() => removeStage.mutate({ id: stage.id })}
								/>
							))}
						</div>

						{addingStagePipelineId === pipeline.id ? (
							<form
								className="mt-4 flex gap-2 bg-muted/30 p-3"
								onSubmit={(event) => {
									event.preventDefault();
									const stageName = newStages[pipeline.id]?.trim();
									if (stageName)
										createStage.mutate({
											pipelineId: pipeline.id,
											name: stageName,
											type: "OPEN",
										});
								}}
							>
								<Input
									value={newStages[pipeline.id] ?? ""}
									onChange={(event) =>
										setNewStages((current) => ({
											...current,
											[pipeline.id]: event.target.value,
										}))
									}
									placeholder="Stage name"
									aria-label="New stage name"
								/>
								<Button
									type="button"
									variant="ghost"
									onClick={() => setAddingStagePipelineId(null)}
								>
									Cancel
								</Button>
								<Button type="submit">Add</Button>
							</form>
						) : (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="mt-4"
								onClick={() => setAddingStagePipelineId(pipeline.id)}
							>
								Add stage
							</Button>
						)}
					</section>
				))}
			</CardContent>
		</Card>
	);
}

function StageRow({
	stage,
	onSave,
	onMove,
	onRemove,
	first,
	last,
	editing,
	onEdit,
	onCancel,
}: {
	stage: Stage;
	onSave: (values: { name: string; type: Stage["type"] }) => Promise<void>;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
	first: boolean;
	last: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState(stage.name);
	const [type, setType] = useState<Stage["type"]>(stage.type);
	const cancel = () => {
		setName(stage.name);
		setType(stage.type);
		onCancel();
	};
	if (!editing)
		return (
			<div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2">
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">{stage.name}</p>
					<p className="text-muted-foreground text-xs">
						{stageTypeLabel(stage.type)}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="xs"
						disabled={first}
						onClick={() => onMove(-1)}
						aria-label={`Move ${stage.name} up`}
					>
						↑
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="xs"
						disabled={last}
						onClick={() => onMove(1)}
						aria-label={`Move ${stage.name} down`}
					>
						↓
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						Edit
					</Button>
				</div>
			</div>
		);
	return (
		<form
			className="grid gap-2 bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!name.trim()) return;
				try {
					await onSave({ name: name.trim(), type });
					onCancel();
				} catch {
					// The mutation owns the error toast; preserve the draft for retry.
				}
			}}
		>
			<Input
				name="name"
				value={name}
				onChange={(event) => setName(event.target.value)}
				aria-label="Stage name"
			/>
			<Select
				name="type"
				value={type}
				onValueChange={(value) => setType(value as Stage["type"])}
			>
				<SelectTrigger aria-label="Stage outcome">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectItem value="OPEN">Open</SelectItem>
						<SelectItem value="WON">Won</SelectItem>
						<SelectItem value="LOST">Lost</SelectItem>
						<SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			<div className="flex justify-end gap-2 sm:col-span-2">
				<Button type="button" variant="ghost" size="sm" onClick={cancel}>
					Cancel
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="text-destructive"
					onClick={() => {
						if (
							window.confirm(
								`Remove ${stage.name}? This is only allowed when no deals depend on it.`,
							)
						)
							onRemove();
					}}
				>
					Remove
				</Button>
				<Button type="submit" size="sm">
					Save changes
				</Button>
			</div>
		</form>
	);
}

function stageTypeLabel(type: Stage["type"]) {
	return type === "OPEN"
		? "Open stage"
		: type === "WON"
			? "Won outcome"
			: type === "LOST"
				? "Lost outcome"
				: "Unqualified outcome";
}

function moved(stages: Stage[], index: number, direction: -1 | 1): string[] {
	const ids = stages.map((stage) => stage.id);
	const target = index + direction;
	if (target < 0 || target >= ids.length) return ids;
	const current = ids[index];
	const other = ids[target];
	if (!current || !other) return ids;
	ids[index] = other;
	ids[target] = current;
	return ids;
}
