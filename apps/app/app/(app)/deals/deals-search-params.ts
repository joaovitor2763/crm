import { createListSearchParams } from "@/components/data-table/list-search-params";

export const dealsSearchParams = createListSearchParams({
	// Pipeline order by default: the deals closest to closing are the ones a rep
	// opens this page to look at.
	// Newest first: a CRM list is read to see what has changed, not to look
	// something up alphabetically — that is what ⌘K is for.
	defaultSort: "createdAt",
	defaultDir: "desc",
	tabId: "status",
	facetIds: ["owner", "pipeline", "stage", "closing"] as const,
});
