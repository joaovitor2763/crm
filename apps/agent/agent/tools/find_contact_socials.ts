import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertContact } from "../lib/access";
import { personForVerification, stampSocialsChecked } from "../lib/crm";
import { focusOn, spend } from "../lib/focus";
import { findSocialCandidates } from "../lib/socials";

/**
 * Candidates, never answers — the same contract as `resolve_linkedin_profile`.
 *
 * Perplexity is good at finding where somebody lives on the web and bad at
 * being sure it is the right somebody: asked for a person's GitHub it returns
 * *a* GitHub, because that is what the question wanted. `set_contact_socials`
 * is what decides.
 */
export default defineTool({
	description:
		"Search the web for a contact's X and GitHub profiles. Returns CANDIDATES ONLY — pass them to set_contact_socials, which re-checks each one against the account itself before writing. Never write these URLs any other way.",
	inputSchema: z.object({
		contactId: z.string(),
	}),
	async execute({ contactId }, ctx) {
		await assertContact(ctx, contactId, PermissionAction.UPDATE);
		// So the audit hook files this session's events against the right record.
		focusOn({ contactId });

		const person = await personForVerification(contactId);
		if (!person) {
			return { searched: false as const, reason: "No such contact." };
		}

		// Two searches, so two units. Most people have neither account, which is
		// exactly why this should not be the thing that empties a budget.
		const charge = spend(2);
		if (!charge.ok) return { searched: false as const, reason: charge.reason };

		const [x, github] = await Promise.all([
			findSocialCandidates(person, "x"),
			findSocialCandidates(person, "github"),
		]);

		// Stamped here, not only on a successful write. Most people have neither
		// account, and "we looked and found nothing" has to be recorded or this
		// contact comes back around every hour for the same two searches.
		await stampSocialsChecked(contactId);

		return {
			searched: true as const,
			searchedFor: person.fullName,
			candidates: {
				x: x.candidates.map((c) => c.url),
				github: github.candidates.map((c) => c.url),
			},
			citations: [...x.citations, ...github.citations],
			note: "Unverified. set_contact_socials will reject any of these it cannot corroborate, and that is a normal outcome.",
		};
	},
});
