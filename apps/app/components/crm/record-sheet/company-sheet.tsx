"use client";

import Add from "@carbon/icons-react/es/Add";
import Partnership from "@carbon/icons-react/es/Partnership";
import Star from "@carbon/icons-react/es/Star";
import StarFilled from "@carbon/icons-react/es/StarFilled";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { ArchiveRecordButton } from "@/components/crm/archive-record-button";
import { EnrichmentActions } from "@/components/crm/enrichment-actions";
import {
	ENRICHMENT_POLL_MS,
	EnrichmentIndicator,
	isEnriching,
} from "@/components/crm/enrichment-status";
import {
	InlineField,
	InlineSelectField,
	savingField,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { CompanySocials, hasCompanyLinks } from "@/components/crm/social-links";
import { DealStageMenu } from "@/components/crm/stage-change";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetProperties,
	DetailSheetProse,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { QuickAddContact, QuickAddDeal } from "./quick-add";
import {
	DealAmount,
	DomainLink,
	MetaLine,
	RecordSheetFrame,
} from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Company = RouterOutputs["companies"]["byId"];
type CompanyDeal = Company["deals"][number];

const UNASSIGNED = "unassigned";

const CONTACT_COLUMNS = [
	{ srLabel: "Primary", width: "w-10", className: "pl-5" },
	{ header: "Name", width: "w-[28%]" },
	{ header: "Title", width: "w-[24%]" },
	{ header: "Email", width: "w-[26%]" },
	{ header: "Owner", width: "w-[22%]" },
];

const DEAL_COLUMNS = [
	{ header: "Deal", width: "w-[32%]", className: "pl-5" },
	{ header: "Stage", width: "w-[24%]" },
	{ header: "Amount", width: "w-[16%]", align: "right" as const },
	{ header: "Close date", width: "w-[14%]" },
	{ header: "Owner", width: "w-[14%]" },
];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

/** The soonest a deal here could land, which is the number reps forecast on. */
function nextClose(deals: CompanyDeal[]): string | null {
	const dates = deals
		.map((deal) => deal.expectedCloseDate)
		.filter((date): date is string => date !== null)
		.sort();
	return dates[0] ?? null;
}

/**
 * The last row of a list: "add another one".
 *
 * Part of the table rather than a button floating above it, so the affordance
 * is where you finish reading and does not need its own band of chrome.
 */
function AddRow({
	label,
	columns,
	onClick,
}: {
	label: string;
	columns: number;
	onClick: () => void;
}) {
	return (
		<SimpleTableRow>
			<TableCell colSpan={columns} className="p-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={onClick}
					className="h-9 w-full justify-start px-5 font-normal text-muted-foreground"
				>
					<Icon icon={Add} data-icon="inline-start" />
					{label}
				</Button>
			</TableCell>
		</SimpleTableRow>
	);
}

/**
 * A company, everything attached to it, and the agent's work on it.
 *
 * Polls while the agent is running: enrichment is a background write with no
 * client action behind it, so there is nothing to invalidate — the only way to
 * notice it finished is to ask. The interval stops the moment it settles.
 */
export function CompanySheet({ companyId }: { companyId: string }) {
	const trpc = useTRPC();
	// Tab and quick-add form both live in `?tab=` / `?add=`, so a half-typed
	// contact survives a refresh and lands on the panel it was typed into.
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("overview");

	const query = useQuery({
		...trpc.companies.byId.queryOptions({ id: companyId }),
		refetchInterval: (current) => {
			const record = current.state.data;
			return record && isEnriching(record.enrichmentStatus, record.queued)
				? ENRICHMENT_POLL_MS
				: false;
		},
	});

	const company = query.data;

	const location = company
		? [company.city, company.stateCode, company.country]
				.filter(Boolean)
				.join(", ")
		: null;

	const openDeals =
		company?.deals.filter((deal) => deal.stage.type === "OPEN") ?? [];
	const openValueCents = openDeals.reduce(
		(total, deal) => total + (deal.amountCents ?? 0),
		0,
	);
	const closing = nextClose(openDeals);

	const tabs: DetailSheetTab[] = company
		? [
				{
					value: "overview",
					label: "Overview",
					content: <CompanyOverview company={company} />,
				},
				{
					value: "contacts",
					label: "Contacts",
					count: company.contacts.length,
					content: (
						<CompanyContacts
							company={company}
							adding={adding === "contact"}
							onAdd={() => setAdding("contact")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "deals",
					label: "Deals",
					count: company.deals.length,
					content: (
						<CompanyDeals
							company={company}
							adding={adding === "deal"}
							onAdd={() => setAdding("deal")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ companyId: company.id }} />,
				},
				{
					value: "agent",
					label: "Agent",
					// Bare, not inside `DetailSheetBody`: the panel brings its own
					// scroll container, and nesting two gives the sheet two
					// scrollbars.
					content: <AgentPanel record={{ kind: "company", id: company.id }} />,
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
			title={company?.name ?? "Company"}
			description={
				company ? (
					<MetaLine
						lead={
							<DomainLink domain={company.domain} website={company.website} />
						}
						parts={[location, company.industry]}
					/>
				) : undefined
			}
			// Only when there is something to say. "Enriched" is the resting state
			// of every company in here, and a row that says so on all of them is a
			// row nobody reads — which means nobody reads it when it says "failed"
			// either.
			note={
				company && company.enrichmentStatus !== "COMPLETE" ? (
					<EnrichmentIndicator
						status={company.enrichmentStatus}
						queued={company.queued}
						title={company.enrichmentError}
					/>
				) : null
			}
			media={
				<EntityLogo
					src={company?.iconUrl ?? company?.logoUrl}
					darkSrc={company?.iconDarkUrl}
					tone={company?.iconTone as EntityLogoTone | null | undefined}
					name={company?.name ?? "?"}
					size="lg"
				/>
			}
			actions={
				company ? (
					<>
						<EnrichmentActions
							companyId={company.id}
							hasDomain={company.domain !== null}
						/>
						<ArchiveRecordButton
							kind="company"
							id={company.id}
							archived={company.archivedAt !== null}
						/>
					</>
				) : null
			}
			stats={
				company ? (
					<DetailSheetStats>
						<DetailSheetStat label="Open pipeline">
							<span className="tabular-nums">
								{formatMoney(openValueCents)}
							</span>
						</DetailSheetStat>
						<DetailSheetStat label="Open deals">
							<span className="tabular-nums">{openDeals.length}</span>
						</DetailSheetStat>
						<DetailSheetStat label="Next close">
							{closing ? (
								shortDateFormat.format(new Date(closing))
							) : (
								<EmptyCellValue />
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Owner">
							<OwnerCell owner={company.owner} />
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

function CompanyOverview({ company }: { company: Company }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const update = useMutation(
		trpc.companies.update.mutationOptions({
			// `settle: "record"` — the row's spinner should last until the new value
			// is under it, not until the table behind the sheet has caught up too.
			onSuccess: () => cache.company(company.id, { settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const save = (data: Record<string, string | null>) =>
		update.mutate({ id: company.id, data });

	const isSaving = savingField(update);

	return (
		<DetailSheetBody>
			{/*
			 * Only the fields a rep would correct by hand are editable: the brand,
			 * industry and socials come from the agent, and a text box inviting
			 * someone to retype them is a text box inviting someone to fight it.
			 */}
			<DetailSheetSection title="Details">
				<DetailSheetProperties>
					<InlineField
						label="Name"
						value={company.name}
						saving={isSaving("name")}
						onSave={(name) => name && save({ name })}
					/>
					<InlineField
						label="Domain"
						value={company.domain}
						type="url"
						placeholder="stripe.com"
						saving={isSaving("domain")}
						onSave={(domain) => save({ domain })}
					/>
					<InlineField
						label="Website"
						value={company.website}
						type="url"
						placeholder="https://stripe.com"
						saving={isSaving("website")}
						onSave={(website) => save({ website })}
					/>
					<InlineField
						label="Phone"
						value={company.phone}
						type="tel"
						saving={isSaving("phone")}
						onSave={(phone) => save({ phone })}
					/>
					<InlineField
						label="Email"
						value={company.email}
						type="email"
						saving={isSaving("email")}
						onSave={(email) => save({ email })}
					/>
					<InlineField
						label="City"
						value={company.city}
						saving={isSaving("city")}
						onSave={(city) => save({ city })}
					/>
					<InlineField
						label="Country"
						value={company.country}
						saving={isSaving("country")}
						onSave={(country) => save({ country })}
					/>
					<InlineSelectField
						label="Owner"
						value={company.owner?.id ?? UNASSIGNED}
						options={[
							{ value: UNASSIGNED, label: "Unassigned" },
							...(users.data ?? []).map((user) => ({
								value: user.id,
								label: user.name,
							})),
						]}
						onSave={(ownerId) =>
							save({ ownerId: ownerId === UNASSIGNED ? null : ownerId })
						}
					/>
				</DetailSheetProperties>
			</DetailSheetSection>

			{company.description ? (
				<DetailSheetSection title="About">
					<DetailSheetProse>{company.description}</DetailSheetProse>
				</DetailSheetSection>
			) : null}

			{hasCompanyLinks(company) ? (
				<DetailSheetSection title="Links">
					<CompanySocials company={company} />
				</DetailSheetSection>
			) : null}
		</DetailSheetBody>
	);
}

function CompanyContacts({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const setPrimary = useMutation(
		trpc.companies.setPrimaryContact.mutationOptions({
			onSuccess: () => cache.company(company.id),
			onError: (error) => toast.error(error.message),
		}),
	);

	const form = adding ? (
		<QuickAddContact
			companyId={company.id}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UserMultiple}
						title="No contacts yet"
						description={`Everyone you talk to at ${company.name} lives here — add the first person and their calls, emails and notes hang off them.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								Add contact
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable variant="panel" columns={CONTACT_COLUMNS}>
				{company.contacts.map((contact) => {
					const isPrimary = contact.id === company.primaryContactId;
					return (
						<SimpleTableRow
							key={contact.id}
							clickable
							onClick={() => openRecord({ kind: "contact", id: contact.id })}
						>
							<TableCell className="w-10 py-2.5 pl-5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-xs"
											aria-pressed={isPrimary}
											disabled={isPrimary || setPrimary.isPending}
											// Without this the row's own handler fires too and opens
											// the contact over the change just made.
											onClick={(event) => {
												event.stopPropagation();
												setPrimary.mutate({
													companyId: company.id,
													contactId: contact.id,
												});
											}}
										>
											<Icon icon={isPrimary ? StarFilled : Star} />
											<span className="sr-only">
												{isPrimary ? "Primary contact" : "Make primary"}
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{isPrimary ? "Primary contact" : "Make primary"}
									</TooltipContent>
								</Tooltip>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 font-medium">
								{[contact.firstName, contact.lastName]
									.filter(Boolean)
									.join(" ")}
							</TableCell>
							<TableCell className="truncate px-3 py-2.5">
								{contact.title ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
								{contact.email ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="px-3 py-2.5">
								<OwnerCell owner={contact.owner} />
							</TableCell>
						</SimpleTableRow>
					);
				})}

				<AddRow
					label="Add contact"
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}

function CompanyDeals({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const openRecord = useOpenRecord();

	const form = adding ? (
		<QuickAddDeal
			companyId={company.id}
			companyName={company.name}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.deals.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={Partnership}
						title="No deals yet"
						description={`Nothing is being sold to ${company.name} right now. Open one and it joins the pipeline and the forecast.`}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								New deal
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable variant="panel" columns={DEAL_COLUMNS}>
				{company.deals.map((deal) => (
					<SimpleTableRow
						key={deal.id}
						clickable
						onClick={() => openRecord({ kind: "deal", id: deal.id })}
					>
						<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
							{deal.name}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<DealStageMenu dealId={deal.id} stage={deal.stage} />
						</TableCell>
						<TableCell className="px-3 py-2.5 text-right">
							<DealAmount
								amountCents={deal.amountCents}
								currency={deal.currency}
							/>
						</TableCell>
						<TableCell className="px-3 py-2.5 text-muted-foreground">
							{deal.expectedCloseDate ? (
								dateFormat.format(new Date(deal.expectedCloseDate))
							) : (
								<EmptyCellValue />
							)}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<OwnerCell owner={deal.owner} />
						</TableCell>
					</SimpleTableRow>
				))}

				<AddRow
					label="New deal"
					columns={DEAL_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}
