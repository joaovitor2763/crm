import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertContact } from "../lib/access";
import { scheduleTask } from "../lib/tasks";

/** Bounds, not opinions: a day is churn, three years is forgetting. */
const MIN_DAYS = 1;
const MAX_DAYS = 730;

/**
 * Deciding when to look at somebody again.
 *
 * The single most important tool in the agent, and the least impressive
 * looking. Everything else here answers a question; this one decides which
 * question gets asked next, which is what separates an agent from a cron job
 * with a language model attached.
 *
 * `reason` is mandatory and is shown to the rep on the record. An agent that
 * cannot say why it will be back in fourteen days does not have a reason, it
 * has a default.
 */
export default defineTool({
	description:
		"Decide when this contact is worth looking at again, and say why. Use a short interval for people whose job change would move a live deal, a long one for quiet records, and skip it entirely for addresses nobody will ever sell to.",
	inputSchema: z.object({
		contactId: z.string(),
		days: z
			.number()
			.int()
			.min(MIN_DAYS)
			.max(MAX_DAYS)
			.describe(
				"14 for a champion on an open deal; 90 for a named contact with no deal; 365 when two attempts have found nothing.",
			),
		reason: z
			.string()
			.min(10)
			.describe(
				"Why this interval, for this person. A rep reads it: 'a job change here would move the Acme deal', not 'scheduled recheck'.",
			),
		budget: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(4)
			.describe("Vendor calls the next run may spend."),
	}),
	async execute({ contactId, days, reason, budget }, ctx) {
		await assertContact(ctx, contactId, PermissionAction.UPDATE);
		const dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

		await scheduleTask({
			contactId,
			kind: "recheck",
			reason,
			dueAt,
			budget,
			// Behind anything a person or an event asked for. A recheck is never
			// the most urgent thing in the queue.
			priority: 0,
		});

		return { scheduled: true as const, dueAt: dueAt.toISOString(), reason };
	},
});
