import { EnrichmentStatus } from "@crm/db";
import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { markRunning, settle } from "../lib/enrichment";
import { claimDue, noteSession, retireExhausted } from "../lib/tasks";

/** Per tick. The cap is concurrency, not ambition — the queue keeps. */
const BATCH = 5;

/**
 * The agent's clock.
 *
 * One schedule for everything, and it decides nothing: it leases whatever is
 * due and starts a session per row. What the work *is* comes from the row —
 * written by the API when something happened, or by the agent itself when it
 * decided a person was worth another look in a fortnight.
 *
 * This is the difference the plan is named for. The schedules it replaces said
 * "every 20 minutes, the ten oldest contacts", which treats the CEO of a live
 * opportunity and a bounced alias identically because they sorted adjacently.
 *
 * Handler form rather than markdown, because the batch has to be claimed in
 * code — and because a handler-form session can park for a human, which task
 * mode cannot.
 */
export default defineSchedule({
	// Vercel Hobby allows daily schedules only. Interactive agent conversations
	// are unaffected; the autonomous enrichment queue runs once each morning.
	cron: "0 10 * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			(async () => {
				// Rows that spent their attempts without a session ever reporting
				// back. Retiring them before claiming keeps the sweep on the same
				// clock as the work rather than needing a schedule of its own.
				//
				// Guarded, because a throw here returns before `claimDue` and the
				// queue simply stops: a sweep that only tidies up must never be able
				// to prevent the work it tidies up after.
				try {
					for (const abandoned of await retireExhausted()) {
						await settle(
							abandoned,
							EnrichmentStatus.FAILED,
							"Research was attempted several times and never completed.",
						);
					}
				} catch {}

				const tasks = await claimDue(BATCH);
				if (tasks.length === 0) return;

				await Promise.all(
					tasks.map(async (task) => {
						try {
							await markRunning(task);

							const session = await receive(crm, {
								message: brief(task),
								// The channel keys its continuation token off this, so a
								// re-dispatched lease resumes the run rather than starting
								// the research over.
								target: { taskId: task.id },
								auth: {
									...appAuth,
									// Read by `instructions/task.ts` at `session.started`, so
									// the run opens knowing who it is about and what it may
									// spend instead of paying two tool calls to find out.
									attributes: {
										taskKind: task.kind,
										reason: task.reason,
										budget: String(task.budget),
										...(task.contactId ? { contactId: task.contactId } : {}),
										...(task.companyId ? { companyId: task.companyId } : {}),
									},
								},
							});

							// Hand-off, not completion: `receive` resolves the moment the
							// session accepts the message, and the run outlives this tick.
							// Retiring the row is the channel's `session.waiting` hook,
							// which fires when the turn is genuinely over. Completing here
							// instead would close rows before the research ran.
							await noteSession(task.id, session.id);
						} catch (error) {
							const reason =
								error instanceof Error ? error.message : String(error);

							// A hand-off that threw never reached a session, so nothing
							// downstream will ever close this row. Leave it open for the
							// lease to re-offer, bounded by the attempt cap, and say on the
							// record why nothing is happening yet.
							//
							// Nothing rethrows: one bad row must not take the batch down
							// with it. `waitUntil` receives the rejection with no handler
							// attached, which is an unhandled rejection inside the cron
							// task rather than a logged error.
							await settle(task, EnrichmentStatus.FAILED, reason).catch(
								() => {},
							);
						}
					}),
				);
			})(),
		);
	},
});

/**
 * What the session is asked to do.
 *
 * Short on purpose. The detail — who this person is, what we already know, what
 * is missing — is assembled by the dynamic instructions from the database,
 * where it is current, rather than pasted into a prompt here, where it would be
 * a snapshot taken by whoever queued the row.
 */
function brief(task: {
	kind: string;
	reason: string;
	contactId: string | null;
	companyId: string | null;
	attempts: number;
}): string {
	// A retry resumes the same durable session, so the transcript is already
	// there — saying so is what stops it being read as a fresh identical request
	// and researched from scratch on somebody else's budget.
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason);
}

function work(kind: string, reason: string): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is, and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role, and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "company-profile":
			return "Fill in what we know about this company: brand, industry, location, links. Write a brief if there is something worth saying.";
		default:
			return `Handle this: ${reason}`;
	}
}
