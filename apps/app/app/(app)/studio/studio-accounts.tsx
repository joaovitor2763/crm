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
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	type Configuration,
	StudioAccountConfig,
} from "./studio-account-config";
import { StudioAccountDetail } from "./studio-account-detail";
import { studioParsers } from "./studio-search-params";
import { studioMutationOptions } from "./studio-trpc";

type AccountRow = {
	id: string;
	name: string;
	domain: string | null;
	owner: { name: string } | null;
	_count: { contacts: number; companies: number; deals: number };
};

type CreateInput = {
	name: string;
	domain?: string;
	customValues: Record<string, unknown>;
};

type CreatedAccount = { id: string };

export function StudioAccounts({
	canManage,
	canConfigure,
}: {
	canManage: boolean;
	canConfigure: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [accountId, setAccountId] = useQueryState(
		"account",
		studioParsers.account,
	);
	const [query, setQuery] = useQueryState("accountQ", studioParsers.accountQ);
	const [showCreate, setShowCreate] = useState(false);
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");
	const configuration = useQuery(
		trpc.revenueAccounts.configuration.queryOptions(),
	);
	const accounts = useQuery(
		trpc.revenueAccounts.list.queryOptions({
			q: query,
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 50,
			owner: "all",
		}),
	);
	const create = useMutation(
		studioMutationOptions<CreatedAccount, CreateInput>(
			trpc.revenueAccounts.create,
			{
				onSuccess: async (created) => {
					await cache.revenueAccounts(created.id);
					setName("");
					setDomain("");
					setShowCreate(false);
					await setAccountId(created.id);
					toast.success("Conta created.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);
	const rows = (accounts.data?.rows ?? []) as AccountRow[];

	return (
		<div className="flex flex-col gap-6">
			<StudioAccountConfig canManage={canConfigure} />
			<div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
				<Card className="min-w-0">
					<CardHeader>
						<div className="flex items-start justify-between gap-3">
							<div>
								<CardTitle>Accounts</CardTitle>
								<CardDescription>
									Visible active records in your governed scope.
								</CardDescription>
							</div>
							{canManage && configuration.data?.enabled ? (
								<Button
									type="button"
									size="sm"
									onClick={() => setShowCreate((open) => !open)}
								>
									{showCreate ? "Cancel" : "New account"}
								</Button>
							) : null}
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{showCreate ? (
							<CreateAccountForm
								name={name}
								domain={domain}
								setName={setName}
								setDomain={setDomain}
								disabled={create.isPending}
								onSubmit={() => {
									if (name.trim())
										create.mutate({
											name,
											domain: domain.trim() || undefined,
											customValues: {},
										});
								}}
							/>
						) : null}
						<Field>
							<FieldLabel htmlFor="account-search">Search accounts</FieldLabel>
							<Input
								id="account-search"
								value={query}
								onChange={(event) => void setQuery(event.target.value)}
								placeholder="Name or domain"
							/>
						</Field>
						{accounts.isLoading ? (
							<div className="flex justify-center py-8">
								<Spinner />
							</div>
						) : null}
						{rows.length === 0 && !accounts.isLoading ? (
							<Empty className="border">
								<EmptyHeader>
									<EmptyTitle>No accounts yet</EmptyTitle>
									<EmptyDescription>
										{configuration.data?.enabled
											? "Create the first Conta or adjust the search."
											: "Enable Conta above before creating an account."}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : null}
						<div className="flex flex-col gap-1">
							{rows.map((row) => (
								<AccountListItem
									key={row.id}
									row={row}
									selected={row.id === accountId}
									onSelect={() => void setAccountId(row.id)}
								/>
							))}
						</div>
					</CardContent>
				</Card>
				{accountId ? (
					<StudioAccountDetail
						accountId={accountId}
						configuration={configuration.data}
						canManage={canManage}
					/>
				) : (
					<Empty className="min-h-72 border">
						<EmptyHeader>
							<EmptyTitle>Select an account</EmptyTitle>
							<EmptyDescription>
								Inspect relations, field history and merge candidates without
								leaving the architecture map.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</div>
		</div>
	);
}

function CreateAccountForm({
	name,
	domain,
	setName,
	setDomain,
	disabled,
	onSubmit,
}: {
	name: string;
	domain: string;
	setName: (value: string) => void;
	setDomain: (value: string) => void;
	disabled: boolean;
	onSubmit: () => void;
}) {
	return (
		<form
			className="grid gap-2 border-b pb-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<Field>
				<FieldLabel htmlFor="new-account-name">Name</FieldLabel>
				<Input
					id="new-account-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Acme account"
					required
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="new-account-domain">Domain</FieldLabel>
				<Input
					id="new-account-domain"
					value={domain}
					onChange={(event) => setDomain(event.target.value)}
					placeholder="acme.example"
				/>
			</Field>
			<Button type="submit" size="sm" disabled={disabled || !name.trim()}>
				{disabled ? "Creating…" : "Create account"}
			</Button>
		</form>
	);
}

function AccountListItem({
	row,
	selected,
	onSelect,
}: {
	row: AccountRow;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className={`flex w-full items-start justify-between gap-3 border p-3 text-left transition-colors hover:bg-muted/50 ${selected ? "border-primary bg-muted" : ""}`}
			aria-pressed={selected}
			onClick={onSelect}
		>
			<span className="min-w-0">
				<span className="block truncate font-medium text-sm">{row.name}</span>
				<span className="block truncate text-muted-foreground text-xs">
					{row.domain || "No domain"}
				</span>
			</span>
			<span className="flex shrink-0 flex-col items-end gap-1">
				<StatusIndicator
					tone="neutral"
					label={`${row._count.contacts + row._count.companies + row._count.deals} links`}
				/>
				<span className="text-muted-foreground text-[0.65rem]">
					{row.owner?.name || "Unassigned"}
				</span>
			</span>
		</button>
	);
}

export type { Configuration };
