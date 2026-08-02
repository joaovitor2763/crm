"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	type DealStage,
	DealStageIndicator,
	isLosingStage,
} from "./deal-stage";

export const closeReasonParams = {
	closing: parseAsString,
	closingStage: parseAsString,
};

function useStageMutation(onDone?: () => void) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	return useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.deal(variables.id);
				onDone?.();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

export function DealStageMenu({
	dealId,
	stage,
	variant = "inline",
}: {
	dealId: string;
	stage: DealStage;
	variant?: "inline" | "control" | "icon";
}) {
	const trpc = useTRPC();
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const setStage = useStageMutation();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				{variant === "icon" ? (
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={setStage.isPending}
						aria-label={`Move deal from ${stage.name}`}
						onClick={(event) => event.stopPropagation()}
					>
						<Icon icon={ChevronDown} />
					</Button>
				) : variant === "control" ? (
					<Button
						variant="outline"
						size="sm"
						disabled={setStage.isPending}
						onClick={(event) => event.stopPropagation()}
					>
						<DealStageIndicator stage={stage} className="text-foreground" />
						<Icon icon={ChevronDown} className="text-muted-foreground" />
					</Button>
				) : (
					<button
						type="button"
						onClick={(event) => event.stopPropagation()}
						disabled={setStage.isPending}
						className="flex min-w-0 items-center text-left hover:text-foreground disabled:opacity-50"
					>
						<DealStageIndicator stage={stage} />
					</button>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={variant === "inline" ? "start" : "end"}
				className="min-w-56"
				onClick={(event) => event.stopPropagation()}
			>
				<DropdownMenuRadioGroup
					value={stage.id}
					onValueChange={(stageId) => {
						if (stageId === stage.id) return;
						const chosen = pipelines.data
							?.flatMap((pipeline) => pipeline.stages)
							.find((option) => option.id === stageId);
						if (!chosen) return;
						if (isLosingStage(chosen)) {
							void setCloseParams({ closing: dealId, closingStage: chosen.id });
							return;
						}
						setStage.mutate({ id: dealId, stageId });
					}}
				>
					{(pipelines.data ?? []).map((pipeline, index) => (
						<DropdownMenuGroup key={pipeline.id}>
							{index > 0 ? <DropdownMenuSeparator /> : null}
							<DropdownMenuLabel>{pipeline.name}</DropdownMenuLabel>
							{pipeline.stages.map((option) => (
								<DropdownMenuRadioItem key={option.id} value={option.id}>
									{option.name}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuGroup>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CloseReasonDialog() {
	const reasonId = useId();
	const trpc = useTRPC();
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const [{ closing, closingStage }, setCloseParams] =
		useQueryStates(closeReasonParams);
	const [reason, setReason] = useState("");
	const stage = pipelines.data
		?.flatMap((pipeline) => pipeline.stages)
		.find((option) => option.id === closingStage);
	const close = () => {
		setReason("");
		void setCloseParams({ closing: null, closingStage: null });
	};
	const setStage = useStageMutation(() => {
		toast.success("Deal closed.");
		close();
	});

	return (
		<Dialog
			open={Boolean(closing && closingStage)}
			onOpenChange={(next) => !next && close()}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{stage?.type === "LOST" ? "Close as lost" : "Mark as unqualified"}
					</DialogTitle>
					<DialogDescription>
						Record the reason on the timeline so the same outcome is not
						repeated.
					</DialogDescription>
				</DialogHeader>
				<form
					id="close-reason"
					className="px-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!closing || !closingStage) return;
						setStage.mutate({
							id: closing,
							stageId: closingStage,
							closedReason: reason,
						});
					}}
				>
					<Field>
						<FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
						<Textarea
							id={reasonId}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Went with an incumbent vendor"
							rows={3}
						/>
					</Field>
				</form>
				<DialogFooter>
					<Button
						type="submit"
						form="close-reason"
						disabled={setStage.isPending || reason.trim() === ""}
					>
						{setStage.isPending ? <Spinner /> : null}
						Save
					</Button>
					<Button variant="outline" onClick={close}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
