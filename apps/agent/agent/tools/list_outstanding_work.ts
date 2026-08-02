import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { contactsNeedingWork } from "../lib/crm";

/**
 * What is outstanding, not what to do about it.
 *
 * Each row says what is missing — a name, a background, socials — and the agent
 * decides which of those is worth doing for this person. The two tools this
 * replaced encoded that decision in their names, which meant the ordering of
 * the work was a property of the codebase rather than a judgement about the
 * contact.
 */
export default defineTool({
	description:
		"List CRM contacts with outstanding research: no real name yet, no background written, or socials never looked for. Each row says what is missing. Deciding what is worth doing, and in what order, is your job.",
	inputSchema: z.object({
		limit: z.number().int().min(1).max(25).default(10),
	}),
	async execute({ limit }, ctx) {
		const access = await crmAccess(ctx, PermissionAction.READ, "contacts");
		const contacts = await contactsNeedingWork(limit, access.contactWhere);
		return { count: contacts.length, contacts };
	},
});
