"use client";

import Add from "@carbon/icons-react/es/Add";
import Edit from "@carbon/icons-react/es/Edit";
import Search from "@carbon/icons-react/es/Search";
import TrashCan from "@carbon/icons-react/es/TrashCan";
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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const FIELD_TYPES = [
	"TEXT",
	"NUMBER",
	"BOOLEAN",
	"SELECT",
	"MULTI_SELECT",
	"DATE",
	"DATE_TIME",
	"EMAIL",
	"PHONE",
	"URL",
	"CURRENCY",
	"RELATION",
] as const;

type FieldType = (typeof FIELD_TYPES)[number];
type FieldDefinition = {
	id: string;
	key: string;
	label: string;
	description: string | null;
	type: string;
	indexMode: "BASIC" | "INDEXED" | "UNIQUE";
	classification: "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
	isRequired: boolean;
	agentReadable: boolean;
	agentWritable: boolean;
	apiReadable: boolean;
	apiWritable: boolean;
	options: Array<{ id: string; key: string; label: string }>;
};
type FieldObject = {
	id: string;
	key: string;
	name: string;
	pluralName: string;
	kind: string;
	fields: FieldDefinition[];
};

export function FieldsSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const schema = useQuery(trpc.fields.schema.queryOptions({}));
	const objects = (schema.data ?? []) as unknown as FieldObject[];
	const [selectedId, setSelectedId] = useState("");
	const [q, setQ] = useState("");
	const [objectOpen, setObjectOpen] = useState(false);
	const [fieldOpen, setFieldOpen] = useState(false);
	const [editing, setEditing] = useState<FieldDefinition | null>(null);
	const [fieldType, setFieldType] = useState<FieldType>("TEXT");
	const selected =
		objects.find((object) => object.id === selectedId) ?? objects[0];
	const filteredFields = useMemo(() => {
		const needle = q.trim().toLowerCase();
		if (!needle) return selected?.fields ?? [];
		return (selected?.fields ?? []).filter((field) =>
			`${field.label} ${field.key} ${field.type}`
				.toLowerCase()
				.includes(needle),
		);
	}, [q, selected]);
	const refresh = async (message: string) => {
		await queryClient.invalidateQueries(trpc.fields.schema.queryFilter());
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);
	const createObject = useMutation(
		trpc.fields.createObject.mutationOptions({
			onSuccess: async (row) => {
				await refresh("Object created.");
				setSelectedId(row.id);
				setObjectOpen(false);
			},
			onError: fail,
		}),
	);
	const createField = useMutation(
		trpc.fields.create.mutationOptions({
			onSuccess: async () => {
				await refresh("Field created.");
				setFieldOpen(false);
			},
			onError: fail,
		}),
	);
	const update = useMutation(
		trpc.fields.update.mutationOptions({
			onSuccess: async () => {
				await refresh("Field updated.");
				setEditing(null);
			},
			onError: fail,
		}),
	);
	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: () => refresh("Field archived."),
			onError: fail,
		}),
	);

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Objects and fields</CardTitle>
						<CardDescription>
							Select one object, then search, create or edit its governed
							fields.
						</CardDescription>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setObjectOpen(true)}
					>
						<Icon icon={Add} /> New object
					</Button>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<SearchCombobox
						value={selected?.id ?? ""}
						onValueChange={setSelectedId}
						options={objects.map((object) => ({
							value: object.id,
							label: object.pluralName,
							description: `${object.kind} · ${object.key}`,
						}))}
						placeholder="Select object"
						searchPlaceholder="Search objects…"
						className="w-full sm:w-72"
					/>
					<InputGroup className="sm:max-w-sm">
						<InputGroupAddon>
							<Icon icon={Search} />
						</InputGroupAddon>
						<InputGroupInput
							value={q}
							onChange={(event) => setQ(event.target.value)}
							placeholder="Search fields…"
							aria-label="Search fields"
						/>
					</InputGroup>
					<Button
						className="sm:ml-auto"
						size="sm"
						disabled={!selected}
						onClick={() => {
							setFieldType("TEXT");
							setFieldOpen(true);
						}}
					>
						<Icon icon={Add} /> New field
					</Button>
				</div>

				{selected ? (
					<div className="overflow-hidden border">
						<div className="grid grid-cols-[minmax(0,1fr)_7rem_5rem] gap-3 border-b bg-muted/30 px-3 py-2 text-muted-foreground text-xs sm:grid-cols-[minmax(0,1fr)_9rem_8rem_5rem]">
							<span>Field</span>
							<span>Type</span>
							<span className="hidden sm:block">Index</span>
							<span className="sr-only">Actions</span>
						</div>
						{filteredFields.length ? (
							filteredFields.map((field) => (
								<div
									key={field.id}
									className="grid grid-cols-[minmax(0,1fr)_7rem_5rem] items-center gap-3 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_5rem]"
								>
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">
											{field.label}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{field.key}
											{field.isRequired ? " · required" : ""}
										</p>
									</div>
									<StatusIndicator
										tone="neutral"
										label={field.type.replaceAll("_", " ")}
									/>
									<span className="hidden text-muted-foreground text-xs sm:block">
										{field.indexMode}
									</span>
									<div className="flex justify-end">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Edit ${field.label}`}
											onClick={() => setEditing(field)}
										>
											<Icon icon={Edit} />
										</Button>
									</div>
								</div>
							))
						) : (
							<Empty className="min-h-44">
								<EmptyHeader>
									<EmptyTitle>
										{q ? "No matching fields" : "No custom fields"}
									</EmptyTitle>
									<EmptyDescription>
										{q
											? "Try another term."
											: `Add the first custom field to ${selected.pluralName}.`}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</div>
				) : (
					<Empty className="border">
						<EmptyHeader>
							<EmptyTitle>No objects available</EmptyTitle>
							<EmptyDescription>
								Create an object to begin defining fields.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</CardContent>

			<Dialog open={objectOpen} onOpenChange={setObjectOpen}>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							createObject.mutate({
								name: String(form.get("name")),
								pluralName: String(form.get("pluralName")),
								key: String(form.get("key")),
								kind: "CUSTOM",
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>New object</DialogTitle>
							<DialogDescription>
								Create a business concept. Its key becomes a stable API
								identifier.
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 grid gap-3">
							<Field>
								<FieldLabel htmlFor="object-name">Name</FieldLabel>
								<Input id="object-name" name="name" required />
							</Field>
							<Field>
								<FieldLabel htmlFor="object-plural">Plural name</FieldLabel>
								<Input id="object-plural" name="pluralName" required />
							</Field>
							<Field>
								<FieldLabel htmlFor="object-key">Key</FieldLabel>
								<Input
									id="object-key"
									name="key"
									placeholder="partners"
									required
								/>
							</Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setObjectOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createObject.isPending}>
								Create object
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							if (!selected) return;
							const form = new FormData(event.currentTarget);
							const options = String(form.get("options") ?? "")
								.split(",")
								.map((value) => value.trim())
								.filter(Boolean)
								.map((label) => ({
									key: label
										.toLowerCase()
										.replace(/[^a-z0-9]+/g, "-")
										.replace(/^-|-$/g, ""),
									label,
								}));
							createField.mutate({
								objectDefinitionId: selected.id,
								key: String(form.get("key")),
								label: String(form.get("label")),
								description: String(form.get("description") || "") || null,
								type: fieldType,
								indexMode: String(form.get("indexMode")) as
									| "BASIC"
									| "INDEXED"
									| "UNIQUE",
								classification: "INTERNAL",
								options:
									fieldType === "SELECT" || fieldType === "MULTI_SELECT"
										? options
										: [],
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>New field for {selected?.pluralName}</DialogTitle>
							<DialogDescription>
								Choose the storage type carefully. The key and type become
								immutable after creation.
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 grid gap-3">
							<Field>
								<FieldLabel htmlFor="field-label">Label</FieldLabel>
								<Input id="field-label" name="label" required />
							</Field>
							<Field>
								<FieldLabel htmlFor="field-key">Key</FieldLabel>
								<Input
									id="field-key"
									name="key"
									placeholder="lead-tier"
									required
								/>
							</Field>
							<Field>
								<FieldLabel>Type</FieldLabel>
								<Select
									value={fieldType}
									onValueChange={(value) => setFieldType(value as FieldType)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{FIELD_TYPES.map((type) => (
											<SelectItem key={type} value={type}>
												{type.replaceAll("_", " ")}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel>Index</FieldLabel>
								<Select name="indexMode" defaultValue="BASIC">
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="BASIC">Basic JSON</SelectItem>
										<SelectItem value="INDEXED">Indexed</SelectItem>
										<SelectItem value="UNIQUE">Unique</SelectItem>
									</SelectContent>
								</Select>
							</Field>
							{fieldType === "SELECT" || fieldType === "MULTI_SELECT" ? (
								<Field>
									<FieldLabel htmlFor="field-options">Options</FieldLabel>
									<Input
										id="field-options"
										name="options"
										placeholder="Enterprise, SMB"
										required
									/>
								</Field>
							) : null}
							<Field>
								<FieldLabel htmlFor="field-description">Description</FieldLabel>
								<Input id="field-description" name="description" />
							</Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setFieldOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createField.isPending}>
								Create field
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{editing ? (
				<EditFieldDialog
					field={editing}
					pending={update.isPending || archive.isPending}
					onClose={() => setEditing(null)}
					onSave={(input) => update.mutate({ id: editing.id, ...input })}
					onArchive={() => {
						if (
							window.confirm(
								`Archive ${editing.label}? Existing values are retained but hidden.`,
							)
						)
							archive.mutate({ id: editing.id });
					}}
				/>
			) : null}
		</Card>
	);
}

function EditFieldDialog({
	field,
	pending,
	onClose,
	onSave,
	onArchive,
}: {
	field: FieldDefinition;
	pending: boolean;
	onClose: () => void;
	onSave: (input: {
		label: string;
		description: string | null;
		indexMode: "BASIC" | "INDEXED" | "UNIQUE";
		classification: "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
		isRequired: boolean;
		agentReadable: boolean;
		agentWritable: boolean;
		apiReadable: boolean;
		apiWritable: boolean;
	}) => void;
	onArchive: () => void;
}) {
	const [required, setRequired] = useState(field.isRequired);
	const [agentReadable, setAgentReadable] = useState(field.agentReadable);
	const [agentWritable, setAgentWritable] = useState(field.agentWritable);
	const [apiReadable, setApiReadable] = useState(field.apiReadable);
	const [apiWritable, setApiWritable] = useState(field.apiWritable);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						onSave({
							label: String(form.get("label")),
							description: String(form.get("description") || "") || null,
							indexMode: String(
								form.get("indexMode"),
							) as FieldDefinition["indexMode"],
							classification: String(
								form.get("classification"),
							) as FieldDefinition["classification"],
							isRequired: required,
							agentReadable,
							agentWritable,
							apiReadable,
							apiWritable,
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>Edit field</DialogTitle>
						<DialogDescription>
							<strong>{field.key}</strong> · {field.type}. Key and type are
							locked to protect stored values and integrations.
						</DialogDescription>
					</DialogHeader>
					<div className="my-4 grid gap-3 sm:grid-cols-2">
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor="edit-field-label">Label</FieldLabel>
							<Input
								id="edit-field-label"
								name="label"
								defaultValue={field.label}
								required
							/>
						</Field>
						<Field>
							<FieldLabel>Index</FieldLabel>
							<Select name="indexMode" defaultValue={field.indexMode}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="BASIC">Basic JSON</SelectItem>
									<SelectItem value="INDEXED">Indexed</SelectItem>
									<SelectItem value="UNIQUE">Unique</SelectItem>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>Classification</FieldLabel>
							<Select name="classification" defaultValue={field.classification}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{["INTERNAL", "CONFIDENTIAL", "RESTRICTED"].map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field className="sm:col-span-2">
							<FieldLabel htmlFor="edit-field-description">
								Description
							</FieldLabel>
							<Input
								id="edit-field-description"
								name="description"
								defaultValue={field.description ?? ""}
							/>
						</Field>
						<Toggle
							label="Required"
							checked={required}
							onChange={setRequired}
						/>
						<Toggle
							label="Agent can read"
							checked={agentReadable}
							onChange={setAgentReadable}
						/>
						<Toggle
							label="Agent can write"
							checked={agentWritable}
							onChange={setAgentWritable}
						/>
						<Toggle
							label="API can read"
							checked={apiReadable}
							onChange={setApiReadable}
						/>
						<Toggle
							label="API can write"
							checked={apiWritable}
							onChange={setApiWritable}
						/>
					</div>
					<DialogFooter className="justify-between sm:justify-between">
						<Button
							type="button"
							variant="ghost"
							className="text-destructive"
							onClick={onArchive}
						>
							<Icon icon={TrashCan} /> Archive
						</Button>
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button type="submit" disabled={pending}>
								Save changes
							</Button>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 border px-3 py-2">
			<span className="text-xs">{label}</span>
			<Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
		</div>
	);
}
