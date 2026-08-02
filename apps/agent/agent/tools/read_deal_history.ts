import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertDeal } from "../lib/access";
import { readDealHistory } from "../lib/accounts";
import { focusOn } from "../lib/focus";

/**
 * Where a deal stands, rather than what its stage field says.
 *
 * A stage is a rep's last opinion, entered by hand, and it goes stale in
 * exactly the situation somebody opens the record to ask about. This returns
 * the things that disagree with it: how long it has sat in that stage, when
 * anyone on the other side last replied, whether there is a meeting booked,
 * and every stage it moved through to get here.
 *
 * Free. Nothing here costs budget, and it is the only way to answer "where
 * does this stand?" without asking the rep who is asking.
 */
export default defineTool({
	description:
		"Read a deal in full: stage and how long it has been there, value, close date, the whole stage history, who is on it with their contact ids, the correspondence and meetings with those people, and the notes. Free — call it first in a deal session.",
	inputSchema: z.object({
		dealId: z.string(),
		threads: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(5)
			.describe("How many recent threads to read."),
	}),
	async execute({ dealId, threads }, ctx) {
		const access = await assertDeal(ctx, dealId, PermissionAction.READ);
		const history = await readDealHistory(dealId, {
			threads,
			contactWhere: access.contactWhere,
		});
		if (!history) return { found: false as const, reason: "No such deal." };

		// A deal has no fields of its own to enrich, so anything learned here is
		// recorded against the company or the people on it — which is what the
		// focus has to point at for the audit trail to file it correctly.
		focusOn({ companyId: history.company.id });

		return { found: true as const, ...history };
	},
});
