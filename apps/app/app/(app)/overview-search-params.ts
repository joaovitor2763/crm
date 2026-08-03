import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

/**
 * The overview URL. Shared by the page's server-side prefetch and the client
 * panel, so the two cannot ask for different things — the same reason the list
 * modules keep their parsers in one file.
 *
 * Imported from `nuqs/server`: parsers are plain data, and this module is pulled
 * into both a server component and a client one.
 */

/** Kept in step with `DASHBOARD_SCOPES` in the API's dashboard contracts. */
export const OVERVIEW_SCOPES = ["me", "everyone"] as const;

export type OverviewScope = (typeof OVERVIEW_SCOPES)[number];

export const overviewParsers = {
	// A literal parser, not a plain string: `?scope=nonsense` then falls back to
	// the default rather than reaching the API as an unhandled value.
	scope: parseAsStringLiteral(OVERVIEW_SCOPES).withDefault("me"),
	from: parseAsString.withDefault(""),
	to: parseAsString.withDefault(""),
	grain: parseAsStringLiteral([
		"hour",
		"day",
		"week",
		"month",
		"quarter",
	] as const).withDefault("week"),
};

export const loadOverviewSearchParams = createLoader(overviewParsers);
