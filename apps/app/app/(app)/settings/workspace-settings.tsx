"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const CURRENCIES = [
	{ value: "BRL", label: "BRL — Brazilian real" },
	{ value: "USD", label: "USD — US dollar" },
	{ value: "EUR", label: "EUR — Euro" },
	{ value: "GBP", label: "GBP — Pound sterling" },
	{ value: "JPY", label: "JPY — Japanese yen" },
	{ value: "CAD", label: "CAD — Canadian dollar" },
	{ value: "AUD", label: "AUD — Australian dollar" },
	{ value: "MXN", label: "MXN — Mexican peso" },
] as const;

export function WorkspaceSettings() {
	const trpc = useTRPC();
	const configuration = useQuery(
		trpc.governance.workspaceConfiguration.queryOptions(),
	);
	if (!configuration.data)
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	return (
		<WorkspaceSettingsForm
			key={configuration.data.currency}
			currency={configuration.data.currency}
		/>
	);
}

/**
 * One setting, saved the moment it changes.
 *
 * The previous version put the combobox in a page-wide card above a submit
 * button that spent its life disabled — a grey button under a single field
 * reads as something broken, not as "nothing to save". A currency default is
 * a low-stakes, instantly-reversible choice; picking it *is* the intent.
 */
function WorkspaceSettingsForm({
	currency: initialCurrency,
}: {
	currency: string;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [currency, setCurrency] = useState(initialCurrency);
	const save = useMutation(
		trpc.governance.updateWorkspaceConfiguration.mutationOptions({
			onSuccess: async (data) => {
				await queryClient.invalidateQueries(
					trpc.governance.workspaceConfiguration.queryFilter(),
				);
				toast.success(`Workspace currency changed to ${data.currency}.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	return (
		<Card className="max-w-2xl">
			<CardHeader>
				<CardTitle>Workspace preferences</CardTitle>
				<CardDescription>
					Defaults every new commercial record starts from.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border p-4">
					<div className="min-w-48">
						<p className="font-medium text-sm">Account currency</p>
						<p className="mt-0.5 text-muted-foreground text-xs">
							Existing deals keep their saved currency; new records use this
							default.
						</p>
					</div>
					<SearchCombobox
						value={currency}
						onValueChange={(next) => {
							setCurrency(next);
							if (next && next !== initialCurrency)
								save.mutate({ currency: next });
						}}
						options={[...CURRENCIES]}
						placeholder="Choose currency"
						searchPlaceholder="Search currencies…"
						className="w-56"
					/>
				</div>
			</CardContent>
		</Card>
	);
}
