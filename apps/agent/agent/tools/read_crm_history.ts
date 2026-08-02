import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertContact } from "../lib/access";
import { readCrmHistory } from "../lib/crm";
import { focusOn } from "../lib/focus";

/**
 * What we already know, before spending anything to find out.
 *
 * This should usually be the *first* call on any contact, and it is free: no
 * vendor, no rate limit, no budget. It is also the strongest evidence available
 * anywhere in the system. A person who replied to us from an address is that
 * person, in a way no profile lookup can match, and their own signature block
 * outranks LinkedIn on a job title because people update a signature the week
 * they are promoted.
 *
 * Full message bodies are returned on purpose — single-tenant internal tool,
 * our own mailbox. The `data-boundaries` skill covers what may not then be done
 * with them.
 */
export default defineTool({
	description:
		"Read everything the CRM already has on a contact: email threads with full message bodies, meetings, whether they have ever replied, their company and its id, the deals they are on, and who else we know at their company. Free, fast, and the best evidence there is — call it before paying for a lookup.",
	inputSchema: z.object({
		contactId: z.string(),
		threads: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(5)
			.describe("How many recent threads to read."),
	}),
	async execute({ contactId, threads }, ctx) {
		const access = await assertContact(ctx, contactId, PermissionAction.READ);
		focusOn({ contactId });

		const history = await readCrmHistory(contactId, {
			threads,
			dealWhere: access.dealWhere,
			contactWhere: access.contactWhere,
		});
		if (!history) return { found: false as const, reason: "No such contact." };

		const evidence =
			history.stats.emails === 0 && history.stats.meetings === 0
				? "We have never actually spoken to this person. Nothing here is evidence of anything."
				: "A signature block or a reply from their own address is primary evidence — record it as `crm.signature-block` or `crm.thread-reply`.";

		// The ids are called out because the absence of one used to end the
		// conversation: an agent that could see `companyName` and no id would
		// report that there was no company to look at.
		const reach = history.contact.company
			? ` Their company is \`${history.contact.company.id}\` — read_company_history or enrich_company take that id directly.`
			: " They are not attached to a company; search_crm will find one by name or domain if the question needs it.";

		return {
			found: true as const,
			...history,
			note: evidence + reach,
		};
	},
});
