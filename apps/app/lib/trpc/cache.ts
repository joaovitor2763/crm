"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "./client";

/**
 * What a write invalidates, in one place.
 *
 * Every mutation used to list its own keys in `onSuccess`, and the lists drifted
 * apart: a stage change wrote a `STAGE_CHANGE` activity without invalidating the
 * timeline it landed on, creating a deal from the deals page never refreshed the
 * list, and nothing at all invalidated the overview — so a rep could close a
 * deal and watch their own numbers not move. The fan-out belongs to the shape of
 * the data, not to the button that happened to trigger it, so it lives here and
 * each call site says only *what changed*.
 *
 * Per the API rules: freshness is TanStack Query's job, invalidated from the
 * mutation's `onSuccess` with the narrowest key that covers what changed. What
 * counts as "narrowest" is per-entity, which is exactly what these functions
 * encode.
 */

type Settle = "all" | "record";

type Options = {
	/**
	 * Which refetches to wait for.
	 *
	 * `"all"` (the default) keeps the caller pending until every affected view is
	 * fresh — right when the point of the action *is* the view changing, like a
	 * row leaving the filtered list once its stage no longer matches.
	 *
	 * `"record"` waits only for the changed record's own query and lets the rest
	 * refetch behind it, so an inline editor's spinner clears as soon as the value
	 * under it is right rather than when the table behind the sheet has caught up.
	 */
	settle?: Settle;
};

export type CrmCache = {
	/** A company's name, logo, industry, owner, primary contact or enrichment. */
	company(id?: string, options?: Options): Promise<void>;
	/** A contact's name, title, email or which company they belong to. */
	contact(id?: string, options?: Options): Promise<void>;
	/** A deal's stage, amount, close date or owner — and so every sales number. */
	deal(id?: string, options?: Options): Promise<void>;
	/** A note, a task, or a task being ticked off. */
	activity(options?: Options): Promise<void>;
	/**
	 * Connecting, disconnecting, a manual sync, or suppressing a domain.
	 *
	 * A *scheduled* sync is not this: nothing the browser did caused it, so it is
	 * polled rather than invalidated (see `sync-status`). This is only for the
	 * writes a rep triggers from the settings page.
	 */
	google(options?: Options): Promise<void>;
	pipelines(options?: Options): Promise<void>;
	products(options?: Options): Promise<void>;
	dashboardDefinitions(options?: Options): Promise<void>;
	ontology(options?: Options): Promise<void>;
	/** An account write changes its detail, relations, lineage and list. */
	revenueAccounts(id?: string, options?: Options): Promise<void>;
	marketing(options?: Options): Promise<void>;
	/** An import writes across every table, so nothing is assumed to survive. */
	everything(): Promise<void>;
};

export function useCrmCache(): CrmCache {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const run = (
		record: QueryKey[],
		rest: QueryKey[],
		{ settle = "all" }: Options = {},
	): Promise<void> => {
		const awaited = settle === "all" ? [...record, ...rest] : record;
		const behind = settle === "all" ? [] : rest;

		for (const queryKey of behind) {
			void queryClient.invalidateQueries({ queryKey });
		}

		return Promise.all(
			awaited.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
		).then(() => undefined);
	};

	/**
	 * The timeline history is an infinite query, so `pathKey()` — tRPC stamps the
	 * query type into `queryKey()`, and `{ type: "query" }` cannot partially match
	 * the `{ type: "infinite" }` the history is cached under. Getting this wrong
	 * is silent: it reports success, refetches the sibling non-infinite queries,
	 * and leaves the history stale until a reload.
	 */
	const activityKeys = () => [
		trpc.activities.timeline.pathKey(),
		trpc.activities.timelineCounts.queryKey(),
		trpc.activities.myTasks.queryKey(),
	];

	/** Where a record's name and logo are rendered other than on itself. */
	const listKeys = () => [
		trpc.companies.list.queryKey(),
		trpc.contacts.list.queryKey(),
		trpc.deals.list.queryKey(),
		trpc.deals.board.queryKey(),
		trpc.companies.archived.queryKey(),
		trpc.contacts.archived.queryKey(),
		trpc.deals.archived.queryKey(),
		// The ⌘K switcher searches names and domains, so a rename it cannot see
		// is a record the rep cannot find.
		trpc.search.quick.queryKey(),
	];

	return {
		company: (id, options) =>
			run(
				[
					id
						? trpc.companies.byId.queryKey({ id })
						: trpc.companies.byId.queryKey(),
				],
				[
					...listKeys(),
					// A company's name and logo ride along on every contact and deal.
					trpc.contacts.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		contact: (id, options) =>
			run(
				[
					id
						? trpc.contacts.byId.queryKey({ id })
						: trpc.contacts.byId.queryKey(),
				],
				[
					...listKeys(),
					// Contact count and primary contact live on the company; a contact
					// can also be on a deal. Moving someone between companies changes
					// both, so the whole path is invalidated rather than one id.
					trpc.companies.byId.queryKey(),
					trpc.deals.byId.queryKey(),
				],
				options,
			),

		deal: (id, options) =>
			run(
				[id ? trpc.deals.byId.queryKey({ id }) : trpc.deals.byId.queryKey()],
				[
					...listKeys(),
					// Open deal count, open value and last activity all sit on the
					// company.
					trpc.companies.byId.queryKey(),
					// Setting a stage writes a STAGE_CHANGE activity onto the deal's and
					// the company's timeline.
					...activityKeys(),
					// Line-item writes use the deal cache path and change the product
					// catalogue's usage counts.
					trpc.products.list.queryKey(),
					// Pipeline, closed-won, win rate, cycle time, the leaderboard — the
					// entire overview is a function of the deals table.
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		activity: (options) =>
			run(
				activityKeys(),
				[
					// "Last activity" columns move whenever anything is logged, and the
					// record's own page shows the entry.
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					// Form conversions and event attendance are activities, while their
					// aggregate counts live on the marketing settings queries.
					trpc.marketing.forms.queryKey(),
					trpc.marketing.events.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		google: (options) =>
			run(
				[trpc.google.status.queryKey()],
				[
					// A sync writes threads and meetings onto timelines, and
					// auto-creation writes whole companies and contacts — so a
					// disconnect-and-purge has to reach the lists too, not just the
					// settings page it was pressed on.
					...activityKeys(),
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		pipelines: (options) =>
			run(
				[trpc.pipelines.list.queryKey()],
				[
					trpc.deals.list.queryKey(),
					trpc.deals.board.queryKey(),
					trpc.deals.archived.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		products: (options) =>
			run(
				[trpc.products.list.queryKey()],
				[trpc.deals.byId.queryKey()],
				options,
			),

		dashboardDefinitions: (options) =>
			run(
				[
					trpc.dashboard.definitionsList.queryKey(),
					trpc.dashboard.definition.queryKey(),
				],
				[
					trpc.dashboard.renderDefinition.queryKey(),
					trpc.dashboard.summary.queryKey(),
					trpc.dashboard.analytics.queryKey(),
				],
				options,
			),

		ontology: (options) =>
			run(
				[trpc.ontology.list.queryKey(), trpc.ontology.detail.queryKey()],
				[trpc.ontology.impactPreview.queryKey()],
				options,
			),

		revenueAccounts: (id, options) =>
			run(
				[
					id
						? trpc.revenueAccounts.byId.queryKey({ id })
						: trpc.revenueAccounts.byId.queryKey(),
					trpc.revenueAccounts.configuration.queryKey(),
					trpc.revenueAccounts.history.queryKey(),
				],
				[
					trpc.revenueAccounts.list.queryKey(),
					trpc.revenueAccounts.mergeCandidates.queryKey(),
					trpc.revenueAccounts.mergePreview.queryKey(),
					trpc.dashboard.analytics.queryKey(),
				],
				options,
			),

		marketing: (options) =>
			run(
				[trpc.marketing.forms.queryKey(), trpc.marketing.events.queryKey()],
				activityKeys(),
				options,
			),

		everything: () => queryClient.invalidateQueries(),
	};
}
