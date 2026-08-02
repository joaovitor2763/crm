import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { readOntologySchemas } from "../lib/ontology";

export default defineTool({
	description:
		"List immutable ontology schema definitions and their draft/published versions for a global administrator. Read-only audit view; the Eve agent cannot alter or publish ontology snapshots.",
	inputSchema: z.object({}),
	async execute(_input, ctx) {
		const access = await crmAccess(ctx, PermissionAction.READ);
		return readOntologySchemas(access);
	},
});
