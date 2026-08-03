"use client";

import Renew from "@carbon/icons-react/es/Renew";
import Stop from "@carbon/icons-react/es/Stop";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function AiSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const configuration = useQuery(trpc.agentAdmin.configuration.queryOptions());
	const [q, setQ] = useState("");
	const [status, setStatus] = useState<
		"all" | "pending" | "running" | "finished" | "failed"
	>("all");
	const [page, setPage] = useState(1);
	const deferredQ = useDeferredValue(q);
	const tasks = useQuery({
		...trpc.agentAdmin.tasks.queryOptions({
			q: deferredQ,
			status,
			page,
			pageSize: 25,
		}),
		refetchInterval: 15_000,
	});
	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries(
				trpc.agentAdmin.configuration.queryFilter(),
			),
			queryClient.invalidateQueries(trpc.agentAdmin.tasks.queryFilter()),
		]);
	};
	const save = useMutation(
		trpc.agentAdmin.updateConfiguration.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("AI configuration saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const retry = useMutation(
		trpc.agentAdmin.retryTask.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const cancel = useMutation(
		trpc.agentAdmin.cancelTask.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const config = configuration.data;

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>AI provider and models</CardTitle>
					<CardDescription>
						Installation-wide OpenRouter credential, approved models and
						defaults by workload.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!config ? (
						<div className="flex justify-center py-12">
							<Spinner />
						</div>
					) : (
						<AiConfigurationForm
							key={config.lastFour ?? "empty"}
							config={config}
							pending={save.isPending}
							onSave={save.mutate}
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Agent task queue</CardTitle>
					<CardDescription>
						Operational work for the research agent. Commercial follow-up tasks
						remain in record Activity and the Overview.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							value={q}
							onChange={(event) => {
								setQ(event.target.value);
								setPage(1);
							}}
							placeholder="Search reason, kind or record…"
							className="sm:max-w-sm"
						/>
						<Select
							value={status}
							onValueChange={(value) => {
								setStatus(value as typeof status);
								setPage(1);
							}}
						>
							<SelectTrigger className="w-full sm:w-44">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All statuses</SelectItem>
								<SelectItem value="pending">Pending</SelectItem>
								<SelectItem value="running">Running</SelectItem>
								<SelectItem value="failed">Failed</SelectItem>
								<SelectItem value="finished">Finished</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="overflow-x-auto border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Task</TableHead>
									<TableHead>Record</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Due</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{tasks.isLoading ? (
									<TableRow>
										<TableCell colSpan={5} className="py-10 text-center">
											<Spinner />
										</TableCell>
									</TableRow>
								) : tasks.data?.rows.length ? (
									tasks.data.rows.map((task) => {
										const taskStatus = task.finishedAt
											? task.outcome?.startsWith("Cancelled")
												? "CANCELLED"
												: task.outcome && task.outcome !== "ran"
													? "FAILED"
													: "FINISHED"
											: task.leasedUntil &&
													new Date(task.leasedUntil) >= new Date(tasks.data.now)
												? "RUNNING"
												: "PENDING";
										return (
											<TableRow key={task.id}>
												<TableCell>
													<p className="font-medium text-xs">{task.kind}</p>
													<p className="max-w-72 truncate text-muted-foreground text-xs">
														{task.reason}
													</p>
												</TableCell>
												<TableCell>
													{task.contact
														? [task.contact.firstName, task.contact.lastName]
																.filter(Boolean)
																.join(" ")
														: (task.company?.name ?? "—")}
												</TableCell>
												<TableCell>
													<StatusIndicator
														tone={
															taskStatus === "FAILED"
																? "error"
																: taskStatus === "CANCELLED"
																	? "neutral"
																	: taskStatus === "RUNNING"
																		? "info"
																		: taskStatus === "FINISHED"
																			? "success"
																			: "neutral"
														}
														label={taskStatus}
													/>
												</TableCell>
												<TableCell className="whitespace-nowrap">
													{new Date(task.dueAt).toLocaleString()}
												</TableCell>
												<TableCell>
													<div className="flex justify-end gap-1">
														<Button
															variant="ghost"
															size="icon-sm"
															aria-label="Retry task"
															disabled={taskStatus === "RUNNING"}
															onClick={() => retry.mutate({ id: task.id })}
														>
															<Icon icon={Renew} />
														</Button>
														{!task.finishedAt ? (
															<Button
																variant="ghost"
																size="icon-sm"
																aria-label="Cancel task"
																disabled={taskStatus === "RUNNING"}
																onClick={() => cancel.mutate({ id: task.id })}
															>
																<Icon icon={Stop} />
															</Button>
														) : null}
													</div>
												</TableCell>
											</TableRow>
										);
									})
								) : (
									<TableRow>
										<TableCell
											colSpan={5}
											className="py-10 text-center text-muted-foreground"
										>
											No agent tasks match these filters.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
					<div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
						<span>
							{tasks.data?.total ?? 0} tasks · page {page}
						</span>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => setPage((value) => value - 1)}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={!tasks.data || page * 25 >= tasks.data.total}
								onClick={() => setPage((value) => value + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function AiConfigurationForm({
	config,
	pending,
	onSave,
}: {
	config: {
		storageEnabled: boolean;
		providerConfigured: boolean;
		lastFour: string | null;
		models: string[];
		modelContextWindows: Record<string, number>;
		defaults: { interactive: string; research: string; enrichment: string };
	};
	pending: boolean;
	onSave: (input: {
		apiKey?: string;
		clearApiKey: boolean;
		models: string[];
		modelContextWindows: Record<string, number>;
		defaults: { interactive: string; research: string; enrichment: string };
	}) => void;
}) {
	const [modelsText, setModelsText] = useState(
		config.models
			.map(
				(model) => `${model} | ${config.modelContextWindows[model] ?? 32_768}`,
			)
			.join("\n"),
	);
	const [interactive, setInteractive] = useState(config.defaults.interactive);
	const [research, setResearch] = useState(config.defaults.research);
	const [enrichment, setEnrichment] = useState(config.defaults.enrichment);
	const [clear, setClear] = useState(false);
	const modelEntries = modelsText
		.split("\n")
		.map((line) => {
			const [model = "", tokens = ""] = line
				.split("|")
				.map((value) => value.trim());
			return { model, contextWindow: Number(tokens) };
		})
		.filter((entry) => entry.model);
	const models = modelEntries.map((entry) => entry.model);
	const modelContextWindows = Object.fromEntries(
		modelEntries
			.filter(
				(entry) =>
					Number.isInteger(entry.contextWindow) && entry.contextWindow >= 8_192,
			)
			.map((entry) => [entry.model, entry.contextWindow]),
	);
	const options = models.map((model) => ({ value: model, label: model }));
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const apiKey = String(form.get("apiKey") || "").trim();
				onSave({
					apiKey: apiKey || undefined,
					clearApiKey: clear,
					models,
					modelContextWindows,
					defaults: { interactive, research, enrichment },
				});
			}}
			className="grid gap-4"
		>
			<Alert>
				<AlertTitle>
					{config.providerConfigured
						? `Stored credential ····${config.lastFour}`
						: "No credential stored"}
				</AlertTitle>
				<AlertDescription>
					{config.storageEnabled
						? "A new key replaces the current key. It is encrypted and never returned to the browser."
						: "Set AI_CONFIG_ENCRYPTION_KEY in the installation environment to enable secure credential storage."}
				</AlertDescription>
			</Alert>
			<Field>
				<FieldLabel htmlFor="openrouter-key">OpenRouter API key</FieldLabel>
				<Input
					id="openrouter-key"
					name="apiKey"
					type="password"
					autoComplete="new-password"
					placeholder={
						config.providerConfigured
							? "Leave blank to keep current key"
							: "sk-or-…"
					}
					disabled={!config.storageEnabled || clear}
				/>
			</Field>
			{config.providerConfigured ? (
				<Button
					type="button"
					variant="ghost"
					className="w-fit text-destructive"
					onClick={() => setClear((value) => !value)}
				>
					{clear ? "Keep stored key" : "Remove stored key"}
				</Button>
			) : null}
			<Field>
				<FieldLabel htmlFor="approved-models">Approved models</FieldLabel>
				<textarea
					id="approved-models"
					value={modelsText}
					onChange={(event) => setModelsText(event.target.value)}
					rows={4}
					className="w-full border bg-transparent p-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
					placeholder="provider/model | context tokens, one per line"
				/>
				<p className="text-muted-foreground text-xs">
					Use the context-window limit published by the model provider, for
					example: provider/model | 131072.
				</p>
			</Field>
			<div className="grid gap-3 md:grid-cols-3">
				<Field>
					<FieldLabel>Interactive</FieldLabel>
					<SearchCombobox
						value={interactive}
						onValueChange={setInteractive}
						options={options}
						placeholder="Choose model"
						searchPlaceholder="Search models…"
						className="w-full"
					/>
				</Field>
				<Field>
					<FieldLabel>Research</FieldLabel>
					<SearchCombobox
						value={research}
						onValueChange={setResearch}
						options={options}
						placeholder="Choose model"
						searchPlaceholder="Search models…"
						className="w-full"
					/>
				</Field>
				<Field>
					<FieldLabel>Enrichment</FieldLabel>
					<SearchCombobox
						value={enrichment}
						onValueChange={setEnrichment}
						options={options}
						placeholder="Choose model"
						searchPlaceholder="Search models…"
						className="w-full"
					/>
				</Field>
			</div>
			<Button
				type="submit"
				className="w-fit"
				disabled={pending || models.length === 0}
			>
				Save AI configuration
			</Button>
		</form>
	);
}
