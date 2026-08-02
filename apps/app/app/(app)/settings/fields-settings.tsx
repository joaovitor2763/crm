"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

type FieldObject = {
	id: string;
	key: string;
	pluralName: string;
	kind: string;
	fields: Array<{
		id: string;
		key: string;
		label: string;
		type: string;
		indexMode: string;
	}>;
};

export function FieldsSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const schema = useQuery(trpc.fields.schema.queryOptions({}));
	const refresh = async (message: string) => {
		await queryClient.invalidateQueries(trpc.fields.schema.queryFilter());
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);
	const createObject = useMutation(
		trpc.fields.createObject.mutationOptions({
			onSuccess: () => refresh("Object created."),
			onError: fail,
		}),
	);
	const createField = useMutation(
		trpc.fields.create.mutationOptions({
			onSuccess: () => refresh("Field created."),
			onError: fail,
		}),
	);
	const archive = useMutation(
		trpc.fields.archive.mutationOptions({
			onSuccess: () => refresh("Field archived."),
			onError: fail,
		}),
	);
	const objects = schema.data as unknown as FieldObject[] | undefined;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Objects and fields</CardTitle>
				<CardDescription>
					Flexible JSON values with typed indexes only where filtering or
					uniqueness needs them.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
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
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="object-name">New object</FieldLabel>
								<Input
									id="object-name"
									name="name"
									placeholder="Partner"
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="object-plural">Plural</FieldLabel>
								<Input
									id="object-plural"
									name="pluralName"
									placeholder="Partners"
									required
								/>
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
							<Button type="submit">Create object</Button>
						</FieldGroup>
					</form>
					<form
						className="grid gap-2 md:grid-cols-3 md:items-end"
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							const type = String(
								form.get("type"),
							) as (typeof FIELD_TYPES)[number];
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
								objectDefinitionId: String(form.get("objectDefinitionId")),
								key: String(form.get("key")),
								label: String(form.get("label")),
								type,
								indexMode: String(form.get("indexMode")) as
									| "BASIC"
									| "INDEXED"
									| "UNIQUE",
								classification: "INTERNAL",
								options:
									type === "SELECT" || type === "MULTI_SELECT" ? options : [],
							});
						}}
					>
						<Field>
							<FieldLabel>Object</FieldLabel>
							<Select name="objectDefinitionId" required>
								<SelectTrigger>
									<SelectValue placeholder="Select" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{objects?.map((object) => (
											<SelectItem key={object.id} value={object.id}>
												{object.pluralName}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="field-label">Field label</FieldLabel>
							<Input
								id="field-label"
								name="label"
								placeholder="Lead tier"
								required
							/>
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
							<Select name="type" defaultValue="TEXT">
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{FIELD_TYPES.map((type) => (
											<SelectItem key={type} value={type}>
												{type}
											</SelectItem>
										))}
									</SelectGroup>
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
									<SelectGroup>
										<SelectItem value="BASIC">Basic JSON</SelectItem>
										<SelectItem value="INDEXED">Indexed</SelectItem>
										<SelectItem value="UNIQUE">Unique</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="field-options">Select options</FieldLabel>
							<Input
								id="field-options"
								name="options"
								placeholder="Enterprise, SMB"
							/>
						</Field>
						<Button type="submit">Create field</Button>
					</form>
				</div>

				{objects?.map((object) => (
					<Card key={object.id}>
						<CardHeader>
							<CardTitle>{object.pluralName}</CardTitle>
							<CardDescription>
								{object.kind} · {object.key}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{object.fields.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									No custom fields.
								</p>
							) : (
								object.fields.map((field) => (
									<div
										key={field.id}
										className="flex items-center justify-between gap-3"
									>
										<div>
											<p className="text-sm font-medium">{field.label}</p>
											<p className="text-xs text-muted-foreground">
												{field.key} · {field.type} · {field.indexMode}
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => archive.mutate({ id: field.id })}
										>
											Archive
										</Button>
									</div>
								))
							)}
						</CardContent>
					</Card>
				))}
			</CardContent>
		</Card>
	);
}
