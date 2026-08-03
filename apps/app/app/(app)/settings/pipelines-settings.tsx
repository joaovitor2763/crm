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
	const visiblePipelines = (pipelines.data ?? []).filter((pipeline) => {
		if (status === "active" && pipeline.archivedAt) return false;
		if (status === "archived" && !pipeline.archivedAt) return false;
		return pipeline.name.toLowerCase().includes(q.trim().toLowerCase());
	});

	const done = async (message: string) => {
		await cache.pipelines();
		toast.success(message);
	};
	const fail = (error: { message: string }) => {
		toast.error(error.message);
	};
	const create = useMutation(
		trpc.pipelines.create.mutationOptions({
			onSuccess: async () => {
				setName("");
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
		<Card>
			<CardHeader>
				<CardTitle>Pipelines and stages</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="mb-4 grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_auto] sm:items-center">
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
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="archived">Archived</SelectItem>
							<SelectItem value="all">All</SelectItem>
						</SelectContent>
					</Select>
					<span className="text-muted-foreground text-xs tabular-nums">
						{visiblePipelines.length} pipelines
					</span>
				</div>
				<form
					className="grid gap-2 md:grid-cols-[2fr_1fr_auto] md:items-end"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim())
							create.mutate({
								name,
								businessUnitId: businessUnitId || undefined,
							});
					}}
				>
					<Field className="flex-1">
						<FieldLabel htmlFor="new-pipeline">New pipeline</FieldLabel>
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
								{(directory.data?.businessUnits ?? []).map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Button type="submit" disabled={!name.trim() || create.isPending}>
						Create
					</Button>
				</form>

				{visiblePipelines.map((pipeline) => (
					<Card key={pipeline.id}>
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<CardTitle>{pipeline.name}</CardTitle>
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
								<div className="flex gap-2">
									{!pipeline.isDefault && !pipeline.archivedAt ? (
										<Button
											variant="outline"
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
											variant="outline"
											size="sm"
											onClick={() => restore.mutate({ id: pipeline.id })}
										>
											Restore
										</Button>
									) : !pipeline.isDefault ? (
										<Button
											variant="outline"
											size="sm"
											onClick={() => archive.mutate({ id: pipeline.id })}
										>
											Archive
										</Button>
									) : null}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<form
								className="flex gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									const renamed = String(
										new FormData(event.currentTarget).get("name") ?? "",
									);
									if (renamed.trim())
										update.mutate({ id: pipeline.id, name: renamed });
								}}
							>
								<Input
									name="name"
									defaultValue={pipeline.name}
									aria-label="Pipeline name"
								/>
								<Button type="submit" variant="outline">
									Rename
								</Button>
							</form>

							<div className="flex flex-col gap-2">
								{pipeline.stages.map((stage, index) => (
									<StageRow
										key={stage.id}
										stage={stage}
										onSave={(values) =>
											updateStage.mutate({ id: stage.id, ...values })
										}
										onMove={(direction) =>
											reorder.mutate({
												pipelineId: pipeline.id,
												stageIds: moved(pipeline.stages, index, direction),
											})
										}
										onRemove={() => removeStage.mutate({ id: stage.id })}
										first={index === 0}
										last={index === pipeline.stages.length - 1}
									/>
								))}
							</div>

							<form
								className="flex gap-2"
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
									placeholder="Add a stage"
								/>
								<Button type="submit" variant="outline">
									Add stage
								</Button>
							</form>
						</CardContent>
					</Card>
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
}: {
	stage: Stage;
	onSave: (values: { name: string; type: Stage["type"] }) => void;
	onMove: (direction: -1 | 1) => void;
	onRemove: () => void;
	first: boolean;
	last: boolean;
}) {
	return (
		<form
			className="flex flex-wrap items-center gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				const values = new FormData(event.currentTarget);
				onSave({
					name: String(values.get("name") ?? ""),
					type: String(values.get("type")) as Stage["type"],
				});
			}}
		>
			<Input
				name="name"
				defaultValue={stage.name}
				aria-label="Stage name"
				className="flex-1"
			/>
			<Select name="type" defaultValue={stage.type}>
				<SelectTrigger aria-label="Stage outcome">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="OPEN">Open</SelectItem>
					<SelectItem value="WON">Won</SelectItem>
					<SelectItem value="LOST">Lost</SelectItem>
					<SelectItem value="UNQUALIFIED">Unqualified</SelectItem>
				</SelectContent>
			</Select>
			<Button type="submit" variant="outline" size="sm">
				Save
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={first}
				onClick={() => onMove(-1)}
			>
				Up
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={last}
				onClick={() => onMove(1)}
			>
				Down
			</Button>
			<Button type="button" variant="outline" size="sm" onClick={onRemove}>
				Remove
			</Button>
		</form>
	);
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
