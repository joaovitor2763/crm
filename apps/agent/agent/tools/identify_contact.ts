import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertContact } from "../lib/access";
import type { Evidence, EvidenceKind } from "../lib/evidence";
import { WEIGHTS } from "../lib/evidence";
import { recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";

/**
 * Putting a real name to an address.
 *
 * This used to take a `confidence` enum from the model and refuse anything
 * below `high`. Two things were wrong with that. The bar was set by the thing
 * being judged — a rubric the model could talk itself out of — and everything
 * below the bar was thrown away, so an ambiguous address cost a lookup every
 * run and produced nothing, forever.
 *
 * Now it takes evidence. A profile carrying their email address, or a reply on
 * a thread we already have, names them outright and is written. One weak signal
 * short of that becomes a suggestion a rep settles in three seconds — which is
 * the case this tool exists for, because `pmarchetti@fernhill.com` has four
 * plausible Marchettis behind it and a human knows which.
 */
export default defineTool({
	description:
		"Put a verified name to a CRM contact, with the evidence for it. Strong evidence writes the name; anything less becomes a suggestion for a rep. Never overwrites a name a person supplied.",
	inputSchema: z.object({
		contactId: z.string(),
		fullName: z.string().describe("Exactly as the source writes it."),
		evidence: z
			.array(
				z.object({
					kind: z.enum(
						Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]],
					),
					detail: z.string().describe("What the source actually said."),
					sourceUrl: z.string().optional(),
				}),
			)
			.min(1),
		sourceUrl: z.string().describe("The page a rep should open to check."),
	}),
	async execute(input, ctx) {
		await assertContact(ctx, input.contactId, PermissionAction.UPDATE);
		focusOn({ contactId: input.contactId });

		const result = await recordFact({
			contactId: input.contactId,
			field: "name",
			value: input.fullName,
			evidence: input.evidence as Evidence[],
			method: "identity",
			sourceUrl: input.sourceUrl,
		});

		return {
			applied: result.applied,
			stored: result.stored,
			band: result.band,
			score: Number(result.score.toFixed(2)),
			rationale: result.rationale,
			...(result.reason ? { reason: result.reason } : {}),
		};
	},
});
