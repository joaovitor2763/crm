"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Email from "@carbon/icons-react/es/Email";
import Events from "@carbon/icons-react/es/Events";
import Task from "@carbon/icons-react/es/Task";
import Time from "@carbon/icons-react/es/Time";
import { Button } from "@crm/ui/components/button";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { cn } from "@crm/ui/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { DetailSheetEmpty, SECTION_TITLE } from "@/components/detail-sheet";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityComposer } from "./activity-composer";
import { TimelineEntry, type TimelineEntryData } from "./timeline-entry";
import {
	historyFilter,
	TIMELINE_PARAM,
	TIMELINE_TABS,
	type TimelineTab,
	timelineTabParser,
} from "./timeline-search-params";

/** Exactly one of these — a timeline is always about one record. */
export type TimelineAnchor =
	| { companyId: string }
	| { contactId: string }
	| { dealId: string };

const TAB_LABELS: Record<TimelineTab, string> = {
	all: "All",
	notes: "Notes",
	email: "Email",
	meetings: "Meetings",
	upcoming: "Upcoming",
	done: "Done",
};

/**
 * What an empty filter means, said properly.
 *
 * One line of grey text reading "Nothing here yet" was the only empty state in
 * a record sheet that was not `DetailSheetEmpty` — and it said the same thing
 * on all six filters, so "this record has no history" and "this record has no
 * *email*" were indistinguishable.
 */
const EMPTY_STATES: Record<
	TimelineTab,
	{ title: string; description: string }
> = {
	all: {
		title: "Nothing has happened yet",
		description:
			"Calls, notes, emails and meetings all land here. Log the first one above, or wait for Gmail and Calendar to sync.",
	},
	notes: {
		title: "No notes",
		description:
			"Notes are what you write down for the next person to read — what they care about, who else is involved, what you promised.",
	},
	email: {
		title: "No email",
		description:
			"Threads appear here as they are synced from Gmail. Nothing from before this mailbox was connected is imported.",
	},
	meetings: {
		title: "No meetings",
		description:
			"Calendar events with someone from this record on them show up here, past and upcoming.",
	},
	upcoming: {
		title: "Nothing outstanding",
		description:
			"Tasks you have not finished appear here, and at the top of the All tab until they are done.",
	},
	done: {
		title: "Nothing finished yet",
		description: "Tasks move here once you tick them off.",
	},
};

const EMPTY_ICONS: Record<TimelineTab, CarbonIcon> = {
	all: Time,
	notes: Chat,
	email: Email,
	meetings: Events,
	upcoming: Task,
	done: Checkmark,
};

// Abbreviated, because these are eyebrows like every other heading in a record
// sheet — and "WEDNESDAY, SEPTEMBER 16, 2026" set in uppercase is a banner.
const dayFormat = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
});

/**
 * "Today" and "Yesterday" by name, everything else by date.
 *
 * Most of what a rep reads on a timeline happened in the last two days, and
 * "SAT, AUG 1, 2026" makes them work out that today is Saturday to learn that
 * this happened an hour ago.
 */
function dayLabel(at: Date): string {
	const midnight = (date: Date) =>
		new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

	const days = Math.round(
		(midnight(new Date()) - midnight(at)) / (1000 * 60 * 60 * 24),
	);

	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	return dayFormat.format(at);
}

/**
 * Entries under one heading per day, in the order they arrive.
 *
 * Keyed by a map rather than by comparing against the previous entry: run-length
 * grouping silently depends on the list being sorted by the very field it groups
 * on, and the moment that stops being true it emits the same day twice — which
 * React sees as duplicate keys. The API does order by `occurredAt`, so runs
 * *are* contiguous; this just refuses to be the thing that breaks if that ever
 * changes.
 */
function byDay(entries: TimelineEntryData[]) {
	const groups = new Map<
		string,
		{ day: string; label: string; entries: TimelineEntryData[] }
	>();

	for (const entry of entries) {
		const at = new Date(entry.occurredAt ?? entry.createdAt);
		const day = at.toDateString();

		const group = groups.get(day);
		if (group) {
			group.entries.push(entry);
		} else {
			groups.set(day, { day, label: dayLabel(at), entries: [entry] });
		}
	}

	return [...groups.values()];
}

/**
 * One day's entries under a heading that stays put.
 *
 * Sticky, because the heading is the only thing that says *when* — the entries
 * under it carry a clock time and nothing else, so scrolling a year of history
 * with the date scrolled off the top leaves "2:41 PM" meaning nothing. It needs
 * the panel's own surface behind it or the rows show through as they pass.
 */
function TimelineDay({
	label,
	entries,
	anchor,
}: {
	label: string;
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
}) {
	return (
		<section>
			<h3 className={cn("sticky top-0 z-10 bg-popover py-2", SECTION_TITLE)}>
				{label}
			</h3>
			<ul className="divide-y">
				{entries.map((entry) => (
					<TimelineEntry key={entry.id} entry={entry} anchor={anchor} />
				))}
			</ul>
		</section>
	);
}

/**
 * Everything that has happened to a record, and the box for adding to it.
 *
 * Built as a panel that fills its tab: the composer stays put at the top,
 * where a rep can log the call they just finished without scrolling past a
 * year of history to reach it.
 *
 * A company's timeline picks up its deals' and contacts' entries for free —
 * the API stamps `companyId` on every activity it can resolve one for, so this
 * is one indexed range scan rather than three joins.
 */
export function Timeline({ anchor }: { anchor: TimelineAnchor }) {
	const trpc = useTRPC();

	const [tab, setTab] = useQueryState(TIMELINE_PARAM, timelineTabParser);

	const counts = useQuery(trpc.activities.timelineCounts.queryOptions(anchor));

	// On the "All" tab, outstanding tasks are pinned above the history and the
	// history excludes them, so nothing appears twice.
	const pinned = useQuery({
		...trpc.activities.timeline.queryOptions({
			...anchor,
			filter: "upcoming",
			limit: 10,
		}),
		enabled: tab === "all",
	});

	const history = useInfiniteQuery({
		...trpc.activities.timeline.infiniteQueryOptions(
			{ ...anchor, filter: historyFilter(tab) },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	});

	const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
	const pinnedEntries = tab === "all" ? (pinned.data?.entries ?? []) : [];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* One band of controls, then history. Two stacked bordered bands push
			    the first entry off the fold on a laptop. */}
			<div className="flex shrink-0 flex-col gap-2 border-b px-5 py-3">
				<ActivityComposer anchor={anchor} />

				{/*
				 * Borderless, and outside the composer's box. This is a view control,
				 * not something you fill in — six outlined boxes gave it the same
				 * weight as the five outlined boxes above it, and the pair read as one
				 * confused row of eleven buttons.
				 */}
				<ToggleGroup
					type="single"
					value={tab}
					onValueChange={(next) => {
						// The group clears its value when you click the active item;
						// a timeline with no filter at all is not a state it has.
						if (next) void setTab(next as TimelineTab);
					}}
					size="sm"
					spacing={0}
					className="no-scrollbar max-w-full justify-start overflow-x-auto"
				>
					{TIMELINE_TABS.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{TAB_LABELS[option]}
							{/* A zero is omitted rather than printed, the same rule the
							    sheet's own tabs follow. Six filters each carrying a "0"
							    is a row of noise on exactly the records where there is
							    least to look at. */}
							{counts.data?.[option] ? (
								<span className="tabular-nums opacity-60">
									{counts.data[option]}
								</span>
							) : null}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{history.isPending ? (
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : entries.length === 0 && pinnedEntries.length === 0 ? (
				<DetailSheetEmpty
					icon={EMPTY_ICONS[tab]}
					title={EMPTY_STATES[tab].title}
					description={EMPTY_STATES[tab].description}
				/>
			) : (
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4">
					{pinnedEntries.length > 0 ? (
						<TimelineDay
							label="Outstanding"
							entries={pinnedEntries}
							anchor={anchor}
						/>
					) : null}

					{byDay(entries).map((group) => (
						<TimelineDay
							key={group.day}
							label={group.label}
							entries={group.entries}
							anchor={anchor}
						/>
					))}

					{history.hasNextPage ? (
						<Button
							variant="outline"
							size="sm"
							className="mt-4 self-start"
							disabled={history.isFetchingNextPage}
							onClick={() => history.fetchNextPage()}
						>
							{history.isFetchingNextPage ? <Spinner /> : null}
							Show older
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
