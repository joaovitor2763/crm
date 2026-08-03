"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { relativeTimeFromIso } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import {
	ENRICHMENT_FACET_OPTIONS,
	ENRICHMENT_POLL_MS,
	EnrichmentIndicator,
	isEnriching,
} from "@/components/crm/enrichment-status";
import { OwnerCell } from "@/components/crm/owner-cell";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { companiesSearchParams } from "./companies-search-params";

type CompanyRow = RouterOutputs["companies"]["list"]["rows"][number];

const COLUMNS: DataTableColumn<CompanyRow>[] = [
	{
		id: "name",
		header: "Company",
		sortable: true,
		hideable: false,
		width: "w-[26%]",
		cell: (row) => (
			<span className="flex min-w-0 items-center gap-2.5">
				<EntityLogo
					src={row.iconUrl ?? row.logoUrl}
					darkSrc={row.iconDarkUrl}
					tone={row.iconTone as EntityLogoTone | null | undefined}
					name={row.name}
					size="sm"
				/>
				<span className="truncate font-medium">{row.name}</span>
			</span>
		),
	},
	{
		id: "domain",
		header: "Domain",
		sortable: true,
		width: "w-[16%]",
		hideBelow: "md",
		cell: (row) =>
			row.domain ? (
				<span className="truncate text-muted-foreground">{row.domain}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "industry",
		header: "Industry",
		sortable: true,
		width: "w-[16%]",
		hideBelow: "lg",
		cell: (row) =>
			row.industry ? (
				<span className="truncate">{row.industry}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "owner",
		header: "Owner",
		sortable: true,
		width: "w-[16%]",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "contacts",
		header: "Contacts",
		sortable: true,
		align: "right",
		width: "w-[9%]",
		hideBelow: "lg",
		cell: (row) => <span className="tabular-nums">{row.contactCount}</span>,
	},
	{
		id: "deals",
		header: "Open deals",
		sortable: true,
		align: "right",
		width: "w-[9%]",
		cell: (row) => <span className="tabular-nums">{row.openDealCount}</span>,
	},
	{
		// Hidden by default, but present: it is the table's default sort, and a
		// default you cannot see or return to after sorting by something else is
		// just an unexplained row order.
		id: "createdAt",
		header: "Created",
		label: "Created date",
		sortable: true,
		align: "right",
		width: "w-[10%]",
		defaultHidden: true,
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.createdAt)}
			</span>
		),
	},
	{
		id: "lastActivity",
		header: "Last activity",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "sm",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.lastActivityAt)}
			</span>
		),
	},
	{
		// Off by default: while the agent is working through a backlog every row
		// says the same thing. The facet is the useful way in; this column is for
		// when you are looking at enrichment specifically.
		id: "enrichment",
		header: "Enrichment",
		label: "Enrichment status",
		defaultHidden: true,
		width: "w-[14%]",
		cell: (row) => (
			<EnrichmentIndicator status={row.enrichmentStatus} queued={row.queued} />
		),
	},
];

export function CompaniesTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const { query, input } = useTableQuery(companiesSearchParams);

	const companies = useQuery({
		...trpc.companies.list.queryOptions(input),
		// Keeps the previous page on screen while the next one loads, so paging
		// and typing never blank the table.
		placeholderData: (previous) => previous,
		// A company added here is enriched in the background, and the agent
		// filling in its logo and industry is not a client action anyone can
		// invalidate on. Ask while any row on this page is still working — a new
		// company's logo then lands in the table rather than waiting for a reload.
		refetchInterval: (query) =>
			query.state.data?.rows.some((row) =>
				isEnriching(row.enrichmentStatus, row.queued),
			)
				? ENRICHMENT_POLL_MS
				: false,
	});
	const users = useQuery(trpc.users.list.queryOptions());

	const facetCounts = companies.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Owner",
			options: [
				{ value: "unassigned", label: "Unassigned" },
				...(users.data ?? []).map((user) => ({
					value: user.id,
					label: user.name,
				})),
				// An owner with nothing assigned is a dropdown entry that can only
				// ever produce an empty table.
			].filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "industry",
			label: "Industry",
			// The industries that exist, not a fixed list: they come from the
			// agent, so nobody here gets to decide what the set is.
			options: Object.keys(facetCounts?.industry ?? {})
				.sort()
				.map((value) => ({ value, label: value })),
		},
		{
			id: "enrichment",
			label: "Enrichment",
			options: ENRICHMENT_FACET_OPTIONS.filter(
				(option) => (facetCounts?.enrichment?.[option.value] ?? 0) > 0,
			),
		},
	];

	return (
		<DataTable
			query={query}
			columns={COLUMNS}
			rows={companies.data?.rows ?? []}
			total={companies.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			getRowId={(row) => row.id}
			loading={companies.isFetching}
			searchPlaceholder="Search companies by name or domain…"
			onRowClick={(row) => openRecord({ kind: "company", id: row.id })}
			getRowActionLabel={(row) => `Open ${row.name}`}
			empty="No companies match this view."
		/>
	);
}
