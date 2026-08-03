"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
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
		<Card>
			<CardHeader>
				<CardTitle>Workspace preferences</CardTitle>
				<CardDescription>
					The default currency used when a new commercial record does not
					provide one.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="flex max-w-xl flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate({ currency });
					}}
				>
					<Field>
						<FieldLabel>Account currency</FieldLabel>
						<SearchCombobox
							value={currency}
							onValueChange={setCurrency}
							options={[...CURRENCIES]}
							placeholder="Choose currency"
							searchPlaceholder="Search currencies…"
							className="w-full"
						/>
					</Field>
					<p className="text-muted-foreground text-xs">
						Existing deals keep their saved currency. New records use this
						account default.
					</p>
					<Button
						type="submit"
						className="w-fit"
						disabled={save.isPending || currency === initialCurrency}
					>
						Save preferences
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
