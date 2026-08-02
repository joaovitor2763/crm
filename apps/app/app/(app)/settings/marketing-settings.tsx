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

export function MarketingSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const forms = useQuery(
		trpc.marketing.forms.queryOptions({ includeArchived: true }),
	);
	const events = useQuery(
		trpc.marketing.events.queryOptions({ includeArchived: true }),
	);
	const directory = useQuery(trpc.governance.directory.queryOptions());
	const [formName, setFormName] = useState("");
	const [eventName, setEventName] = useState("");
	const [businessUnitId, setBusinessUnitId] = useState("");
	const done = async (message: string) => {
		await cache.marketing();
		toast.success(message);
	};
	const fail = (error: { message: string }) => {
		toast.error(error.message);
	};
	const createForm = useMutation(
		trpc.marketing.createForm.mutationOptions({
			onSuccess: async () => {
				setFormName("");
				await done("Form created.");
			},
			onError: fail,
		}),
	);
	const updateForm = useMutation(
		trpc.marketing.updateForm.mutationOptions({
			onSuccess: () => done("Form updated."),
			onError: fail,
		}),
	);
	const archiveForm = useMutation(
		trpc.marketing.archiveForm.mutationOptions({
			onSuccess: () => done("Form archived."),
			onError: fail,
		}),
	);
	const restoreForm = useMutation(
		trpc.marketing.restoreForm.mutationOptions({
			onSuccess: () => done("Form restored."),
			onError: fail,
		}),
	);
	const createEvent = useMutation(
		trpc.marketing.createEvent.mutationOptions({
			onSuccess: async () => {
				setEventName("");
				await done("Event created.");
			},
			onError: fail,
		}),
	);
	const updateEvent = useMutation(
		trpc.marketing.updateEvent.mutationOptions({
			onSuccess: () => done("Event updated."),
			onError: fail,
		}),
	);
	const archiveEvent = useMutation(
		trpc.marketing.archiveEvent.mutationOptions({
			onSuccess: () => done("Event archived."),
			onError: fail,
		}),
	);
	const restoreEvent = useMutation(
		trpc.marketing.restoreEvent.mutationOptions({
			onSuccess: () => done("Event restored."),
			onError: fail,
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Marketing forms and events</CardTitle>
			</CardHeader>
			<CardContent>
				<Field>
					<FieldLabel>Business unit for new forms and events</FieldLabel>
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
				<section className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">Forms</h3>
					<form
						className="flex items-end gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (formName.trim())
								createForm.mutate({
									name: formName,
									businessUnitId: businessUnitId || undefined,
								});
						}}
					>
						<Field className="flex-1">
							<FieldLabel htmlFor="new-marketing-form">New form</FieldLabel>
							<Input
								id="new-marketing-form"
								value={formName}
								onChange={(event) => setFormName(event.target.value)}
								placeholder="Book a demo"
							/>
						</Field>
						<Button type="submit">Create</Button>
					</form>
					{(forms.data ?? []).map((form) => (
						<form
							key={form.id}
							className="grid gap-2 md:grid-cols-[2fr_1fr_auto_auto] md:items-center"
							onSubmit={(event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								updateForm.mutate({
									id: form.id,
									name: String(data.get("name") ?? ""),
									externalId: String(data.get("externalId") ?? "") || null,
								});
							}}
						>
							<Input
								name="name"
								defaultValue={form.name}
								aria-label="Form name"
							/>
							<Input
								name="externalId"
								defaultValue={form.externalId ?? ""}
								aria-label="External form ID"
								placeholder="External ID"
							/>
							{form.archivedAt ? (
								<StatusIndicator tone="neutral" label="Archived" />
							) : (
								<span className="text-muted-foreground text-xs">
									{form._count.conversions} conversions
								</span>
							)}
							<div className="flex gap-2">
								<Button type="submit" variant="outline" size="sm">
									Save
								</Button>
								{form.archivedAt ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => restoreForm.mutate({ id: form.id })}
									>
										Restore
									</Button>
								) : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => archiveForm.mutate({ id: form.id })}
									>
										Archive
									</Button>
								)}
							</div>
						</form>
					))}
				</section>

				<section className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">Events</h3>
					<form
						className="flex items-end gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (eventName.trim())
								createEvent.mutate({
									name: eventName,
									businessUnitId: businessUnitId || undefined,
								});
						}}
					>
						<Field className="flex-1">
							<FieldLabel htmlFor="new-marketing-event">New event</FieldLabel>
							<Input
								id="new-marketing-event"
								value={eventName}
								onChange={(event) => setEventName(event.target.value)}
								placeholder="São Paulo roundtable"
							/>
						</Field>
						<Button type="submit">Create</Button>
					</form>
					{(events.data ?? []).map((item) => (
						<form
							key={item.id}
							className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-center"
							onSubmit={(event) => {
								event.preventDefault();
								const data = new FormData(event.currentTarget);
								updateEvent.mutate({
									id: item.id,
									name: String(data.get("name") ?? ""),
									location: String(data.get("location") ?? "") || null,
									startsAt: localInputToIso(data.get("startsAt")),
									endsAt: localInputToIso(data.get("endsAt")),
								});
							}}
						>
							<Input
								name="name"
								defaultValue={item.name}
								aria-label="Event name"
							/>
							<Input
								name="location"
								defaultValue={item.location ?? ""}
								aria-label="Event location"
								placeholder="Location"
							/>
							<Input
								name="startsAt"
								type="datetime-local"
								defaultValue={localDateTime(item.startsAt)}
								aria-label="Event start"
							/>
							<Input
								name="endsAt"
								type="datetime-local"
								defaultValue={localDateTime(item.endsAt)}
								aria-label="Event end"
							/>
							<div className="flex items-center gap-2">
								{item.archivedAt ? (
									<StatusIndicator tone="neutral" label="Archived" />
								) : (
									<span className="text-muted-foreground text-xs">
										{item._count.attendances} attendees
									</span>
								)}
								<Button type="submit" variant="outline" size="sm">
									Save
								</Button>
								{item.archivedAt ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => restoreEvent.mutate({ id: item.id })}
									>
										Restore
									</Button>
								) : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => archiveEvent.mutate({ id: item.id })}
									>
										Archive
									</Button>
								)}
							</div>
						</form>
					))}
				</section>
			</CardContent>
		</Card>
	);
}

function localDateTime(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 16);
}

function localInputToIso(value: FormDataEntryValue | null): string | null {
	const text = String(value ?? "");
	if (!text) return null;
	const date = new Date(text);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
