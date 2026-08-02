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
import { Field, FieldLabel } from "@crm/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { studioMutationOptions } from "./studio-trpc";

export type Configuration = RouterOutputs["revenueAccounts"]["configuration"];
type RelationPolicy = Configuration["relationPolicies"][number];

const TARGETS = ["CONTACT", "COMPANY", "DEAL"] as const;
const CARDINALITIES = ["ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY"] as const;

type ConfigurationInput = {
	enabled: boolean;
	relations: Array<{
		targetKind: (typeof TARGETS)[number];
		cardinality: (typeof CARDINALITIES)[number];
		attachEnabled: boolean;
		detachEnabled: boolean;
	}>;
	mergePolicy: Record<string, "TARGET" | "SOURCE" | "UNION" | "SKIP">;
};

const DEFAULT_RELATIONS = TARGETS.map((targetKind) => ({
	targetKind,
	cardinality: "MANY_TO_MANY" as const,
	attachEnabled: true,
	detachEnabled: true,
}));

function labelForTarget(target: string) {
	return target === "CONTACT"
		? "Contacts"
		: target === "COMPANY"
			? "Companies"
			: "Deals";
}

function relationInput(relation: RelationPolicy) {
	return {
		targetKind: relation.targetKind,
		cardinality: relation.cardinality,
		attachEnabled: relation.attachEnabled,
		detachEnabled: relation.detachEnabled,
	};
}

export function StudioAccountConfig({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const configuration = useQuery(
		trpc.revenueAccounts.configuration.queryOptions(),
	);
	const update = useMutation(
		studioMutationOptions<Configuration, ConfigurationInput>(
			trpc.revenueAccounts.updateConfiguration,
			{
				onSuccess: async () => {
					await cache.revenueAccounts();
					toast.success("Conta configuration updated.");
				},
				onError: (error) => toast.error(error.message),
			},
		),
	);

	const config = configuration.data;
	const relations = config?.relationPolicies ?? [];
	const mergePolicy = ((
		config as unknown as
			| {
					mergePolicy?: ConfigurationInput["mergePolicy"];
			  }
			| undefined
	)?.mergePolicy ?? {}) as ConfigurationInput["mergePolicy"];
	const save = (
		nextRelations: ReturnType<typeof relationInput>[],
		enabled = config?.enabled ?? false,
	) =>
		update.mutate({
			enabled,
			relations: nextRelations.length > 0 ? nextRelations : DEFAULT_RELATIONS,
			mergePolicy,
		});

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Conta model</CardTitle>
						<CardDescription>
							Define whether accounts are part of the revenue architecture and
							which objects can be attached.
						</CardDescription>
					</div>
					<StatusIndicator
						tone={config?.enabled ? "success" : "neutral"}
						label={config?.enabled ? "Enabled" : "Disabled"}
						busy={configuration.isLoading}
					/>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
					<p className="max-w-xl text-muted-foreground text-xs">
						When enabled, accounts become a governed aggregation layer for
						contacts, companies and deals. Existing records remain unchanged.
					</p>
					{canManage ? (
						<Button
							type="button"
							variant={config?.enabled ? "outline" : "default"}
							disabled={update.isPending || configuration.isLoading}
							onClick={() =>
								save(relations.map(relationInput), !config?.enabled)
							}
						>
							{config?.enabled ? "Disable Conta" : "Enable Conta"}
						</Button>
					) : null}
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					{TARGETS.map((targetKind) => {
						const relation = relations.find(
							(item) => item.targetKind === targetKind,
						);
						return (
							<div key={targetKind} className="border p-3">
								<div className="mb-3 flex items-center justify-between gap-2">
									<p className="font-medium text-sm">
										{labelForTarget(targetKind)}
									</p>
									<StatusIndicator
										tone={relation ? "success" : "neutral"}
										label={relation ? "Available" : "Not configured"}
									/>
								</div>
								{relation ? (
									<div className="flex flex-col gap-3">
										<Field>
											<FieldLabel>Cardinality</FieldLabel>
											<Select
												value={relation.cardinality}
												disabled={!canManage || update.isPending}
												onValueChange={(cardinality) =>
													save(
														relations.map((item) =>
															item.targetKind === targetKind
																? {
																		...relationInput(item),
																		cardinality:
																			cardinality as (typeof CARDINALITIES)[number],
																	}
																: relationInput(item),
														),
													)
												}
											>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{CARDINALITIES.map((cardinality) => (
														<SelectItem key={cardinality} value={cardinality}>
															{cardinality.replaceAll("_", " ")}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
										<div className="flex flex-wrap gap-4 text-xs">
											<LabelToggle
												label="Attach"
												id={`${targetKind.toLowerCase()}-attach`}
												checked={relation.attachEnabled}
												disabled={!canManage || update.isPending}
												onCheckedChange={(checked) =>
													save(
														relations.map((item) =>
															item.targetKind === targetKind
																? {
																		...relationInput(item),
																		attachEnabled: checked,
																	}
																: relationInput(item),
														),
													)
												}
											/>
											<LabelToggle
												label="Detach"
												id={`${targetKind.toLowerCase()}-detach`}
												checked={relation.detachEnabled}
												disabled={!canManage || update.isPending}
												onCheckedChange={(checked) =>
													save(
														relations.map((item) =>
															item.targetKind === targetKind
																? {
																		...relationInput(item),
																		detachEnabled: checked,
																	}
																: relationInput(item),
														),
													)
												}
											/>
										</div>
									</div>
								) : (
									<p className="text-muted-foreground text-xs">
										Enable this relation to attach{" "}
										{labelForTarget(targetKind).toLowerCase()}.
									</p>
								)}
							</div>
						);
					})}
				</div>
				{!canManage ? (
					<p className="text-muted-foreground text-xs">
						Only a global administrator can change Conta configuration. You can
						still inspect the active policy.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function LabelToggle({
	label,
	id,
	checked,
	disabled,
	onCheckedChange,
}: {
	label: string;
	id: string;
	checked: boolean;
	disabled: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<label
			htmlFor={`account-relation-${id}`}
			className="inline-flex items-center gap-2"
		>
			<Checkbox
				id={`account-relation-${id}`}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onCheckedChange(value === true)}
			/>
			{label}
		</label>
	);
}

export { DEFAULT_RELATIONS, labelForTarget };
