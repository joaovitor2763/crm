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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { type Configuration, labelForTarget } from "./studio-account-config";
import { StudioAccountMerge } from "./studio-account-merge";
import { studioParsers } from "./studio-search-params";

type Account = RouterOutputs["revenueAccounts"]["byId"];
type TargetKind = "CONTACT" | "COMPANY" | "DEAL";

const TARGET_KINDS: TargetKind[] = ["CONTACT", "COMPANY", "DEAL"];

export function StudioAccountDetail({
	accountId,
	configuration,
	canManage,
}: {
	accountId: string;
	configuration: Configuration | undefined;
	canManage: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [tab, setTab] = useQueryState("accountTab", studioParsers.accountTab);
	const [targetKind, setTargetKind] = useState<TargetKind>("CONTACT");
	const [targetQ, setTargetQ] = useQueryState(
		"accountTargetQ",
		studioParsers.accountTargetQ,
	);
	const account = useQuery(
		trpc.revenueAccounts.byId.queryOptions({ id: accountId }),
	);
	const history = useQuery({
		...trpc.revenueAccounts.history.queryOptions({ id: accountId }),
		enabled: tab === "history" || tab === "merge",
	});

	const targetInput = {
		q: targetQ,
		sort: "createdAt" as const,
		dir: "desc" as const,
		page: 1,
		pageSize: 25,
	};
	const companies = useQuery({
		...trpc.companies.options.queryOptions({ q: targetQ }),
		enabled: targetKind === "COMPANY",
	});
	const contacts = useQuery({
		...trpc.contacts.list.queryOptions({
			...targetInput,
			owner: "all",
			company: "all",
			source: "all",
		}),
		enabled: targetKind === "CONTACT",
	});
	const deals = useQuery({
		...trpc.deals.list.queryOptions({
			...targetInput,
			status: "all",
			owner: "all",
			stage: "all",
			pipeline: "all",
			closing: "all",
		}),
		enabled: targetKind === "DEAL",
	});

	const associate = useMutation(
		trpc.revenueAccounts.associate.mutationOptions({
			onSuccess: async () => {
				await cache.revenueAccounts(accountId);
				toast.success("Relation attached.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const detach = useMutation(
		trpc.revenueAccounts.detach.mutationOptions({
			onSuccess: async () => {
				await cache.revenueAccounts(accountId);
				toast.success("Relation detached.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (account.isLoading) {
		return (
			<div className="flex justify-center border py-12">
				<Spinner />
			</div>
		);
	}
	if (!account.data) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Conta unavailable</EmptyTitle>
					<EmptyDescription>
						This record is outside your current scope or has been archived.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const detail = account.data;
	const relation = configuration?.relationPolicies.find(
		(item) => item.targetKind === targetKind,
	);
	const targetOptions = targetRows(
		targetKind,
		companies.data,
		contacts.data,
		deals.data,
	);
	const relationRows = [
		...detail.contacts.map((row) => ({
			id: row.contactId,
			kind: "CONTACT" as const,
			label: [row.contact.firstName, row.contact.lastName]
				.filter(Boolean)
				.join(" "),
			secondary: row.contact.email,
		})),
		...detail.companies.map((row) => ({
			id: row.companyId,
			kind: "COMPANY" as const,
			label: row.company.name,
			secondary: row.company.domain,
		})),
		...detail.deals.map((row) => ({
			id: row.dealId,
			kind: "DEAL" as const,
			label: row.deal.name,
			secondary: row.deal.companyId ?? "",
		})),
	];

	return (
		<div className="flex flex-col gap-5">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>{detail.name}</CardTitle>
							<CardDescription>
								{detail.domain || "No domain"} ·{" "}
								{detail.owner?.name || "Unassigned"}
							</CardDescription>
						</div>
						<div
							className="flex flex-wrap gap-1"
							role="tablist"
							aria-label="Conta detail"
						>
							{(
								[
									["details", "Relations"],
									["history", "History"],
									["merge", "Merge"],
								] as const
							).map(([value, label]) => (
								<Button
									key={value}
									type="button"
									variant={tab === value ? "default" : "outline"}
									size="sm"
									role="tab"
									aria-selected={tab === value}
									onClick={() => void setTab(value)}
								>
									{label}
								</Button>
							))}
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{tab === "details" ? (
						<div className="flex flex-col gap-6">
							<AssociationComposer
								targetKind={targetKind}
								onTargetKindChange={setTargetKind}
								targetQ={targetQ}
								onTargetQChange={setTargetQ}
								targetOptions={targetOptions}
								relationEnabled={relation?.attachEnabled === true}
								busy={associate.isPending}
								onAssociate={(targetId) =>
									associate.mutate({
										revenueAccountId: accountId,
										targetKind,
										targetId,
									})
								}
							/>
							<RelationTable
								rows={relationRows}
								canManage={canManage}
								canDetach={(kind) =>
									configuration?.relationPolicies.find(
										(item) => item.targetKind === kind,
									)?.detachEnabled === true
								}
								busy={detach.isPending}
								onDetach={(kind, targetId) =>
									detach.mutate({
										revenueAccountId: accountId,
										targetKind: kind,
										targetId,
									})
								}
							/>
						</div>
					) : null}
					{tab === "history" ? <HistoryPanel history={history.data} /> : null}
					{tab === "merge" ? (
						<StudioAccountMerge
							account={detail}
							configuration={configuration}
							canManage={canManage}
						/>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

type TargetOption = { id: string; label: string; secondary?: string | null };

function targetRows(
	kind: TargetKind,
	companies: RouterOutputs["companies"]["options"] | undefined,
	contacts: RouterOutputs["contacts"]["list"] | undefined,
	deals: RouterOutputs["deals"]["list"] | undefined,
): TargetOption[] {
	if (kind === "COMPANY")
		return (companies ?? []).map((item) => ({
			id: item.id,
			label: item.name,
			secondary: item.domain,
		}));
	if (kind === "CONTACT")
		return (contacts?.rows ?? []).map((item) => ({
			id: item.id,
			label: [item.firstName, item.lastName].filter(Boolean).join(" "),
			secondary: item.email,
		}));
	return (deals?.rows ?? []).map((item) => ({ id: item.id, label: item.name }));
}

function AssociationComposer({
	targetKind,
	onTargetKindChange,
	targetQ,
	onTargetQChange,
	targetOptions,
	relationEnabled,
	busy,
	onAssociate,
}: {
	targetKind: TargetKind;
	onTargetKindChange: (value: TargetKind) => void;
	targetQ: string;
	onTargetQChange: (value: string) => void;
	targetOptions: TargetOption[];
	relationEnabled: boolean;
	busy: boolean;
	onAssociate: (targetId: string) => void;
}) {
	return (
		<div className="grid gap-3 border-b pb-5 md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
			<Field>
				<FieldLabel>Attach object</FieldLabel>
				<Select
					value={targetKind}
					onValueChange={(value) => onTargetKindChange(value as TargetKind)}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TARGET_KINDS.map((kind) => (
							<SelectItem key={kind} value={kind}>
								{labelForTarget(kind)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel htmlFor="account-target-search">Search in scope</FieldLabel>
				<Input
					id="account-target-search"
					value={targetQ}
					onChange={(event) => onTargetQChange(event.target.value)}
					placeholder={`Find ${labelForTarget(targetKind).toLowerCase()}`}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="account-target">Record</FieldLabel>
				<div className="flex gap-2">
					<Select
						disabled={!relationEnabled || busy}
						onValueChange={onAssociate}
					>
						<SelectTrigger id="account-target" className="min-w-0 flex-1">
							<SelectValue
								placeholder={
									relationEnabled ? "Choose a record" : "Relation disabled"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{targetOptions.map((option) => (
								<SelectItem key={option.id} value={option.id}>
									{option.label}
									{option.secondary ? ` · ${option.secondary}` : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{busy ? <Spinner className="mt-2 size-4" /> : null}
				</div>
			</Field>
		</div>
	);
}

function RelationTable({
	rows,
	canManage,
	canDetach,
	busy,
	onDetach,
}: {
	rows: Array<{
		id: string;
		kind: TargetKind;
		label: string;
		secondary?: string | null;
	}>;
	canManage: boolean;
	canDetach: (kind: TargetKind) => boolean;
	busy: boolean;
	onDetach: (kind: TargetKind, id: string) => void;
}) {
	if (rows.length === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyTitle>No attached records</EmptyTitle>
					<EmptyDescription>
						Attach an in-scope contact, company or deal above. Every relation is
						recorded in lineage.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Object</TableHead>
					<TableHead>Record</TableHead>
					<TableHead>Details</TableHead>
					<TableHead>
						<span className="sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={`${row.kind}:${row.id}`}>
						<TableCell>{labelForTarget(row.kind)}</TableCell>
						<TableCell className="font-medium">{row.label}</TableCell>
						<TableCell className="text-muted-foreground">
							{row.secondary || "—"}
						</TableCell>
						<TableCell className="text-right">
							{canManage && canDetach(row.kind) ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => onDetach(row.kind, row.id)}
								>
									Detach
								</Button>
							) : null}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function HistoryPanel({
	history,
}: {
	history:
		| [
				Array<{
					changedAt: Date | string;
					fieldKey: string;
					previousValue: unknown;
					nextValue: unknown;
				}>,
				Array<{
					createdAt: Date | string;
					type: string;
					sourceId: string | null;
				}>,
		  ]
		| undefined;
}) {
	if (!history)
		return (
			<div className="flex justify-center py-8">
				<Spinner />
			</div>
		);
	const [attributes, events] = history;
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<HistoryTable
				title="Attribute history"
				rows={attributes.map((item) => ({
					at: item.changedAt,
					label: item.fieldKey,
					detail: `${value(item.previousValue)} → ${value(item.nextValue)}`,
				}))}
				empty="No attribute changes recorded."
			/>
			<HistoryTable
				title="Lineage events"
				rows={events.map((item) => ({
					at: item.createdAt,
					label: item.type,
					detail: item.sourceId || "System operation",
				}))}
				empty="No lineage events recorded."
			/>
		</div>
	);
}

function HistoryTable({
	title,
	rows,
	empty,
}: {
	title: string;
	rows: Array<{ at: Date | string; label: string; detail: string }>;
	empty: string;
}) {
	return (
		<div>
			<h3 className="mb-2 font-medium text-sm">{title}</h3>
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-xs">{empty}</p>
			) : (
				<Table>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={`${row.label}:${row.at}:${row.detail}`}>
								<TableCell className="text-muted-foreground">
									{formatDate(row.at)}
								</TableCell>
								<TableCell className="font-medium">{row.label}</TableCell>
								<TableCell className="max-w-[18rem] truncate">
									{row.detail}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}

function formatDate(value: Date | string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function value(input: unknown) {
	if (input == null) return "empty";
	if (typeof input === "string") return input;
	try {
		return JSON.stringify(input);
	} catch {
		return "value";
	}
}

export type { Account };
