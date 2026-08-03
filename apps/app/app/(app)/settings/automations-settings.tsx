"use client";

import Copy from "@carbon/icons-react/es/Copy";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
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
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Switch } from "@crm/ui/components/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Overview = RouterOutputs["governance"]["directory"];
type EventCatalog = ReadonlyArray<
	RouterOutputs["automations"]["eventCatalog"][number]
>;

const utcDateTime = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});

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
	const eventCatalog = useQuery(trpc.automations.eventCatalog.queryOptions());
	const automations = useQuery({
		...trpc.automations.list.queryOptions(),
		enabled: canManageAutomations,
	});
	const webhooks = useQuery({
		...trpc.automations.webhooks.queryOptions(),
		enabled: canManageWebhooks,
	});
	const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
	const [lastWebhookTest, setLastWebhookTest] = useState<{
		webhookId: string;
		result: RouterOutputs["automations"]["testWebhook"];
	} | null>(null);
	const [createMode, setCreateMode] = useState<"automation" | "webhook" | null>(
		null,
	);
	const [q, setQ] = useState("");
	const [kind, setKind] = useState<"all" | "automation" | "webhook">("all");
	const normalizedQuery = q.trim().toLowerCase();
	const filteredAutomations =
		canManageAutomations && kind !== "webhook"
			? (automations.data ?? []).filter((automation) =>
					automation.name.toLowerCase().includes(normalizedQuery),
				)
			: [];
	const filteredWebhooks =
		canManageWebhooks && kind !== "automation"
			? (webhooks.data ?? []).filter((webhook) =>
					`${webhook.name} ${webhook.url}`
						.toLowerCase()
						.includes(normalizedQuery),
				)
			: [];
	const automationFailed =
		canManageAutomations && kind !== "webhook" && automations.isError;
	const webhookFailed =
		canManageWebhooks && kind !== "automation" && webhooks.isError;
	const listFailed = automationFailed || webhookFailed;
	const emptyType =
		kind === "webhook"
			? "webhooks"
			: kind === "automation"
				? "automations"
				: "automations or webhooks";
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
	const testWebhook = useMutation(
		trpc.automations.testWebhook.mutationOptions({
			onSuccess: (result, input) => {
				setLastWebhookTest({ webhookId: input.id, result });
				if (result.status === "SUCCEEDED") {
					toast.success(
						`Test webhook delivered with HTTP ${result.responseStatus}.`,
					);
				} else {
					toast.error(
						result.responseStatus
							? `Test webhook returned HTTP ${result.responseStatus}.`
							: `Test webhook failed: ${result.errorCode ?? "Unknown error"}.`,
					);
				}
			},
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
				<Alert>
					<AlertTitle>
						Inbound and outbound integrations are different
					</AlertTitle>
					<AlertDescription className="flex flex-col gap-2">
						<p>
							<strong>Into CRM:</strong> forms and external systems use the REST
							API or MCP with a scoped credential. See the{" "}
							<Link href="/settings?section=access">inbound API guide</Link>.
						</p>
						<p>
							<strong>Out of CRM:</strong> webhooks POST signed event payloads
							to your HTTPS endpoint. Non-2xx deliveries are retried
							automatically.
						</p>
					</AlertDescription>
				</Alert>
				{webhookSecret ? (
					<Alert>
						<AlertTitle>Copy the webhook secret now</AlertTitle>
						<AlertDescription className="flex flex-col gap-2">
							<p>
								Use this secret to verify the x-crm-signature header. It is
								shown only once.
							</p>
							<div className="flex min-w-0 gap-2">
								<Input
									value={webhookSecret}
									readOnly
									aria-label="New webhook secret"
								/>
								<CopyButton value={webhookSecret} label="Copy webhook secret" />
							</div>
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
								events={eventCatalog.data ?? []}
								mutate={(input) => create.mutate(input)}
							/>
						) : (
							<WebhookForm
								data={governance.data}
								events={eventCatalog.data ?? []}
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
							<SelectGroup>
								<SelectItem value="all">All types</SelectItem>
								{canManageAutomations ? (
									<SelectItem value="automation">Rules</SelectItem>
								) : null}
								{canManageWebhooks ? (
									<SelectItem value="webhook">Webhooks</SelectItem>
								) : null}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-2">
					{listFailed ? (
						<Alert variant="destructive">
							<AlertTitle>Could not load this list</AlertTitle>
							<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
								<span>Check the connection and try again.</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										if (automationFailed) void automations.refetch();
										if (webhookFailed) void webhooks.refetch();
									}}
								>
									Try again
								</Button>
							</AlertDescription>
						</Alert>
					) : null}
					{filteredAutomations.map((automation) => (
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
					))}
					{filteredWebhooks.map((webhook) => {
						const latestDelivery = webhook.deliveries[0];
						const scopeLabel = webhook.businessUnitId
							? (governance.data?.businessUnits.find(
									(unit) => unit.id === webhook.businessUnitId,
								)?.name ?? "Selected business unit")
							: "Global · all pipelines";
						const latestTest =
							lastWebhookTest?.webhookId === webhook.id
								? lastWebhookTest.result
								: null;
						const isTesting =
							testWebhook.isPending && testWebhook.variables?.id === webhook.id;
						return (
							<div
								key={webhook.id}
								className="flex flex-wrap items-center justify-between gap-3 border p-3"
							>
								<div className="min-w-0">
									<p className="text-sm font-medium">{webhook.name}</p>
									<p className="text-muted-foreground text-xs">{scopeLabel}</p>
									<p className="text-muted-foreground text-xs">
										{webhook.url} · secret …{webhook.secretLastFour} ·{" "}
										{webhook._count.deliveries} deliveries
									</p>
									{latestDelivery ? (
										<p className="text-muted-foreground text-xs">
											Last delivery: {latestDelivery.status}
											{latestDelivery.responseStatus
												? ` · HTTP ${latestDelivery.responseStatus}`
												: ""}
											{latestDelivery.errorCode
												? ` · ${latestDelivery.errorCode}`
												: ""}{" "}
											· {utcDateTime.format(new Date(latestDelivery.updatedAt))}{" "}
											UTC
										</p>
									) : null}
									{latestTest ? (
										<p className="text-muted-foreground text-xs">
											Last manual test: {latestTest.status}
											{latestTest.responseStatus
												? ` · HTTP ${latestTest.responseStatus}`
												: ""}
											{latestTest.errorCode ? ` · ${latestTest.errorCode}` : ""}{" "}
											· {latestTest.durationMs} ms
										</p>
									) : null}
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={testWebhook.isPending}
										onClick={() => testWebhook.mutate({ id: webhook.id })}
									>
										{isTesting ? "Testing…" : "Test webhook"}
									</Button>
									<Switch
										aria-label={`Enable ${webhook.name}`}
										checked={webhook.isActive}
										onCheckedChange={(isActive) =>
											updateWebhook.mutate({ id: webhook.id, isActive })
										}
									/>
								</div>
							</div>
						);
					})}
					{!automations.isLoading &&
					!webhooks.isLoading &&
					!listFailed &&
					filteredAutomations.length === 0 &&
					filteredWebhooks.length === 0 ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyTitle>
									{normalizedQuery
										? `No matching ${emptyType}`
										: `No ${emptyType} yet`}
								</EmptyTitle>
								<EmptyDescription>
									{normalizedQuery
										? "Try another search or type filter."
										: kind === "webhook"
											? "Create an endpoint to send selected events to an external system."
											: kind === "automation"
												? "Create a rule that turns a domain event into an internal action."
												: "Create a rule for an internal action or a webhook for an external system."}
								</EmptyDescription>
							</EmptyHeader>
							<div className="flex flex-wrap justify-center gap-2">
								{canManageAutomations && kind !== "webhook" ? (
									<Button size="sm" onClick={() => setCreateMode("automation")}>
										Create automation
									</Button>
								) : null}
								{canManageWebhooks && kind !== "automation" ? (
									<Button
										size="sm"
										variant="outline"
										onClick={() => setCreateMode("webhook")}
									>
										Create webhook
									</Button>
								) : null}
							</div>
						</Empty>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

function AutomationForm({
	data,
	events,
	mutate,
}: {
	data?: Overview;
	events: EventCatalog;
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
	const [eventType, setEventType] = useState("lead.submitted");
	const contactEvents = events.filter((event) => event.automationEligible);
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const unit = String(form.get("businessUnitId") ?? "");
				mutate({
					name: String(form.get("name")),
					roleId: String(form.get("roleId")),
					businessUnitId: unit === "global" || !unit ? null : unit,
					trigger: { eventTypes: [eventType] },
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
					<FieldLabel htmlFor="automation-name">Name</FieldLabel>
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
					<Select name="businessUnitId" defaultValue="global">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="global">
									Global · all business units and pipelines
								</SelectItem>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<FieldDescription>
						Global sends matching events from every pipeline, team and business
						unit.
					</FieldDescription>
				</Field>
				<Field>
					<FieldLabel>When this happens</FieldLabel>
					<SearchCombobox
						value={eventType}
						onValueChange={setEventType}
						options={contactEvents.map((event) => ({
							value: event.id,
							label: event.label,
						}))}
						placeholder="Choose an event"
						searchPlaceholder="Search events…"
						className="w-full"
					/>
					<p className="text-muted-foreground text-xs">
						{contactEvents.find((event) => event.id === eventType)?.description}
					</p>
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
	events,
	mutate,
}: {
	data?: Overview;
	events: EventCatalog;
	mutate: (input: {
		name: string;
		url: string;
		eventTypes: string[];
		businessUnitId?: string | null;
	}) => void;
}) {
	const [selectedEvents, setSelectedEvents] = useState<string[]>([
		"lead.submitted",
	]);
	const [customEvent, setCustomEvent] = useState("");
	const catalogIds = new Set<string>(events.map((event) => event.id));
	const customSelected = selectedEvents.filter((id) => !catalogIds.has(id));
	const addCustomEvent = () => {
		const value = customEvent.trim().toLowerCase();
		if (!value) return;
		setSelectedEvents((current) =>
			current.includes(value) ? current : [...current, value],
		);
		setCustomEvent("");
	};
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const unit = String(form.get("businessUnitId") ?? "");
				mutate({
					name: String(form.get("name")),
					url: String(form.get("url")),
					eventTypes: selectedEvents,
					businessUnitId: unit || null,
				});
			}}
		>
			<FieldGroup>
				<Alert>
					<AlertTitle>This sends data out of CRM</AlertTitle>
					<AlertDescription>
						CRM will POST selected events to the URL below. To send a form or
						update a contact in CRM, use the{" "}
						<Link href="/settings?section=access">REST API guide</Link> instead.
					</AlertDescription>
				</Alert>
				<Field>
					<FieldLabel htmlFor="webhook-name">Name</FieldLabel>
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
					<FieldDescription>
						Must be a public HTTPS endpoint that accepts signed JSON POST
						requests and returns a 2xx response. Verify x-crm-signature as the
						SHA-256 HMAC of the raw request body using the one-time webhook
						secret.
					</FieldDescription>
				</Field>
				<Field>
					<FieldLabel>Events to send</FieldLabel>
					<div className="grid gap-2 sm:grid-cols-2">
						{events.map((event) => {
							const selected = selectedEvents.includes(event.id);
							return (
								<Button
									key={event.id}
									type="button"
									variant={selected ? "secondary" : "outline"}
									className="h-auto justify-start whitespace-normal p-3 text-left"
									aria-pressed={selected}
									onClick={() =>
										setSelectedEvents((current) =>
											selected
												? current.filter((id) => id !== event.id)
												: [...current, event.id],
										)
									}
								>
									<span>
										<span className="block font-medium text-xs">
											{event.label}
										</span>
										<span className="block text-muted-foreground text-xs">
											{event.description}
										</span>
									</span>
								</Button>
							);
						})}
					</div>
				</Field>
				<Field>
					<FieldLabel htmlFor="webhook-custom-event">
						Custom event type
					</FieldLabel>
					<div className="flex gap-2">
						<Input
							id="webhook-custom-event"
							value={customEvent}
							placeholder="e.g. deal.stage_changed"
							onChange={(event) => setCustomEvent(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									addCustomEvent();
								}
							}}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={!customEvent.trim()}
							onClick={addCustomEvent}
						>
							Add
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">
						Any event type the platform emits (or will emit) can be subscribed
						to, even before it is in the catalog above.
					</p>
					{customSelected.length ? (
						<div className="flex flex-wrap gap-1.5">
							{customSelected.map((id) => (
								<Button
									key={id}
									type="button"
									variant="secondary"
									size="sm"
									onClick={() =>
										setSelectedEvents((current) =>
											current.filter((candidate) => candidate !== id),
										)
									}
								>
									{id} ×
								</Button>
							))}
						</div>
					) : null}
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
				<Button type="submit" disabled={selectedEvents.length === 0}>
					Create webhook
				</Button>
			</FieldGroup>
		</form>
	);
}

export function ExternalAccessSettings({ apiBaseUrl }: { apiBaseUrl: string }) {
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
					Clone your own live access for an agent, or create a restricted key
					for forms and integrations. The same key authenticates REST and MCP.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{newToken ? (
					<Alert className="border-foreground/20">
						<AlertTitle>Copy this token now</AlertTitle>
						<AlertDescription className="flex flex-col gap-3 pt-1">
							<p>
								This is the only time the complete token is shown. Store it in
								your server-side secret manager; never commit it or expose it in
								browser code.
							</p>
							<div className="flex min-w-0 gap-2">
								<Input
									value={newToken}
									readOnly
									aria-label="New API token"
									className="min-w-0 font-mono text-xs"
								/>
								<CopyButton value={newToken} label="Copy token" />
							</div>
						</AlertDescription>
					</Alert>
				) : null}

				<IntegrationGuide apiBaseUrl={apiBaseUrl} />

				<section
					aria-labelledby="issue-credential-title"
					className="flex flex-col gap-3"
				>
					<div>
						<h3 id="issue-credential-title" className="text-sm font-medium">
							Issue a credential
						</h3>
						<p className="text-muted-foreground text-xs/relaxed">
							A clone follows your current permissions automatically. Scoped
							access uses the selected role and business unit.
						</p>
					</div>
					<CredentialForm data={governance.data} mutate={create.mutate} />
				</section>

				<section
					aria-labelledby="issued-credentials-title"
					className="flex flex-col gap-2"
				>
					<h3 id="issued-credentials-title" className="text-sm font-medium">
						Issued credentials
					</h3>
					{credentials.data?.length ? (
						credentials.data.map((credential) => {
							const units = credential.businessUnits
								.map(({ businessUnit }) => businessUnit.name)
								.join(", ");
							const teams = credential.teams
								.map(({ team }) => team.name)
								.join(", ");
							const unitIds = credential.businessUnits
								.map(({ businessUnit }) => businessUnit.id)
								.join(", ");
							const isClone = credential.accessMode === "USER_DELEGATE";
							return (
								<div
									key={credential.id}
									className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
								>
									<div className="min-w-0">
										<p className="text-sm font-medium">{credential.name}</p>
										<p className="text-muted-foreground text-xs">
											{isClone
												? `Clone of ${credential.createdBy.name}`
												: credential.role.name}{" "}
											· {credential.prefix}…{credential.lastFour} ·{" "}
											{credential.status}
										</p>
										{isClone ? (
											<p className="text-muted-foreground text-xs">
												Live access · {credential.createdBy.email}
											</p>
										) : (
											<p className="text-muted-foreground text-xs">
												Business unit ID:{" "}
												<code className="font-mono">{unitIds}</code>
											</p>
										)}
										<p className="text-muted-foreground text-xs">
											Scope:{" "}
											{isClone ? "Same as user" : units || "No business units"}
											{teams ? ` · Teams: ${teams}` : ""} · Last used:{" "}
											{credential.lastUsedAt
												? `${utcDateTime.format(
														new Date(credential.lastUsedAt),
													)} UTC`
												: "Never"}
										</p>
									</div>
									{credential.status === "ACTIVE" ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={revoke.isPending}
											onClick={() => revoke.mutate({ id: credential.id })}
										>
											Revoke
										</Button>
									) : null}
								</div>
							);
						})
					) : (
						<p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
							No credentials issued yet.
						</p>
					)}
				</section>
			</CardContent>
		</Card>
	);
}

function IntegrationGuide({ apiBaseUrl }: { apiBaseUrl: string }) {
	const baseUrl = apiBaseUrl.replace(/\/+$/, "");
	const mcpUrl = `${baseUrl}/mcp`;
	const restUrl = `${baseUrl}/api/v1`;
	const authorization = "Bearer <YOUR_TOKEN>";
	const mcpConfig = JSON.stringify(
		{
			mcpServers: {
				crm: {
					type: "http",
					url: mcpUrl,
					headers: { Authorization: authorization },
				},
			},
		},
		null,
		2,
	);
	const leadExample = `curl --request POST \\
  --url '${restUrl}/leads' \\
  --header 'Authorization: ${authorization}' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "source": "website-contact-form",
    "idempotencyKey": "<FORM_SUBMISSION_ID>",
    "businessUnitId": "<BUSINESS_UNIT_ID>",
    "firstName": "Example",
    "lastName": "Person",
    "email": "person@example.com",
    "utmSource": "website"
  }'`;
	const updateExample = `# Find the scoped contact ID
curl --request GET \\
  --url '${restUrl}/contacts?email=person%40example.com' \\
  --header 'Authorization: ${authorization}'

# Update supported basic fields
curl --request PATCH \\
  --url '${restUrl}/contacts/<CONTACT_ID>' \\
  --header 'Authorization: ${authorization}' \\
  --header 'Content-Type: application/json' \\
  --data '{"title":"Sales Director","phone":"+55 11 0000-0000"}'`;

	return (
		<section
			aria-labelledby="connect-systems-title"
			className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4"
		>
			<div>
				<h3 id="connect-systems-title" className="text-sm font-medium">
					Connect your systems
				</h3>
				<p className="text-muted-foreground text-xs/relaxed">
					Use Streamable HTTP MCP for agents and the REST API for direct system
					integrations. Both use the same Bearer token and enforce its assigned
					role and scope.
				</p>
			</div>

			<div className="grid gap-3 lg:grid-cols-2">
				<ConnectionValue label="MCP endpoint" value={mcpUrl} />
				<ConnectionValue label="REST base URL" value={restUrl} />
			</div>
			<ConnectionValue
				label="Authorization header"
				value={`Authorization: ${authorization}`}
			/>

			<Tabs defaultValue="mcp">
				<TabsList aria-label="Connection examples">
					<TabsTrigger value="mcp">MCP client</TabsTrigger>
					<TabsTrigger value="lead">Form / lead</TabsTrigger>
					<TabsTrigger value="update">Update contact</TabsTrigger>
				</TabsList>
				<TabsContent value="mcp" className="flex flex-col gap-2">
					<p className="text-muted-foreground">
						Add this server to any client that supports remote HTTP MCP. Client
						configuration names can vary; the endpoint and header above are the
						authoritative values.
					</p>
					<p className="text-muted-foreground">
						With “Clone my access”, the agent can search and edit contacts, find
						companies, create and move deals, add products, and read, create or
						complete tasks—subject to your live permissions.
					</p>
					<CodeSample label="Copy MCP config" value={mcpConfig} />
				</TabsContent>
				<TabsContent value="lead" className="flex flex-col gap-2">
					<p className="text-muted-foreground">
						Your browser form should submit to your own backend or serverless
						function, which forwards this request to CRM. Never put the Bearer
						token in browser code. Use the business-unit ID shown beside the
						issued credential below.
					</p>
					<CodeSample label="Copy lead example" value={leadExample} />
					<p className="text-muted-foreground">
						The response is a durable submission receipt. Search by email within
						the credential scope when you need the contact ID.
					</p>
				</TabsContent>
				<TabsContent value="update" className="flex flex-col gap-2">
					<p className="text-muted-foreground">
						Find the contact within the credential scope, then PATCH its basic
						profile or attribution fields. The credential role must grant
						contact read and update permissions.
					</p>
					<CodeSample
						label="Copy contact update example"
						value={updateExample}
					/>
				</TabsContent>
			</Tabs>

			<ol className="flex list-decimal flex-col gap-1 pl-4 text-muted-foreground text-xs/relaxed">
				<li>Create a key and copy its one-time token.</li>
				<li>Store it as a server-side secret, such as CRM_API_KEY.</li>
				<li>Replace the placeholder in your MCP client or REST request.</li>
				<li>
					Revoke the key here immediately if it is exposed or no longer used.
				</li>
			</ol>
		</section>
	);
}

function ConnectionValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="font-medium text-xs">{label}</p>
			<div className="flex min-w-0 gap-2">
				<Input
					value={value}
					readOnly
					aria-label={label}
					className="min-w-0 font-mono text-xs"
				/>
				<CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
			</div>
		</div>
	);
}

function CodeSample({ label, value }: { label: string; value: string }) {
	return (
		<div className="overflow-hidden rounded-md border bg-background">
			<div className="flex justify-end border-b p-1.5">
				<CopyButton value={value} label={label} />
			</div>
			<pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed">
				<code>{value}</code>
			</pre>
		</div>
	);
}

function CopyButton({ value, label }: { value: string; label: string }) {
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			aria-label={label}
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(value);
					toast.success("Copied to clipboard.");
				} catch {
					toast.error("Could not copy to clipboard.");
				}
			}}
		>
			<Icon icon={Copy} />
			<span className="hidden sm:inline">Copy</span>
		</Button>
	);
}

function CredentialForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		accessMode: "SCOPED_ROLE" | "USER_DELEGATE";
		roleId?: string;
		businessUnitIds: string[];
		teamIds: string[];
	}) => void;
}) {
	const [accessMode, setAccessMode] = useState<"SCOPED_ROLE" | "USER_DELEGATE">(
		"USER_DELEGATE",
	);
	return (
		<form
			className="grid gap-2 md:grid-cols-5 md:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const delegated = accessMode === "USER_DELEGATE";
				mutate({
					name: String(form.get("name")),
					accessMode,
					roleId: delegated ? undefined : String(form.get("roleId")),
					businessUnitIds: delegated
						? []
						: [String(form.get("businessUnitId"))],
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
				<FieldLabel>Access</FieldLabel>
				<Select
					value={accessMode}
					onValueChange={(value) =>
						setAccessMode(value as "SCOPED_ROLE" | "USER_DELEGATE")
					}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="USER_DELEGATE">Clone my access</SelectItem>
							<SelectItem value="SCOPED_ROLE">Restricted role</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			{accessMode === "SCOPED_ROLE" ? (
				<div className="grid gap-2 md:col-span-2 md:grid-cols-2">
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
				</div>
			) : (
				<p className="self-center text-muted-foreground text-xs md:col-span-2">
					Can read and act exactly as you can. Permission changes apply
					immediately.
				</p>
			)}
			<Button type="submit">Create key</Button>
		</form>
	);
}
