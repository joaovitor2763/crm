"use client";

import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import ArrowsVertical from "@carbon/icons-react/es/ArrowsVertical";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import Column from "@carbon/icons-react/es/Column";
import Filter from "@carbon/icons-react/es/Filter";
import Search from "@carbon/icons-react/es/Search";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { Spinner } from "@crm/ui/components/spinner";
import { SearchCombobox } from "@crm/ui/components/search-combobox";
import { TablePagination } from "@crm/ui/components/table-pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { ROW_ACCENT, ROW_ACCENT_EXPANDABLE } from "@crm/ui/lib/row-accent";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { cn } from "@crm/ui/lib/utils";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
	Fragment,
	type ReactNode,
	useDeferredValue,
	useId,
	useMemo,
	useState,
} from "react";

export type DataTableColumn<TRow> = {
	id: string;
	header: ReactNode;
	cell: (row: TRow) => ReactNode;
	/** Name used in the Sort and Columns menus when `header` is not a string. */
	label?: string;
	sortable?: boolean;
	width?: string;
	align?: "left" | "right" | "center";
	headClassName?: string;
	cellClassName?: string;
	hideable?: boolean;
	defaultHidden?: boolean;
	hideBelow?: "sm" | "md" | "lg";
};

export type DataTableFacet = {
	id: string;
	label: string;
	options: { value: string; label: string }[];
};

export type DataTableTabs = {
	id: string;
	allLabel?: string;
	options: { value: string; label: string }[];
};

export type DataTableExpandable<TRow, TSub> = {
	isExpandable: (row: TRow) => boolean;
	getSubRows: (row: TRow) => TSub[];
	getSubRowId: (sub: TSub, row: TRow) => string;
	renderSubCell: (sub: TSub, columnId: string, row: TRow) => ReactNode;
	onSubRowClick?: (sub: TSub, row: TRow) => void;
};

export type DataTableProps<TRow, TSub> = {
	query: TableQueryState;
	columns: DataTableColumn<TRow>[];
	getRowId: (row: TRow) => string;
	rows: TRow[];
	total: number;
	facetCounts?: Record<string, Record<string, number>>;
	loading?: boolean;
	searchPlaceholder?: string;
	facets?: DataTableFacet[];
	tabs?: DataTableTabs;
	onRowClick?: (row: TRow) => void;
	getRowActionLabel?: (row: TRow) => string;
	expandable?: DataTableExpandable<TRow, TSub>;
	actions?: ReactNode;
	leadingActions?: ReactNode;
	meta?: ReactNode;
	empty?: ReactNode;
	className?: string;
	tableClassName?: string;
};

const HIDE_BELOW_CLASS = {
	sm: "hidden sm:table-cell",
	md: "hidden md:table-cell",
	lg: "hidden lg:table-cell",
} as const;

const ALIGN_CLASS = {
	left: "",
	right: "text-right",
	center: "text-center",
} as const;

function columnLabel<TRow>(column: DataTableColumn<TRow>): string {
	if (column.label) return column.label;
	return typeof column.header === "string" ? column.header : column.id;
}

function SortIndicator({
	active,
	dir,
}: {
	active: boolean;
	dir: "asc" | "desc";
}) {
	return (
		<span className="text-muted-foreground">
			{active ? (
				dir === "asc" ? (
					<ArrowUp size={12} />
				) : (
					<ArrowDown size={12} />
				)
			) : (
				<ArrowsVertical size={12} className="opacity-40" />
			)}
		</span>
	);
}

/**
 * The list view for every module.
 *
 * Everything it renders is driven by `query`, which is URL state — so a filtered,
 * sorted, paged view is a link. Rows arrive already filtered and paged from the
 * API; this component never slices data itself.
 *
 * Two params it owns directly, because they are presentation rather than data:
 * `expand` (which rows are open) and `hide` (which columns are off).
 */
export function DataTable<TRow, TSub = unknown>({
	query,
	columns,
	getRowId,
	rows,
	total,
	facetCounts,
	loading,
	searchPlaceholder = "Search…",
	facets,
	tabs,
	onRowClick,
	getRowActionLabel,
	expandable,
	actions,
	leadingActions,
	meta,
	empty,
	className,
	tableClassName,
}: DataTableProps<TRow, TSub>) {
	const [expandedIds, setExpandedIds] = useQueryState(
		"expand",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
	const defaultHiddenIds = useMemo(
		() => columns.filter((column) => column.defaultHidden).map((c) => c.id),
		[columns],
	);
	const [hidden, setHidden] = useQueryState(
		"hide",
		parseAsArrayOf(parseAsString).withDefault(defaultHiddenIds),
	);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filtersId = useId();

	const hideable = columns.filter((column) => column.hideable !== false);
	const visibleColumns = columns.filter(
		(column) => !hidden.includes(column.id),
	);
	const sortableColumns = columns.filter((column) => column.sortable);

	const tabCounts = tabs ? facetCounts?.[tabs.id] : undefined;
	const activeTabOption =
		query.tab === "all"
			? undefined
			: tabs?.options.find((option) => option.value === query.tab);
	const activeTabLabel = activeTabOption
		? activeTabOption.label
		: (tabs?.allLabel ?? "All");

	// Keeps typing responsive: the input updates immediately, the (expensive)
	// table body re-renders at a lower priority.
	const deferredRows = useDeferredValue(rows);
	const anyExpandable =
		expandable != null &&
		deferredRows.some((row) => expandable.isExpandable(row));
	const colCount = visibleColumns.length + (anyExpandable ? 1 : 0);

	const pageSize = query.pageSize;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const hasFilterControls =
		tabs != null ||
		(facets?.length ?? 0) > 0 ||
		sortableColumns.length > 0 ||
		anyExpandable ||
		hideable.length > 0 ||
		actions != null ||
		leadingActions != null;
	const activeFilterCount =
		(tabs && query.tab !== "all" ? 1 : 0) +
		(facets?.filter((facet) => (query.filters[facet.id] ?? "all") !== "all")
			.length ?? 0);

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
			<div className="flex flex-col gap-3">
				{hasFilterControls && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full justify-between sm:hidden"
						aria-expanded={filtersOpen}
						aria-controls={filtersId}
						onClick={() => setFiltersOpen((open) => !open)}
					>
						<span className="flex items-center gap-2">
							<Filter />
							Filters
							{activeFilterCount > 0 && (
								<span className="tabular-nums opacity-60">
									({activeFilterCount})
								</span>
							)}
						</span>
						<ChevronDown
							className={cn(
								"shrink-0 opacity-60 transition-transform",
								filtersOpen && "rotate-180",
							)}
						/>
					</Button>
				)}
				<div
					id={filtersId}
					className={cn(
						"flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
						filtersOpen ? "flex" : "hidden sm:flex",
					)}
				>
					{tabs && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="w-full justify-between sm:w-auto sm:min-w-44"
								>
									<span className="truncate">{activeTabLabel}</span>
									<ChevronDown className="shrink-0 opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="min-w-52">
								<DropdownMenuRadioGroup
									value={query.tab}
									onValueChange={(value) => query.setTab(value)}
								>
									<DropdownMenuRadioItem value="all">
										<span className="flex-1">{tabs.allLabel ?? "All"}</span>
									</DropdownMenuRadioItem>
									{tabs.options.map((option) => {
										// A tab that can never match anything is noise, but only
										// once we actually know the count.
										if (tabCounts?.[option.value] === 0) return null;
										return (
											<DropdownMenuRadioItem
												key={option.value}
												value={option.value}
											>
												<span className="flex-1">{option.label}</span>
											</DropdownMenuRadioItem>
										);
									})}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{leadingActions}

					<div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center lg:ml-auto">
						{facets?.map((facet) => {
							const selected = query.filters[facet.id] ?? "all";
							const active = facet.options.find((o) => o.value === selected);
							if (facet.options.length > 7) {
								return (
									<SearchCombobox
										key={facet.id}
										value={selected}
										onValueChange={(value) =>
											query.setFilter(facet.id, value)
										}
										options={[
											{ value: "all", label: facet.label },
											...facet.options,
										]}
										placeholder={facet.label}
										searchPlaceholder={`Search ${facet.label.toLowerCase()}…`}
										className="w-full sm:w-auto sm:min-w-40"
									/>
								);
							}
							return (
								<DropdownMenu key={facet.id}>
									<DropdownMenuTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											className="justify-between"
										>
											<span className="truncate">
												{active ? active.label : facet.label}
											</span>
											<ChevronDown
												data-icon="inline-end"
												className="opacity-60"
											/>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="min-w-44">
										<DropdownMenuRadioGroup
											value={selected}
											onValueChange={(value) => query.setFilter(facet.id, value)}
										>
											<DropdownMenuRadioItem value="all">
												{facet.label}
											</DropdownMenuRadioItem>
											{facet.options.map((option) => (
												<DropdownMenuRadioItem
													key={option.value}
													value={option.value}
												>
													{option.label}
												</DropdownMenuRadioItem>
											))}
										</DropdownMenuRadioGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							);
						})}
						{(sortableColumns.length > 0 || anyExpandable) && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="justify-start sm:justify-center"
									>
										<ArrowsVertical data-icon="inline-start" />
										Sort
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuLabel>Sort by</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										value={query.sort}
										onValueChange={query.setSort}
									>
										{anyExpandable && (
											<DropdownMenuRadioItem value="detail">
												Detail
											</DropdownMenuRadioItem>
										)}
										{sortableColumns.map((column) => (
											<DropdownMenuRadioItem key={column.id} value={column.id}>
												{columnLabel(column)}
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
									<DropdownMenuSeparator />
									<DropdownMenuRadioGroup
										value={query.dir}
										onValueChange={(value) =>
											query.setDir(value === "desc" ? "desc" : "asc")
										}
									>
										<DropdownMenuRadioItem value="asc">
											Ascending
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="desc">
											Descending
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{hideable.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="justify-start sm:justify-center"
									>
										<Column data-icon="inline-start" />
										Columns
										<span className="tabular-nums opacity-60">
											({visibleColumns.length})
										</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
									{hideable.map((column) => (
										<DropdownMenuCheckboxItem
											key={column.id}
											checked={!hidden.includes(column.id)}
											onCheckedChange={(checked) =>
												setHidden((prev) => {
													const set = new Set(prev);
													if (checked) set.delete(column.id);
													else set.add(column.id);
													return [...set];
												})
											}
										>
											{columnLabel(column)}
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{actions}
					</div>
				</div>

				<InputGroup>
					<InputGroupAddon>
						<Search />
					</InputGroupAddon>
					<InputGroupInput
						placeholder={searchPlaceholder}
						aria-label={searchPlaceholder}
						value={query.q}
						onChange={(event) => query.setSearch(event.target.value)}
						autoComplete="off"
					/>
				</InputGroup>
			</div>

			<Table
				// Fixed layout so columns honour their widths and long cell text
				// truncates (cells are overflow-hidden) instead of blowing the table
				// out horizontally.
				className={cn(
					"table-fixed [&_td:first-child]:pl-0 [&_th:first-child]:pl-0",
					tableClassName,
				)}
				containerClassName="min-h-0 flex-1 overflow-auto"
			>
				<TableHeader className="sticky top-0 z-10 bg-background [&_th]:bg-background">
					<TableRow>
						{anyExpandable && (
							<TableHead className="h-11 w-10 px-3">
								<span className="sr-only">Detail</span>
							</TableHead>
						)}
						{visibleColumns.map((column) => {
							const isActive = query.sort === column.id;
							return (
								<TableHead
									key={column.id}
									className={cn(
										// overflow-hidden mirrors the body cells so a squeezed
										// header truncates instead of spilling into the next column.
										"h-11 overflow-hidden px-3 font-normal text-muted-foreground",
										column.width,
										ALIGN_CLASS[column.align ?? "left"],
										column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
										column.headClassName,
									)}
									aria-sort={
										isActive
											? query.dir === "asc"
												? "ascending"
												: "descending"
											: undefined
									}
								>
									{column.sortable ? (
										<Button
											variant="ghost"
											size="xs"
											onClick={() => query.toggleSort(column.id)}
											className={cn(
												"-ml-2 font-normal text-muted-foreground hover:text-foreground",
												column.align === "right" && "-mr-2 ml-0 flex-row-reverse",
												column.align === "center" && "mx-auto",
											)}
										>
											{column.header}
											<SortIndicator active={isActive} dir={query.dir} />
										</Button>
									) : (
										column.header
									)}
								</TableHead>
							);
						})}
					</TableRow>
				</TableHeader>
				<TableBody>
					{deferredRows.length === 0 ? (
						<TableRow className="hover:bg-transparent">
							<TableCell
								colSpan={colCount}
								className="h-32 whitespace-normal py-8 text-center align-middle text-muted-foreground"
							>
								{loading ? <Spinner /> : (empty ?? "No results found.")}
							</TableCell>
						</TableRow>
					) : (
						deferredRows.map((row) => {
							const id = getRowId(row);
							const canExpand = expandable?.isExpandable(row) ?? false;
							const isOpen = canExpand && expanded.has(id);
							const clickable = canExpand || !!onRowClick;
							const handleClick = () => {
								if (canExpand) {
									setExpandedIds((prev) => {
										const set = new Set(prev ?? []);
										if (set.has(id)) set.delete(id);
										else set.add(id);
										const next = [...set];
										// Empty array would still write `?expand=`; null clears it.
										return next.length > 0 ? next : null;
									});
								} else {
									onRowClick?.(row);
								}
							};
							return (
								<Fragment key={id}>
									<TableRow
										onClick={clickable ? handleClick : undefined}
										className={cn(
											"group/row",
											clickable
												? anyExpandable
													? ROW_ACCENT_EXPANDABLE
													: ROW_ACCENT
												: undefined,
										)}
									>
										{anyExpandable && (
											<TableCell className="w-10 px-3 py-3 text-center text-muted-foreground">
											{canExpand && (
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={isOpen ? "Collapse row" : "Expand row"}
													aria-expanded={isOpen}
													onClick={(event) => {
														event.stopPropagation();
														handleClick();
													}}
												>
													<ChevronRight
														size={12}
														className={cn(
															"transition-transform",
															isOpen && "rotate-90",
														)}
													/>
												</Button>
											)}
											</TableCell>
										)}
										{visibleColumns.map((column) => (
											<TableCell
												key={column.id}
												className={cn(
													"overflow-hidden px-3 py-3",
													column.width,
													ALIGN_CLASS[column.align ?? "left"],
												column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
												onRowClick &&
													column.id === visibleColumns[0]?.id &&
													"relative pr-9",
												column.cellClassName,
												)}
											>
											{column.cell(row)}
											{onRowClick && column.id === visibleColumns[0]?.id ? (
												<Button
													variant="ghost"
													size="icon-xs"
													className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
													aria-label={getRowActionLabel?.(row) ?? "Open row"}
													onClick={(event) => {
														event.stopPropagation();
														onRowClick(row);
													}}
												>
													<ArrowRight />
												</Button>
											) : null}
											</TableCell>
										))}
									</TableRow>
									{isOpen &&
										expandable?.getSubRows(row).map((sub) => {
											const subClickable = !!expandable.onSubRowClick;
											return (
												<TableRow
													key={expandable.getSubRowId(sub, row)}
													onClick={
														subClickable
															? () => expandable.onSubRowClick?.(sub, row)
															: undefined
													}
													className={cn(
														"bg-muted/30",
														subClickable &&
															(anyExpandable
																? ROW_ACCENT_EXPANDABLE
																: ROW_ACCENT),
													)}
												>
													{anyExpandable && (
														<TableCell className="w-10 px-3 py-2.5" />
													)}
													{visibleColumns.map((column) => (
														<TableCell
															key={column.id}
															className={cn(
																"overflow-hidden px-3 py-2.5 align-top",
																column.width,
																ALIGN_CLASS[column.align ?? "left"],
																column.hideBelow &&
																	HIDE_BELOW_CLASS[column.hideBelow],
																column.cellClassName,
															)}
														>
															{expandable.renderSubCell(sub, column.id, row)}
														</TableCell>
													))}
												</TableRow>
											);
										})}
								</Fragment>
							);
						})
					)}
				</TableBody>
			</Table>

			<TablePagination
				page={query.page}
				totalPages={totalPages}
				pageSize={pageSize}
				total={total}
				onPageChange={(page) => query.setPage(page)}
				loading={loading}
				meta={meta}
			/>
		</div>
	);
}
