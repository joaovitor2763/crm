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
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	latestVersion,
	type OntologyDefinition,
	type OntologyDetail,
	type OntologyImpact,
	type OntologySnapshot,
	type OntologyVersion,
} from "./studio-ontology-data";
import { OntologyVersionDetail } from "./studio-ontology-detail";
import { studioParsers } from "./studio-search-params";
import { studioMutationOptions } from "./studio-trpc";

export function StudioOntology({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [selectedId, setSelectedId] = useQueryState(
		"ontology",
		studioParsers.ontology,
	);
	const [showCreate, setShowCreate] = useState(false);
	const [key, setKey] = useState("");
	const [name, setName] = useState("");
	const definitions = useQuery(
		trpc.ontology.list.queryOptions({ includeArchived: false }),
	);
	const detail = useQuery({
		...trpc.ontology.detail.queryOptions({ id: selectedId }),
		enabled: Boolean(selectedId),
	});
	const impact = useQuery({
		...trpc.ontology.impactPreview.queryOptions({ id: selectedId }),
		enabled: Boolean(selectedId),
	});
	const create = useMutation(
		studioMutationOptions<OntologyVersion, { key: string; name: string }>(
			trpc.ontology.createDraft,
			{
				onSuccess: async (created) => {
					await cache.ontology();
					setKey("");
					setName("");
					setShowCreate(false);
					await setSelectedId(created.id);
					toast.success("Ontology draft created.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const replace = useMutation(
		studioMutationOptions<OntologyVersion, { id: string; snapshot: unknown }>(
			trpc.ontology.replaceDraft,
			{
				onSuccess: async (next) => {
					await cache.ontology();
					await setSelectedId(next.id);
					toast.success("Draft replaced with the current snapshot.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const publish = useMutation(
		studioMutationOptions<OntologyVersion, { id: string; confirmed: true }>(
			trpc.ontology.publish,
			{
				onSuccess: async () => {
					await cache.ontology();
					toast.success("Ontology version published.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const rows = (definitions.data ?? []) as unknown as OntologyDefinition[];
	const selected = detail.data as unknown as OntologyDetail | undefined;

	return (
		<div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
			<Card className="min-w-0">
				<CardHeader>
					<div className="flex items-start justify-between gap-3">
						<div>
							<CardTitle>Ontology versions</CardTitle>
							<CardDescription>
								Immutable schemas for objects, fields, relations and policies.
							</CardDescription>
						</div>
						{canManage ? (
							<Button
								type="button"
								size="sm"
								onClick={() => setShowCreate((open) => !open)}
							>
								{showCreate ? "Cancel" : "New draft"}
							</Button>
						) : null}
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{showCreate ? (
						<FieldGroup
							keyValue={key}
							name={name}
							setKey={setKey}
							setName={setName}
							disabled={create.isPending}
							onSubmit={() => {
								if (key.trim() && name.trim()) create.mutate({ key, name });
							}}
						/>
					) : null}
					{definitions.isLoading ? (
						<div className="flex justify-center py-8">
							<Spinner />
						</div>
					) : rows.length === 0 ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyTitle>No ontology schemas</EmptyTitle>
								<EmptyDescription>
									Create a draft to start a governed schema journal.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="flex flex-col gap-1">
							{rows.map((row) => (
								<SchemaListItem
									key={row.id}
									row={row}
									selected={row.versions.some(
										(version) => version.id === selectedId,
									)}
									onSelect={() =>
										void setSelectedId(latestVersion(row.versions)?.id ?? "")
									}
								/>
							))}
						</div>
					)}
				</CardContent>
			</Card>
			{selected ? (
				<OntologyVersionDetail
					detail={selected}
					impact={
						impact.data as unknown as { impact: OntologyImpact } | undefined
					}
					canManage={canManage}
					busy={replace.isPending || publish.isPending}
					onReplace={() => {
						if (selected.snapshot)
							replace.mutate({
								id: selected.id,
								snapshot: selected.snapshot as OntologySnapshot,
							});
					}}
					onPublish={() => {
						if (window.confirm("Publish this ontology version?"))
							publish.mutate({ id: selected.id, confirmed: true });
					}}
				/>
			) : (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Select a schema</EmptyTitle>
						<EmptyDescription>
							Choose a version to inspect its checksum and impact.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

function FieldGroup({
	keyValue,
	name,
	setKey,
	setName,
	disabled,
	onSubmit,
}: {
	keyValue: string;
	name: string;
	setKey: (value: string) => void;
	setName: (value: string) => void;
	disabled: boolean;
	onSubmit: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 border-b pb-3">
			<Field>
				<FieldLabel htmlFor="ontology-key">Schema key</FieldLabel>
				<Input
					id="ontology-key"
					value={keyValue}
					onChange={(event) => setKey(event.target.value)}
					placeholder="revenue-ontology"
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="ontology-name">Name</FieldLabel>
				<Input
					id="ontology-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Revenue ontology"
				/>
			</Field>
			<Button type="button" disabled={disabled} onClick={onSubmit}>
				{disabled ? "Creating…" : "Create draft"}
			</Button>
		</div>
	);
}

function SchemaListItem({
	row,
	selected,
	onSelect,
}: {
	row: OntologyDefinition;
	selected: boolean;
	onSelect: () => void;
}) {
	const version = latestVersion(row.versions);
	return (
		<button
			type="button"
			className="flex w-full flex-col gap-1 border p-3 text-left hover:bg-muted/50"
			data-selected={selected}
			onClick={onSelect}
		>
			<span className="font-medium text-sm">{row.name}</span>
			<span className="text-muted-foreground text-xs">
				{row.key} · v{version?.version ?? "—"} · {version?.status ?? "—"}
			</span>
		</button>
	);
}
