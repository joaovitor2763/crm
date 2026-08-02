"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { DatePicker } from "@crm/ui/components/date-picker";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const UNSET = "";

export function CreateDealSheet({
	/** Pre-selects a company when opened from that company's page. */
	companyId,
}: {
	companyId?: string;
}) {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();

	// URL state, like every other view state here — see CreateCompanySheet.
	const [open, setOpen] = useQueryState(
		"new",
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");
	const [company, setCompany] = useState(companyId ?? UNSET);
	const [ownerId, setOwnerId] = useState(UNSET);
	const [pipelineId, setPipelineId] = useState(UNSET);
	const [stageId, setStageId] = useState(UNSET);
	const [amount, setAmount] = useState("");
	const [closeDate, setCloseDate] = useState("");

	const nameId = useId();
	const amountId = useId();
	const closeDateId = useId();

	const users = useQuery(trpc.users.list.queryOptions());
	const companies = useQuery(trpc.companies.options.queryOptions({ q: "" }));
	const me = useQuery(trpc.users.me.queryOptions());
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);

	// Whoever is adding the deal is almost always the one working it.
	const resolvedOwner = ownerId || me.data?.id || UNSET;
	const resolvedPipeline =
		pipelines.data?.find((pipeline) => pipeline.id === pipelineId) ??
		pipelines.data?.find((pipeline) => pipeline.isDefault) ??
		pipelines.data?.[0];
	const openStages =
		resolvedPipeline?.stages.filter((stage) => stage.type === "OPEN") ?? [];
	const resolvedStage =
		openStages.find((stage) => stage.id === stageId) ?? openStages[0];

	const create = useMutation(
		trpc.deals.create.mutationOptions({
			onSuccess: async (deal) => {
				await cache.deal(deal.id);
				toast.success(`${deal.name} added.`);
				await setOpen(null);
				setName("");
				setAmount("");
				setCloseDate("");
				openRecord({ kind: "deal", id: deal.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const ready =
		name.trim() !== "" &&
		company !== UNSET &&
		resolvedOwner !== UNSET &&
		Boolean(resolvedPipeline && resolvedStage);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Icon icon={Add} data-icon="inline-start" />
					New deal
				</Button>
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New deal</SheetTitle>
					<SheetDescription>
						Every deal belongs to a company and has someone's name against it.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-deal"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						const parsed = Number.parseFloat(amount);
						create.mutate({
							name,
							companyId: company,
							ownerId: resolvedOwner,
							pipelineId: resolvedPipeline?.id,
							stageId: resolvedStage?.id,
							// Typed in whole currency, stored and summed in cents.
							amountCents: Number.isFinite(parsed)
								? Math.round(parsed * 100)
								: null,
							expectedCloseDate: closeDate || null,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>Name</FieldLabel>
							<Input
								id={nameId}
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Stripe — Comp AI"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-company">Company</FieldLabel>
							<Select value={company} onValueChange={setCompany}>
								<SelectTrigger id="create-deal-company">
									<SelectValue placeholder="Choose a company" />
								</SelectTrigger>
								<SelectContent>
									{(companies.data ?? []).map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-owner">Owner</FieldLabel>
							<Select value={resolvedOwner} onValueChange={setOwnerId}>
								<SelectTrigger id="create-deal-owner">
									<SelectValue placeholder="Choose an owner" />
								</SelectTrigger>
								<SelectContent>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-pipeline">Pipeline</FieldLabel>
							<Select
								value={resolvedPipeline?.id ?? UNSET}
								onValueChange={(value) => {
									setPipelineId(value);
									setStageId(UNSET);
								}}
							>
								<SelectTrigger id="create-deal-pipeline">
									<SelectValue placeholder="Choose a pipeline" />
								</SelectTrigger>
								<SelectContent>
									{(pipelines.data ?? []).map((pipeline) => (
										<SelectItem key={pipeline.id} value={pipeline.id}>
											{pipeline.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-deal-stage">Stage</FieldLabel>
							<Select
								value={resolvedStage?.id ?? UNSET}
								onValueChange={setStageId}
							>
								<SelectTrigger id="create-deal-stage">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{openStages.map((stage) => (
										<SelectItem key={stage.id} value={stage.id}>
											{stage.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>
								A new deal is an open deal — close it from the pipeline once
								there is an outcome to record.
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={amountId}>Amount (USD)</FieldLabel>
							<Input
								id={amountId}
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								placeholder="24000"
								inputMode="decimal"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={closeDateId}>Expected close date</FieldLabel>
							<DatePicker
								id={closeDateId}
								value={closeDate}
								onChange={setCloseDate}
								placeholder="No date yet"
							/>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-deal"
						disabled={create.isPending || !ready}
					>
						{create.isPending ? <Spinner /> : null}
						Add deal
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
