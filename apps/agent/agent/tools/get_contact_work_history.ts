import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertContact } from "../lib/access";
import { enabled, unavailable } from "../lib/capabilities";
import { contactProfileSlug } from "../lib/crm";
import { getExperience, getProfile } from "../lib/linkdapi";

/**
 * Reads the profile already on a contact's record — headline, current roles and
 * full work history.
 *
 * Takes a `contactId` rather than a slug on purpose. `get_linkedin_profile`
 * exists to *decide* whether a stranger is the person behind an address, and it
 * returns a verdict for exactly that reason; a second tool that reads any slug
 * without one would be the easy way to skip the check. This one can only read
 * the profile a verified match (or a rep) already put on the record, so there
 * is no identity question left for it to get wrong.
 */
export default defineTool({
	description:
		"Read the LinkedIn profile already on a CRM contact — headline, current roles and full work history. For writing a summary of somebody already identified. Cannot be used to identify anyone: use resolve_linkedin_profile and get_linkedin_profile for that.",
	inputSchema: z.object({
		contactId: z.string(),
	}),
	async execute({ contactId }, ctx) {
		await assertContact(ctx, contactId, PermissionAction.READ);
		if (!enabled("RAPIDAPI_KEY")) {
			return { found: false as const, ...unavailable("RAPIDAPI_KEY") };
		}

		const profileRef = await contactProfileSlug(contactId);
		if (!profileRef) {
			return {
				found: false as const,
				reason: "This contact has no LinkedIn URL on file.",
			};
		}

		const result = await getProfile(profileRef.slug);
		if (!result.ok) {
			return {
				found: false as const,
				reason: result.missing ? "No such profile." : result.reason,
			};
		}

		const profile = result.data;
		const history = profile.urn ? await getExperience(profile.urn) : null;

		return {
			found: true as const,
			profile,
			experience: history?.ok ? history.data : null,
			sourceUrl: profileRef.profileUrl,
			note: "Everything here is self-reported by the person. Write only what it says.",
		};
	},
});
