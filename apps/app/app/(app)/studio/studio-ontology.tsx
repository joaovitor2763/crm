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
import { studioParsers } from "./studio-search-params";
import { studioMutationOptions } from "./studio-trpc";

type OntologyVersion = {
	id: string;
	version: number;
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
	checksum: string;
	createdAt: string;
};
type OntologyDefinition = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	versions: OntologyVersion[];
};
type OntologySnapshot = {
	objects: Array<{ fields: unknown[] }>;
	relations: unknown[];
	policies: { rolePermissions: unknown[] };
};
type OntologyDetail = OntologyVersion & {
	schemaDefinition?: {
		id: string;
		key: string;
		name: string;
		description: string | null;
	};
	snapshot?: unknown;
};
type OntologyImpact = {
	objects: ImpactGroup;
	fields: ImpactGroup;
	relations: ImpactGroup;
	breakingChanges: string[];
};
type ImpactGroup = { added: string[]; removed: string[]; changed: string[] };

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
				<OntologyDetail
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

function OntologyDetail({
	detail,
	impact,
	canManage,
	busy,
	onReplace,
	onPublish,
}: {
	detail: OntologyDetail;
	impact: { impact: OntologyImpact } | undefined;
	canManage: boolean;
	busy: boolean;
	onReplace: () => void;
	onPublish: () => void;
}) {
	const snapshot = detail.snapshot as OntologySnapshot | undefined;
	return (
		<div className="flex flex-col gap-5">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>
								{detail.schemaDefinition?.name ?? "Ontology schema"}
							</CardTitle>
							<CardDescription>
								Version {detail.version} · {detail.status} ·{" "}
								{detail.checksum.slice(0, 12)}
							</CardDescription>
						</div>
						{canManage && detail.status === "DRAFT" ? (
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									disabled={busy || !snapshot}
									onClick={onReplace}
								>
									Replace snapshot
								</Button>
								<Button type="button" disabled={busy} onClick={onPublish}>
									Publish version
								</Button>
							</div>
						) : null}
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="grid gap-2 sm:grid-cols-3">
						<ImpactStat label="Objects" value={snapshot?.objects.length ?? 0} />
						<ImpactStat
							label="Relations"
							value={snapshot?.relations.length ?? 0}
						/>
						<ImpactStat
							label="Fields"
							value={
								snapshot?.objects.reduce(
									(total, object) => total + object.fields.length,
									0,
								) ?? 0
							}
						/>
					</div>
					{impact ? <ImpactPanel impact={impact.impact} /> : null}
				</CardContent>
			</Card>
		</div>
	);
}

function ImpactStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="border p-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 font-medium text-sm">{value}</p>
		</div>
	);
}

function ImpactPanel({ impact }: { impact: OntologyImpact }) {
	return (
		<div className="flex flex-col gap-3 border-t pt-4">
			<div>
				<p className="font-medium text-sm">Impact preview</p>
				<p className="text-muted-foreground text-xs">
					Compared with the latest published version.
				</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-3">
				<ImpactStat
					label="Added"
					value={
						impact.objects.added.length +
						impact.fields.added.length +
						impact.relations.added.length
					}
				/>
				<ImpactStat
					label="Changed"
					value={
						impact.objects.changed.length +
						impact.fields.changed.length +
						impact.relations.changed.length
					}
				/>
				<ImpactStat label="Breaking" value={impact.breakingChanges.length} />
			</div>
			{impact.breakingChanges.length ? (
				<ul className="flex flex-col gap-1 border border-destructive/40 p-3 text-destructive text-xs">
					{impact.breakingChanges.map((change) => (
						<li key={change}>{change}</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-xs">
					No breaking changes detected.
				</p>
			)}
		</div>
	);
}

function latestVersion(versions: OntologyVersion[]) {
	return [...versions].sort((left, right) => right.version - left.version)[0];
}
