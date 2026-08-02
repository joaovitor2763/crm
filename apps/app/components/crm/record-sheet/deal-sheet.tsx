"use client";

import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	formatDay,
	formatMoney,
	relativeTimeFromIso,
} from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { ArchiveRecordButton } from "@/components/crm/archive-record-button";
import {
	InlineDateField,
	InlineField,
	InlineSelectField,
	savingField,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { DealStageMenu } from "@/components/crm/stage-change";
import { StageStepper } from "@/components/crm/stage-stepper";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Deal = RouterOutputs["deals"]["byId"];

const CONTACT_COLUMNS = [
	{ header: "Name", width: "w-[30%]", className: "pl-5" },
	{ header: "Role", width: "w-[20%]" },
	{ header: "Title", width: "w-[25%]" },
	{ header: "Email", width: "w-[25%]" },
];

// For `closedAt`, which is a real instant: the moment somebody marked the deal
// won or lost. A close *date* is a day, and goes through `formatDay`.
const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

export function DealSheet({ dealId }: { dealId: string }) {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const { tab, setTab } = useRecordSheetView("overview");

	const query = useQuery(trpc.deals.byId.queryOptions({ id: dealId }));
	const deal = query.data;
	const company = deal?.company;

	const tabs: DetailSheetTab[] = deal
		? [
				{
					value: "overview",
					label: "Overview",
					content: <DealOverview deal={deal} />,
				},
				{
					value: "contacts",
					label: "Contacts",
					count: deal.contacts.length,
					content: <DealContacts deal={deal} />,
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ dealId: deal.id }} />,
				},
				{
					value: "agent",
					label: "Agent",
					// Bare, not inside `DetailSheetBody`: the panel brings its own
					// scroll container.
					content: <AgentPanel record={{ kind: "deal", id: deal.id }} />,
					// Stays mounted behind the other tabs: this one holds a live
					// stream, and tearing it down mid-answer loses the answer.
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={deal?.name ?? "Deal"}
			// A deal is always somebody's deal, so the company is the subtitle and
			// it opens rather than just naming itself.
			description={
				company ? (
					<button
						type="button"
						onClick={() => openRecord({ kind: "company", id: company.id })}
						className="text-foreground underline-offset-2 hover:underline"
					>
						{company.name}
					</button>
				) : deal ? (
					"Company outside your visibility scope"
				) : undefined
			}
			media={
				deal ? (
					<EntityLogo
						src={company?.iconUrl}
						darkSrc={company?.iconDarkUrl}
						tone={company?.iconTone as EntityLogoTone | null | undefined}
						name={company?.name ?? deal.name}
						size="lg"
					/>
				) : null
			}
			// A deal's stage is the state it is in and the thing you change about
			// it, so it is one control in the header — the same picker the deals
			// table puts in every row — rather than a read-only cell in the stats
			// strip plus a row of buttons further down the panel.
			actions={
				deal ? (
					<>
						<DealStageMenu
							dealId={deal.id}
							stage={deal.stage}
							variant="control"
						/>
						<ArchiveRecordButton
							kind="deal"
							id={deal.id}
							archived={deal.archivedAt !== null}
						/>
					</>
				) : null
			}
			stats={
				deal ? (
					<DetailSheetStats>
						<DetailSheetStat label="Amount">
							{deal.amountCents === null ? (
								<EmptyCellValue />
							) : (
								<span className="tabular-nums">
									{formatMoney(deal.amountCents, deal.currency)}
								</span>
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Expected close">
							{deal.expectedCloseDate ? (
								// The stored day, not the local rendering of a midnight-UTC
								// timestamp — that read a day early west of Greenwich and
								// disagreed with the close-date row further down the sheet.
								formatDay(deal.expectedCloseDate)
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						{/* How long it has sat where it is — the staleness read that
						    used to be a line of small print under the title. */}
						<DetailSheetStat label="In stage">
							{relativeTimeFromIso(deal.stageChangedAt)}
						</DetailSheetStat>
						<DetailSheetStat label="Owner">
							<OwnerCell owner={deal.owner} />
						</DetailSheetStat>
					</DetailSheetStats>
				) : null
			}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function DealOverview({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());
	const companies = useQuery(trpc.companies.options.queryOptions({ q: "" }));

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			// `settle: "record"` — the row's spinner should last until the new value
			// is under it, not until the board behind the sheet and every cached
			// company have caught up too.
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const save = (data: Parameters<typeof update.mutate>[0]["data"]) =>
		update.mutate({ id: deal.id, data });

	const isSaving = savingField(update);

	return (
		<DetailSheetBody>
			{/* Where the deal is, as a picture. Setting the stage — including
			 * closing it — is the control in the header; this is the one-click
			 * nudge to the next step. */}
			<DetailSheetSection title="Stage">
				<StageStepper
					dealId={deal.id}
					pipelineId={deal.pipeline.id}
					stage={deal.stage}
				/>

				{/*
				 * Two properties under the rail rather than an alert of its own.
				 * The rail's last segment already says the deal is lost; a bordered
				 * callout underneath repeats that in a heavier voice, and it was the
				 * only boxed thing in any of the three sheets.
				 */}
				{deal.closedReason ? (
					<DetailSheetProperties>
						<DetailSheetProperty label="Closed">
							{deal.closedAt ? (
								dateFormat.format(new Date(deal.closedAt))
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetProperty>
						<DetailSheetProperty label="Reason" wide>
							{deal.closedReason}
						</DetailSheetProperty>
					</DetailSheetProperties>
				) : null}
			</DetailSheetSection>

			<DetailSheetSection title="Details">
				<DetailSheetProperties>
					<InlineField
						label="Name"
						value={deal.name}
						saving={isSaving("name")}
						onSave={(name) => name && save({ name })}
					/>
					<InlineField
						label="Amount"
						// Edited in whole currency; stored and summed in cents.
						value={
							deal.amountCents === null ? null : String(deal.amountCents / 100)
						}
						placeholder="24000"
						saving={isSaving("amountCents")}
						onSave={(next) => {
							if (next === "") return save({ amountCents: null });
							const parsed = Number.parseFloat(next);
							if (!Number.isFinite(parsed) || parsed < 0) {
								toast.error("Amount has to be a number.");
								return;
							}
							save({ amountCents: Math.round(parsed * 100) });
						}}
						render={(value) =>
							formatMoney(Math.round(Number(value) * 100), deal.currency)
						}
					/>
					<InlineField
						label="Currency"
						value={deal.currency}
						saving={isSaving("currency")}
						onSave={(currency) => {
							if (currency.length !== 3) {
								toast.error("Use a three-letter currency code, like USD.");
								return;
							}
							save({ currency: currency.toUpperCase() });
						}}
					/>
					<InlineDateField
						label="Close date"
						value={deal.expectedCloseDate}
						saving={isSaving("expectedCloseDate")}
						onSave={(next) => save({ expectedCloseDate: next || null })}
					/>
					{deal.company ? (
						<InlineSelectField
							label="Company"
							value={deal.company.id}
							options={(companies.data ?? []).map((company) => ({
								value: company.id,
								label: company.name,
							}))}
							onSave={(companyId) => save({ companyId })}
						/>
					) : (
						<DetailSheetProperty label="Company">
							Restricted
						</DetailSheetProperty>
					)}
					<InlineSelectField
						label="Owner"
						value={deal.owner.id}
						options={(users.data ?? []).map((user) => ({
							value: user.id,
							label: user.name,
						}))}
						onSave={(ownerId) => save({ ownerId })}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>

			<DealProducts deal={deal} />
		</DetailSheetBody>
	);
}

function DealProducts({ deal }: { deal: Deal }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const products = useQuery(
		trpc.products.list.queryOptions({ includeArchived: false }),
	);
	const [productId, setProductId] = useState("");
	const refresh = () => cache.deal(deal.id, { settle: "record" });
	const add = useMutation(
		trpc.deals.addLineItem.mutationOptions({
			onSuccess: async () => {
				setProductId("");
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.deals.updateLineItem.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		trpc.deals.removeLineItem.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<DetailSheetSection title="Products">
			<div className="flex flex-col gap-2">
				{deal.lineItems.map((item) => (
					<form
						key={item.id}
						className="grid grid-cols-[1fr_5rem_auto] items-center gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							const quantity = Number.parseInt(
								String(new FormData(event.currentTarget).get("quantity")),
								10,
							);
							if (quantity > 0) update.mutate({ id: item.id, quantity });
						}}
					>
						<div>
							<p className="font-medium">{item.name}</p>
							<p className="text-muted-foreground text-xs">
								{item.sku} · {formatMoney(item.unitPriceCents, item.currency)}
							</p>
						</div>
						<Input
							name="quantity"
							type="number"
							min={1}
							defaultValue={item.quantity}
							aria-label="Quantity"
						/>
						<div className="flex gap-2">
							<Button type="submit" variant="outline" size="sm">
								Save
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => remove.mutate({ id: item.id })}
							>
								Remove
							</Button>
						</div>
					</form>
				))}
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (productId)
							add.mutate({ dealId: deal.id, productId, quantity: 1 });
					}}
				>
					<Select value={productId} onValueChange={setProductId}>
						<SelectTrigger className="flex-1">
							<SelectValue placeholder="Add product" />
						</SelectTrigger>
						<SelectContent>
							{(products.data ?? []).map((product) => (
								<SelectItem key={product.id} value={product.id}>
									{product.name} · {product.sku}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="submit"
						variant="outline"
						disabled={!productId || add.isPending}
					>
						Add
					</Button>
				</form>
			</div>
		</DetailSheetSection>
	);
}

function DealContacts({ deal }: { deal: Deal }) {
	const openRecord = useOpenRecord();

	if (deal.contacts.length === 0) {
		return (
			<DetailSheetEmpty
				icon={UserMultiple}
				title="No contacts on this deal"
				description={
					deal.company
						? `Nobody from ${deal.company.name} is attached yet. Add people to the company, then bring them onto the deal.`
						: "No visible contacts are attached to this deal."
				}
			/>
		);
	}

	return (
		<SimpleTable variant="panel" columns={CONTACT_COLUMNS}>
			{deal.contacts.map((contact) => (
				<SimpleTableRow
					key={contact.id}
					clickable
					onClick={() => openRecord({ kind: "contact", id: contact.id })}
				>
					<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
						{[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5">
						{contact.role ?? <EmptyCellValue />}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
						{contact.title ?? <EmptyCellValue />}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
						{contact.email ?? <EmptyCellValue />}
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
