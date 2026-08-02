import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { previewOntologyImpact } from "../lib/ontology";

export default defineTool({
	description:
		"Preview the observed impact of one ontology draft/version against its published baseline: added, removed and changed classes, fields and relations plus breaking-change flags. Read-only and restricted to global administrators.",
	inputSchema: z.object({ versionId: z.string().min(1) }),
	async execute({ versionId }, ctx) {
		const access = await crmAccess(ctx, PermissionAction.READ);
		return previewOntologyImpact(access, versionId);
	},
});
