"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { DateRangePicker } from "@crm/ui/components/date-range-picker";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { formatMoney, relativeTimeFromIso } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { CLOSING_OPTIONS } from "@/components/crm/closing-window";
import { CompanyCell } from "@/components/crm/company-cell";
import { OwnerCell } from "@/components/crm/owner-cell";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { DealStageMenu } from "@/components/crm/stage-change";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { dealsSearchParams } from "./deals-search-params";

type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

const dateFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

const COLUMNS: DataTableColumn<DealRow>[] = [
	{
		id: "name",
		header: "Deal",
		sortable: true,
		hideable: false,
		width: "w-[24%]",
		cell: (row) => <span className="truncate font-medium">{row.name}</span>,
	},
	{
		id: "company",
		header: "Company",
		sortable: true,
		width: "w-[18%]",
		cell: (row) => <CompanyCell company={row.company} />,
	},
	{
		id: "stage",
		header: "Stage",
		sortable: true,
		width: "w-[18%]",
		// Editable in place: moving a deal along is the single most common thing
		// anyone does here, and it should not need a page load.
		cell: (row) => <DealStageMenu dealId={row.id} stage={row.stage} />,
	},
	{
		id: "amount",
		header: "Amount",
		sortable: true,
		align: "right",
		width: "w-[12%]",
		hideBelow: "sm",
		cell: (row) =>
			row.amountCents === null ? (
				<EmptyCellValue />
			) : (
				<span className="tabular-nums">
					{formatMoney(row.amountCents, row.currency)}
				</span>
			),
	},
	{
		id: "owner",
		header: "Owner",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "md",
		cell: (row) => <OwnerCell owner={row.owner} />,
	},
	{
		id: "expectedCloseDate",
		header: "Close date",
		sortable: true,
		width: "w-[12%]",
		hideBelow: "lg",
		cell: (row) =>
			row.expectedCloseDate ? (
				<span className="text-muted-foreground">
					{dateFormat.format(new Date(row.expectedCloseDate))}
				</span>
			) : (
				<EmptyCellValue />
			),
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
		hideBelow: "lg",
		cell: (row) => (
			<span className="text-muted-foreground" suppressHydrationWarning>
				{relativeTimeFromIso(row.lastActivityAt)}
			</span>
		),
	},
];

export function DealsTable() {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const { query, input } = useTableQuery(dealsSearchParams);

	const deals = useQuery({
		...trpc.deals.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const users = useQuery(trpc.users.list.queryOptions());
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);

	const facetCounts = deals.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "owner",
			label: "Owner",
			options: (users.data ?? [])
				.map((user) => ({ value: user.id, label: user.name }))
				.filter((option) => (facetCounts?.owner?.[option.value] ?? 0) > 0),
		},
		{
			id: "pipeline",
			label: "Pipeline",
			options: (pipelines.data ?? [])
				.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))
				.filter((option) => (facetCounts?.pipeline?.[option.value] ?? 0) > 0),
		},
		{
			id: "stage",
			label: "Stage",
			options: (pipelines.data ?? [])
				.flatMap((pipeline) => pipeline.stages)
				.map((stage) => ({ value: stage.id, label: stage.name }))
				.filter((option) => (facetCounts?.stage?.[option.value] ?? 0) > 0),
		},
		{
			id: "closing",
			label: "Closing",
			options: CLOSING_OPTIONS.filter(
				(option) => (facetCounts?.closing?.[option.value] ?? 0) > 0,
			).map((option) => ({ value: option.value, label: option.label })),
		},
	];

	const openValueCents = deals.data?.openValueCents;

	return (
		<DataTable
			query={query}
			columns={COLUMNS}
			rows={deals.data?.rows ?? []}
			total={deals.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			leadingActions={
				<label
					htmlFor="deal-close-window"
					className="grid w-full min-w-0 gap-1 text-muted-foreground text-xs sm:w-auto sm:min-w-56"
				>
					Close date
					<DateRangePicker
						id="deal-close-window"
						value={{
							from: input.closeFrom === "all" ? "" : input.closeFrom,
							to: input.closeTo === "all" ? "" : input.closeTo,
						}}
						onChange={(next) => {
							query.setFilter("closeFrom", next.from || "all");
							query.setFilter("closeTo", next.to || "all");
						}}
						className="text-foreground"
					/>
				</label>
			}
			tabs={{
				id: "status",
				allLabel: "All deals",
				options: [
					{ value: "open", label: "Open" },
					{ value: "closed", label: "Closed" },
				],
			}}
			getRowId={(row) => row.id}
			loading={deals.isFetching}
			searchPlaceholder="Search deals by name or company…"
			onRowClick={(row) => openRecord({ kind: "deal", id: row.id })}
			getRowActionLabel={(row) => `Open ${row.name}`}
			empty="No deals match this view."
			meta={
				// The open pipeline for everything the filters match, not just the
				// page — summed in Postgres.
				openValueCents === null || openValueCents === undefined ? undefined : (
					<span>
						{deals.data?.total ?? 0} deals ·{" "}
						<span className="tabular-nums">{formatMoney(openValueCents)}</span>{" "}
						open pipeline
					</span>
				)
			}
		/>
	);
}
