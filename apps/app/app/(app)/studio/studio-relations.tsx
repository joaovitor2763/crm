"use client";

import Add from "@carbon/icons-react/es/Add";
import Search from "@carbon/icons-react/es/Search";
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
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { businessObjectLabel } from "@/lib/business-object-label";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { relationRows } from "./studio-data";

type Schema = RouterOutputs["fields"]["schema"];

export function StudioRelations({
	schema,
	canManage = false,
}: {
	schema?: Schema;
	canManage?: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [sourceId, setSourceId] = useState("");
	const [targetId, setTargetId] = useState("");
	const [q, setQ] = useState("");
	const create = useMutation(
		trpc.fields.createRelationDefinition.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.fields.schema.queryFilter());
				setOpen(false);
				toast.success("Relation created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!schema) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Relations are not available in this scope</EmptyTitle>
					<EmptyDescription>
						Grant fields read access to inspect the ontology graph.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const relations = relationRows(schema).filter((relation) =>
		`${relation.source} ${relation.target} ${relation.name} ${relation.inverseName} ${relation.key}`
			.toLowerCase()
			.includes(q.trim().toLowerCase()),
	);
	const options = schema.map((object) => ({
		value: object.id,
		label: businessObjectLabel(object),
		keywords: [object.key],
	}));

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Relations</CardTitle>
						<CardDescription>
							Explicit links between business objects, with names in both
							directions.
						</CardDescription>
					</div>
					{canManage ? (
						<Button size="sm" onClick={() => setOpen(true)}>
							<Icon icon={Add} /> New relation
						</Button>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<InputGroup className="sm:max-w-sm">
					<InputGroupAddon>
						<Icon icon={Search} />
					</InputGroupAddon>
					<InputGroupInput
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder="Search relations…"
						aria-label="Search relations"
					/>
				</InputGroup>
				{relations.length === 0 ? (
					<Empty className="min-h-52 border">
						<EmptyHeader>
							<EmptyTitle>
								{q ? "No matching relations" : "No relation definitions yet"}
							</EmptyTitle>
							<EmptyDescription>
								{q
									? "Try another search."
									: "Connect two objects to make navigation and automation semantics explicit."}
							</EmptyDescription>
						</EmptyHeader>
						{canManage && !q ? (
							<Button onClick={() => setOpen(true)}>Create relation</Button>
						) : null}
					</Empty>
				) : (
					<div className="overflow-hidden border">
						<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 border-b bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
							<span>From</span>
							<span>Cardinality</span>
							<span className="text-right">To</span>
						</div>
						{relations.map((relation) => (
							<div
								key={relation.id}
								className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b px-3 py-3 last:border-b-0"
							>
								<div className="min-w-0">
									<p className="truncate font-medium text-sm">
										{relation.source}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{relation.name} · {relation.key}
									</p>
								</div>
								<StatusIndicator
									tone="info"
									label={relation.cardinality.replaceAll("_", " ")}
								/>
								<div className="min-w-0 text-right">
									<p className="truncate font-medium text-sm">
										{relation.target}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{relation.inverseName}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							create.mutate({
								sourceObjectId: sourceId,
								targetObjectId: targetId,
								name: String(form.get("name")),
								inverseName: String(form.get("inverseName")),
								key: String(form.get("key")),
								cardinality: String(form.get("cardinality")) as
									| "ONE_TO_ONE"
									| "ONE_TO_MANY"
									| "MANY_TO_MANY",
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>New relation</DialogTitle>
							<DialogDescription>
								Choose both objects with search, then name how each side sees
								the other.
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 grid min-w-0 gap-3 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="relation-source">From object</FieldLabel>
								<SearchCombobox
									id="relation-source"
									value={sourceId}
									onValueChange={setSourceId}
									options={options}
									placeholder="Choose an object"
									searchPlaceholder="Search objects…"
									ariaLabel="From object"
									className="w-full"
								/>
								<FieldDescription>
									The record where this relationship starts.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="relation-target">To object</FieldLabel>
								<SearchCombobox
									id="relation-target"
									value={targetId}
									onValueChange={setTargetId}
									options={options}
									placeholder="Choose an object"
									searchPlaceholder="Search objects…"
									ariaLabel="To object"
									className="w-full"
								/>
								<FieldDescription>
									The record this relationship points to.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="relation-name">From label</FieldLabel>
								<Input
									id="relation-name"
									name="name"
									placeholder="Has contacts"
									autoComplete="off"
									required
								/>
								<FieldDescription>
									How the from object describes this link.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="relation-inverse">To label</FieldLabel>
								<Input
									id="relation-inverse"
									name="inverseName"
									placeholder="Belongs to company"
									autoComplete="off"
									required
								/>
								<FieldDescription>
									How the to object describes the reverse link.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="relation-key">Relation key</FieldLabel>
								<Input
									id="relation-key"
									name="key"
									placeholder="contacts"
									autoComplete="off"
									spellCheck={false}
									required
								/>
								<FieldDescription>
									A stable identifier used by APIs and automations.
								</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="relation-cardinality">
									Relationship type
								</FieldLabel>
								<Select name="cardinality" defaultValue="MANY_TO_MANY">
									<SelectTrigger id="relation-cardinality">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ONE_TO_ONE">
											One record to one record
										</SelectItem>
										<SelectItem value="ONE_TO_MANY">
											One record to many records
										</SelectItem>
										<SelectItem value="MANY_TO_MANY">
											Many records to many records
										</SelectItem>
									</SelectContent>
								</Select>
								<FieldDescription>
									How many records each side can connect.
								</FieldDescription>
							</Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={!sourceId || !targetId || create.isPending}
							>
								Create relation
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
