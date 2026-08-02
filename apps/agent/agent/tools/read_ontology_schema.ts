import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { readOntologyVersion } from "../lib/ontology";

export default defineTool({
	description:
		"Read one exact ontology schema version, or the latest non-archived version for a schema key. Global-admin read-only audit; returns classes, attributes, relations and policies without offering a write path.",
	inputSchema: z
		.object({
			versionId: z.string().min(1).optional(),
			key: z.string().min(1).optional(),
		})
		.refine(
			(input) => Boolean(input.versionId ?? input.key),
			"versionId or key is required.",
		),
	async execute(input, ctx) {
		const access = await crmAccess(ctx, PermissionAction.READ);
		return readOntologyVersion(access, input);
	},
});
