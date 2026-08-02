import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertCompany } from "../lib/access";
import { readCompanyHistory } from "../lib/accounts";
import { focusOn } from "../lib/focus";

/**
 * The account, and everyone in it.
 *
 * The company equivalent of `read_crm_history`, and it exists because a
 * session opened on a company could count its contacts and not name one. The
 * agent's own words: "I don't have a tool that lists contacts by company, only
 * ones that look up a specific contact by ID or email" — so it asked the rep
 * to paste an id that the CRM had already joined for them.
 *
 * Free, like every read of our own database. It should be the first call in a
 * company session, and it is usually the last one needed: the people, the
 * deals, the correspondence and the notes come back together, each with the id
 * a follow-up tool wants.
 */
export default defineTool({
	description:
		"Read everything the CRM has on a company: every contact there with their id, title and whether we have heard from them; every deal with stage and value; recent email threads with full bodies; meetings; and notes. Free and fast — call it first in a company session, and whenever you need to find a person at a company you already know.",
	inputSchema: z.object({
		companyId: z.string(),
		threads: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(5)
			.describe("How many recent threads to read across the whole account."),
		people: z
			.number()
			.int()
			.min(1)
			.max(100)
			.default(25)
			.describe("How many contacts to list."),
	}),
	async execute({ companyId, threads, people }, ctx) {
		const access = await assertCompany(ctx, companyId, PermissionAction.READ);
		focusOn({ companyId });

		const history = await readCompanyHistory(companyId, {
			threads,
			people,
			contactWhere: access.contactWhere,
			dealWhere: access.dealWhere,
			activityWhere: access.activityWhere,
		});
		if (!history) return { found: false as const, reason: "No such company." };

		return {
			found: true as const,
			...history,
			note:
				history.people.length === 0
					? "We have no contacts on file at this company, so there is nobody here to research yet."
					: "Every person above carries their contact id — use it directly with read_crm_history, identify_contact or record_fact. Never ask a rep for an id that is in this list.",
		};
	},
});
