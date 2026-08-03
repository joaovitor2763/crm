"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
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
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Overview = RouterOutputs["governance"]["directory"];

export function AutomationsSettings({
	canManageAutomations = true,
	canManageWebhooks = true,
}: {
	canManageAutomations?: boolean;
	canManageWebhooks?: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const governance = useQuery(trpc.governance.directory.queryOptions());
	const automations = useQuery({
		...trpc.automations.list.queryOptions(),
		enabled: canManageAutomations,
	});
	const webhooks = useQuery({
		...trpc.automations.webhooks.queryOptions(),
		enabled: canManageWebhooks,
	});
	const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
	const [createMode, setCreateMode] = useState<"automation" | "webhook" | null>(
		null,
	);
	const [q, setQ] = useState("");
	const [kind, setKind] = useState<"all" | "automation" | "webhook">("all");
	const refresh = async (message: string) => {
		await Promise.all([
			queryClient.invalidateQueries(trpc.automations.list.queryFilter()),
			queryClient.invalidateQueries(trpc.automations.webhooks.queryFilter()),
		]);
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);
	const create = useMutation(
		trpc.automations.create.mutationOptions({
			onSuccess: async () => {
				setCreateMode(null);
				await refresh("Automation created as draft.");
			},
			onError: fail,
		}),
	);
	const update = useMutation(
		trpc.automations.update.mutationOptions({
			onSuccess: () => refresh("Automation updated."),
			onError: fail,
		}),
	);
	const createWebhook = useMutation(
		trpc.automations.createWebhook.mutationOptions({
			onSuccess: async (result) => {
				setWebhookSecret(result.secret);
				setCreateMode(null);
				await refresh("Webhook created.");
			},
			onError: fail,
		}),
	);
	const updateWebhook = useMutation(
		trpc.automations.updateWebhook.mutationOptions({
			onSuccess: () => refresh("Webhook updated."),
			onError: fail,
		}),
	);

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Automations and webhooks</CardTitle>
						<CardDescription>
							Durable, role-scoped rules driven by domain events. No arbitrary
							code execution.
						</CardDescription>
					</div>
					<div className="flex gap-2">
						{canManageAutomations ? (
							<Button size="sm" onClick={() => setCreateMode("automation")}>
								New automation
							</Button>
						) : null}
						{canManageWebhooks ? (
							<Button
								size="sm"
								variant="outline"
								onClick={() => setCreateMode("webhook")}
							>
								New webhook
							</Button>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{webhookSecret ? (
					<Alert>
						<AlertTitle>Copy the webhook secret now</AlertTitle>
						<AlertDescription>
							<Input
								value={webhookSecret}
								readOnly
								aria-label="New webhook secret"
							/>
						</AlertDescription>
					</Alert>
				) : null}
				{createMode ? (
					<div className="mb-4 border p-4">
						<div className="mb-3 flex items-center justify-between">
							<p className="font-medium text-sm">
								{createMode === "automation" ? "New automation" : "New webhook"}
							</p>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setCreateMode(null)}
							>
								Cancel
							</Button>
						</div>
						{createMode === "automation" ? (
							<AutomationForm
								data={governance.data}
								mutate={(input) => create.mutate(input)}
							/>
						) : (
							<WebhookForm
								data={governance.data}
								mutate={(input) => createWebhook.mutate(input)}
							/>
						)}
					</div>
				) : null}
				<div className="mb-3 grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem]">
					<Input
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder="Search automations…"
						aria-label="Search automations"
					/>
					<Select
						value={kind}
						onValueChange={(value) => setKind(value as typeof kind)}
					>
						<SelectTrigger aria-label="Automation type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All types</SelectItem>
							{canManageAutomations ? (
								<SelectItem value="automation">Rules</SelectItem>
							) : null}
							{canManageWebhooks ? (
								<SelectItem value="webhook">Webhooks</SelectItem>
							) : null}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-2">
					{canManageAutomations && kind !== "webhook"
						? automations.data
								?.filter((automation) =>
									automation.name
										.toLowerCase()
										.includes(q.trim().toLowerCase()),
								)
								.map((automation) => (
									<div
										key={automation.id}
										className="flex items-center justify-between gap-3 border p-3"
									>
										<div>
											<p className="text-sm font-medium">{automation.name}</p>
											<p className="text-xs text-muted-foreground">
												{automation.status} · v{automation.version} ·{" "}
												{automation.role.name}
											</p>
										</div>
										<Field orientation="horizontal">
											<FieldLabel htmlFor={`automation-${automation.id}`}>
												Active
											</FieldLabel>
											<Switch
												id={`automation-${automation.id}`}
												checked={automation.status === "ACTIVE"}
												onCheckedChange={(checked) =>
													update.mutate({
														id: automation.id,
														status: checked ? "ACTIVE" : "PAUSED",
													})
												}
											/>
										</Field>
									</div>
								))
						: null}
					{canManageWebhooks && kind !== "automation"
						? webhooks.data
								?.filter((webhook) =>
									`${webhook.name} ${webhook.url}`
										.toLowerCase()
										.includes(q.trim().toLowerCase()),
								)
								.map((webhook) => (
									<div
										key={webhook.id}
										className="flex items-center justify-between gap-3 border p-3"
									>
										<div>
											<p className="text-sm font-medium">{webhook.name}</p>
											<p className="text-xs text-muted-foreground">
												{webhook.url} · secret …{webhook.secretLastFour} ·{" "}
												{webhook._count.deliveries} deliveries
											</p>
										</div>
										<Switch
											aria-label={`Enable ${webhook.name}`}
											checked={webhook.isActive}
											onCheckedChange={(isActive) =>
												updateWebhook.mutate({ id: webhook.id, isActive })
											}
										/>
									</div>
								))
						: null}
				</div>
			</CardContent>
		</Card>
	);
}

function AutomationForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		roleId: string;
		businessUnitId?: string | null;
		teamId?: string | null;
		trigger: { eventTypes: string[] };
		conditions: [];
		actions: [
			{
				type: "set_lifecycle";
				lifecycleStage:
					| "LEAD"
					| "MQL"
					| "SQL"
					| "OPPORTUNITY"
					| "CUSTOMER"
					| "DISQUALIFIED";
				qualificationReason?: string;
			},
		];
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const unit = String(form.get("businessUnitId") ?? "");
				mutate({
					name: String(form.get("name")),
					roleId: String(form.get("roleId")),
					businessUnitId: unit || null,
					trigger: { eventTypes: [String(form.get("eventType"))] },
					conditions: [],
					actions: [
						{
							type: "set_lifecycle",
							lifecycleStage: String(form.get("lifecycle")) as "MQL",
							qualificationReason:
								String(form.get("reason") ?? "") || undefined,
						},
					],
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="automation-name">New automation</FieldLabel>
					<Input
						id="automation-name"
						name="name"
						placeholder="Qualify form leads"
						required
					/>
				</Field>
				<Field>
					<FieldLabel>Execution role</FieldLabel>
					<Select name="roleId" required>
						<SelectTrigger>
							<SelectValue placeholder="Role" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{data?.roles.map((role) => (
									<SelectItem key={role.id} value={role.id}>
										{role.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel>Business unit</FieldLabel>
					<Select name="businessUnitId">
						<SelectTrigger>
							<SelectValue placeholder="Global" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor="automation-event">Event</FieldLabel>
					<Input
						id="automation-event"
						name="eventType"
						defaultValue="lead.submitted"
						required
					/>
				</Field>
				<Field>
					<FieldLabel>Lifecycle action</FieldLabel>
					<Select name="lifecycle" defaultValue="MQL">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{[
									"LEAD",
									"MQL",
									"SQL",
									"OPPORTUNITY",
									"CUSTOMER",
									"DISQUALIFIED",
								].map((stage) => (
									<SelectItem key={stage} value={stage}>
										{stage}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor="automation-reason">
						Qualification reason
					</FieldLabel>
					<Input
						id="automation-reason"
						name="reason"
						placeholder="Matched the unit ICP"
					/>
				</Field>
				<Button type="submit">Create draft</Button>
			</FieldGroup>
		</form>
	);
}

function WebhookForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		url: string;
		eventTypes: string[];
		businessUnitId?: string | null;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const unit = String(form.get("businessUnitId") ?? "");
				mutate({
					name: String(form.get("name")),
					url: String(form.get("url")),
					eventTypes: String(form.get("eventTypes"))
						.split(",")
						.map((eventType) => eventType.trim())
						.filter(Boolean),
					businessUnitId: unit || null,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="webhook-name">New webhook</FieldLabel>
					<Input
						id="webhook-name"
						name="name"
						placeholder="Marketing warehouse"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="webhook-url">HTTPS URL</FieldLabel>
					<Input
						id="webhook-url"
						name="url"
						type="url"
						placeholder="https://example.com/crm"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="webhook-events">Events</FieldLabel>
					<Input
						id="webhook-events"
						name="eventTypes"
						defaultValue="lead.submitted,contact.became_mql"
						required
					/>
				</Field>
				<Field>
					<FieldLabel>Business unit</FieldLabel>
					<Select name="businessUnitId">
						<SelectTrigger>
							<SelectValue placeholder="Global" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Button type="submit">Create webhook</Button>
			</FieldGroup>
		</form>
	);
}

export function ExternalAccessSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const governance = useQuery(trpc.governance.directory.queryOptions());
	const credentials = useQuery(trpc.apiCredentials.list.queryOptions());
	const [newToken, setNewToken] = useState<string | null>(null);
	const refresh = async () =>
		queryClient.invalidateQueries(trpc.apiCredentials.list.queryFilter());
	const create = useMutation(
		trpc.apiCredentials.create.mutationOptions({
			onSuccess: async (result) => {
				setNewToken(result.token);
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const revoke = useMutation(
		trpc.apiCredentials.revoke.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Credential revoked.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	return (
		<Card>
			<CardHeader>
				<CardTitle>External agents and API</CardTitle>
				<CardDescription>
					One credential, one role, explicit unit and team scopes. The same key
					authenticates REST and MCP.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{newToken ? (
					<Alert>
						<AlertTitle>Copy this token now</AlertTitle>
						<AlertDescription>
							<Input value={newToken} readOnly aria-label="New API token" />
						</AlertDescription>
					</Alert>
				) : null}
				<CredentialForm data={governance.data} mutate={create.mutate} />
				{credentials.data?.map((credential) => (
					<div
						key={credential.id}
						className="flex items-center justify-between gap-3 border p-3"
					>
						<div>
							<p className="text-sm font-medium">{credential.name}</p>
							<p className="text-xs text-muted-foreground">
								{credential.role.name} · {credential.prefix}…
								{credential.lastFour} · {credential.status}
							</p>
						</div>
						{credential.status === "ACTIVE" ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => revoke.mutate({ id: credential.id })}
							>
								Revoke
							</Button>
						) : null}
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function CredentialForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		roleId: string;
		businessUnitIds: string[];
		teamIds: string[];
	}) => void;
}) {
	return (
		<form
			className="grid gap-2 md:grid-cols-4 md:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					name: String(form.get("name")),
					roleId: String(form.get("roleId")),
					businessUnitIds: [String(form.get("businessUnitId"))],
					teamIds: [],
				});
			}}
		>
			<Field>
				<FieldLabel htmlFor="credential-name">New credential</FieldLabel>
				<Input
					id="credential-name"
					name="name"
					placeholder="Inbound lead agent"
					required
				/>
			</Field>
			<Field>
				<FieldLabel>Role</FieldLabel>
				<Select name="roleId" required>
					<SelectTrigger>
						<SelectValue placeholder="Role" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data?.roles.map((role) => (
								<SelectItem key={role.id} value={role.id}>
									{role.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel>Business unit</FieldLabel>
				<Select name="businessUnitId" required>
					<SelectTrigger>
						<SelectValue placeholder="Unit" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data?.businessUnits.map((unit) => (
								<SelectItem key={unit.id} value={unit.id}>
									{unit.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Button type="submit">Create key</Button>
		</form>
	);
}
