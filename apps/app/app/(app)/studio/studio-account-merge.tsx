"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
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
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { Configuration } from "./studio-account-config";
import type { Account } from "./studio-account-detail";
import { studioParsers } from "./studio-search-params";
import { studioMutationOptions } from "./studio-trpc";

type Policy = "TARGET" | "SOURCE" | "UNION" | "SKIP";
type Candidate = RouterOutputs["revenueAccounts"]["mergeCandidates"][number];
type Preview = RouterOutputs["revenueAccounts"]["mergePreview"];
type MergeInput = {
	sourceAccountId: string;
	targetAccountId: string;
	fieldPolicies: Record<string, Policy>;
};

const POLICIES: Policy[] = ["TARGET", "SOURCE", "UNION", "SKIP"];

export function StudioAccountMerge({
	account,
	configuration,
	canManage,
}: {
	account: Account;
	configuration: Configuration | undefined;
	canManage: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [candidateQ, setCandidateQ] = useQueryState(
		"accountQ",
		studioParsers.accountQ,
	);
	const [sourceId, setSourceId] = useState("");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmed, setConfirmed] = useState(false);
	const [policies, setPolicies] = useState<Record<string, Policy>>(
		(
			configuration as unknown as
				| { mergePolicy?: Record<string, Policy> }
				| undefined
		)?.mergePolicy ?? {},
	);
	const candidates = useQuery({
		...trpc.revenueAccounts.mergeCandidates.queryOptions({
			q: candidateQ,
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 100,
			owner: "all",
		}),
	});
	const preview = useQuery({
		...trpc.revenueAccounts.mergePreview.queryOptions({
			sourceAccountId: sourceId,
			targetAccountId: account.id,
		}),
		enabled: Boolean(sourceId) && sourceId !== account.id,
	});
	const merge = useMutation(
		studioMutationOptions<unknown, MergeInput>(trpc.revenueAccounts.merge, {
			onSuccess: async () => {
				await cache.revenueAccounts(account.id);
				setSourceId("");
				setConfirmed(false);
				setConfirmOpen(false);
				toast.success("Accounts merged with lineage preserved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const visibleCandidates = (candidates.data ?? []).filter(
		(candidate) => candidate.id !== account.id,
	);
	const conflictCount = preview.data?.conflicts.length ?? 0;
	const missingPolicies = (preview.data?.conflicts ?? []).filter(
		(key) => !policies[key],
	);

	return (
		<div className="flex flex-col gap-5">
			<Card>
				<CardHeader>
					<CardTitle>Guided merge</CardTitle>
					<CardDescription>
						Choose a source Conta to merge into <strong>{account.name}</strong>.
						The source is archived, relations move to the target and every
						decision is written to lineage.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<Field>
						<FieldLabel htmlFor="merge-candidate-search">
							Find a candidate
						</FieldLabel>
						<Input
							id="merge-candidate-search"
							value={candidateQ}
							onChange={(event) => void setCandidateQ(event.target.value)}
							placeholder="Search by name or domain"
						/>
					</Field>
					{candidates.isLoading ? (
						<div className="flex justify-center py-6">
							<Spinner />
						</div>
					) : null}
					{visibleCandidates.length === 0 && !candidates.isLoading ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyTitle>No merge candidates</EmptyTitle>
								<EmptyDescription>
									Only visible, active accounts are offered. Try a broader
									search.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}
					<div className="grid gap-2 md:grid-cols-2">
						{visibleCandidates.slice(0, 12).map((candidate) => (
							<CandidateButton
								key={candidate.id}
								candidate={candidate}
								selected={candidate.id === sourceId}
								onClick={() => setSourceId(candidate.id)}
							/>
						))}
					</div>
				</CardContent>
			</Card>

			{sourceId ? (
				<MergePreviewPanel
					preview={preview.data}
					policies={policies}
					onPolicyChange={(key, value) =>
						setPolicies((current) => ({ ...current, [key]: value }))
					}
				/>
			) : null}
			{sourceId && preview.data ? (
				<Card>
					<CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
						<div className="text-xs">
							<p className="font-medium">
								{conflictCount
									? `${conflictCount} field conflicts need a policy`
									: "No field conflicts"}
							</p>
							<p className="text-muted-foreground">
								{preview.data.relationCounts.source.contacts +
									preview.data.relationCounts.source.companies +
									preview.data.relationCounts.source.deals}{" "}
								source relations will move.
							</p>
						</div>
						<Button
							type="button"
							disabled={
								!canManage || missingPolicies.length > 0 || merge.isPending
							}
							onClick={() => {
								setConfirmed(false);
								setConfirmOpen(true);
							}}
						>
							Review and merge
						</Button>
					</CardContent>
				</Card>
			) : null}

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Conta merge</DialogTitle>
						<DialogDescription>
							This cannot be undone from the Studio. The source account will be
							archived, its relations will point to {account.name}, and the
							selected field policy will be recorded.
						</DialogDescription>
					</DialogHeader>
					<label
						htmlFor="confirm-account-merge"
						className="flex items-start gap-3 border p-3 text-xs"
					>
						<Checkbox
							id="confirm-account-merge"
							checked={confirmed}
							onCheckedChange={(value) => setConfirmed(value === true)}
						/>
						<span>
							I understand that this is a durable merge and I have reviewed the
							conflicts.
						</span>
					</label>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={!confirmed || merge.isPending}
							onClick={() =>
								merge.mutate({
									sourceAccountId: sourceId,
									targetAccountId: account.id,
									fieldPolicies: policies,
								})
							}
						>
							{merge.isPending ? "Merging…" : "Confirm merge"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function CandidateButton({
	candidate,
	selected,
	onClick,
}: {
	candidate: Candidate;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`border p-3 text-left transition-colors hover:bg-muted/50 ${selected ? "border-primary bg-muted" : ""}`}
			aria-pressed={selected}
			onClick={onClick}
		>
			<p className="font-medium text-sm">{candidate.name}</p>
			<p className="text-muted-foreground text-xs">
				{candidate.domain || "No domain"}
			</p>
			<p className="mt-2 text-muted-foreground text-xs">
				{candidate.reasons.join(" · ")}
			</p>
		</button>
	);
}

function MergePreviewPanel({
	preview,
	policies,
	onPolicyChange,
}: {
	preview: Preview | undefined;
	policies: Record<string, Policy>;
	onPolicyChange: (key: string, value: Policy) => void;
}) {
	if (!preview)
		return (
			<div className="flex justify-center border py-8">
				<Spinner />
			</div>
		);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Conflict preview</CardTitle>
				<CardDescription>
					{preview.source.name} → {preview.target.name}. Choose how each
					conflicting attribute should be retained.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{preview.conflicts.length === 0 ? (
					<p className="text-muted-foreground text-xs">
						No custom field conflicts were found.
					</p>
				) : (
					<div className="grid gap-3 md:grid-cols-2">
						{preview.conflicts.map((key) => (
							<Field key={key}>
								<FieldLabel htmlFor={`merge-policy-${key}`}>{key}</FieldLabel>
								<Select
									value={policies[key] ?? ""}
									onValueChange={(value) =>
										onPolicyChange(key, value as Policy)
									}
								>
									<SelectTrigger id={`merge-policy-${key}`} className="w-full">
										<SelectValue placeholder="Choose a policy" />
									</SelectTrigger>
									<SelectContent>
										{POLICIES.map((policy) => (
											<SelectItem key={policy} value={policy}>
												{policy}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
