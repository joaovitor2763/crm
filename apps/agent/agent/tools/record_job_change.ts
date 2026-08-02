import { db, PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertCompany, assertContact } from "../lib/access";
import { sensitiveWrite } from "../lib/approval";
import { writeTimelineNote } from "../lib/crm";
import { lastEmployerChange } from "../lib/facts";
import { focusOn } from "../lib/focus";

/**
 * A champion changing employer — the highest-intent signal in B2B, and the one
 * nothing else in our stack sees.
 *
 * It costs nothing to detect, because it already happened: an `employer` fact
 * superseding an applied one *is* the job change. There is no diffing job and
 * no second data source. This tool turns that row into something a human will
 * actually notice.
 *
 * What it deliberately does **not** do is move the contact to their new
 * company. That re-parents the record — changes whose pipeline they sit in and
 * which timeline their history hangs off — and it is approval-gated for that
 * reason. Unattended, it raises the alert and lets their owner decide.
 */
export default defineTool({
	description:
		"Raise a job change on a contact's timeline and task their owner. Reads the change from the facts already recorded; call it after recording a new employer.",
	inputSchema: z.object({
		contactId: z.string(),
		/**
		 * Moving them is the sensitive part, which is why it is a separate flag
		 * rather than something that happens implicitly.
		 */
		moveToCompanyId: z
			.string()
			.optional()
			.describe(
				"Only when the new employer is already a company in the CRM and a person has approved the move.",
			),
	}),
	approval: sensitiveWrite(
		"Raise the change without `moveToCompanyId` — the alert lands on the timeline and their owner decides whether to move them.",
	),
	async execute({ contactId, moveToCompanyId }, ctx) {
		await assertContact(ctx, contactId, PermissionAction.UPDATE);
		if (moveToCompanyId) {
			await assertCompany(ctx, moveToCompanyId, PermissionAction.READ);
		}
		focusOn({ contactId });

		const change = await lastEmployerChange(contactId);
		if (!change) {
			return {
				raised: false as const,
				reason: "No employer change on the facts for this contact.",
			};
		}

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: {
				firstName: true,
				lastName: true,
				ownerId: true,
				companyId: true,
			},
		});
		if (!contact) return { raised: false as const, reason: "No such contact." };

		const name = [contact.firstName, contact.lastName]
			.filter(Boolean)
			.join(" ");

		// Lands on the *old* company's timeline, which is where the relationship
		// lives and where anyone reviewing that account will see it.
		await writeTimelineNote(
			contactId,
			`${name} has moved to ${change.to}`,
			[
				`${name} appears to have left ${change.from} for ${change.to}.`,
				change.sourceUrl ?? "",
				"",
				"Worth a conversation either way: a champion in a new seat is the",
				"warmest introduction there is, and their replacement at the old",
				"account is a relationship nobody owns yet.",
			]
				.filter(Boolean)
				.join("\n"),
			{ source: "job-change", from: change.from, to: change.to },
		);

		if (moveToCompanyId) {
			await db.contact.update({
				where: { id: contactId },
				data: { companyId: moveToCompanyId },
			});
		}

		return {
			raised: true as const,
			from: change.from,
			to: change.to,
			moved: Boolean(moveToCompanyId),
			ownerNotified: contact.ownerId !== null,
		};
	},
});
