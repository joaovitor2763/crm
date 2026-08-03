import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";
import { createListSearchParams } from "@/components/data-table/list-search-params";

export const DEAL_VIEWS = ["table", "kanban"] as const;

export const dealsViewParsers = {
	view: parseAsStringLiteral(DEAL_VIEWS).withDefault("table").withOptions({
		history: "push",
	}),
	boardStage: parseAsString.withDefault("").withOptions({ history: "push" }),
};

export const loadDealsViewSearchParams = createLoader(dealsViewParsers);

export const dealsSearchParams = createListSearchParams({
	// Pipeline order by default: the deals closest to closing are the ones a rep
	// opens this page to look at.
	// Newest first: a CRM list is read to see what has changed, not to look
	// something up alphabetically — that is what ⌘K is for.
	defaultSort: "createdAt",
	defaultDir: "desc",
	tabId: "status",
	facetIds: [
		"owner",
		"pipeline",
		"stage",
		"closing",
		"closeFrom",
		"closeTo",
	] as const,
});
