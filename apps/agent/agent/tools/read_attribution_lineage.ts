import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	assertCompany,
	assertContact,
	assertDeal,
	assertRevenueAccount,
} from "../lib/access";
import {
	type AgentAttributionEntity,
	readAttributionLineage,
} from "../lib/attribution";

const entityType = z.enum(["CONTACT", "COMPANY", "DEAL", "REVENUE_ACCOUNT"]);

export default defineTool({
	description:
		"Read append-only conversion lineage for one exact scoped CRM element. For a merged Conta, follows RevenueAccountMerge aliases so source event entityIds remain immutable while the canonical target projection includes them. Read-only and evidence-based.",
	inputSchema: z.object({
		entityType,
		entityId: z.string().min(1),
		limit: z.number().int().min(1).max(250).default(100),
	}),
	async execute({ entityType, entityId, limit }, ctx) {
		const access =
			entityType === "CONTACT"
				? await assertContact(ctx, entityId, PermissionAction.READ)
				: entityType === "COMPANY"
					? await assertCompany(ctx, entityId, PermissionAction.READ)
					: entityType === "DEAL"
						? await assertDeal(ctx, entityId, PermissionAction.READ)
						: await assertRevenueAccount(ctx, entityId, PermissionAction.READ);
		return readAttributionLineage(
			entityType as AgentAttributionEntity,
			entityId,
			access,
			limit,
		);
	},
});
