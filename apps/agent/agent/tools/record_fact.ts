import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertContact } from "../lib/access";
import type { Evidence, EvidenceKind } from "../lib/evidence";
import { WEIGHTS } from "../lib/evidence";
import { FACT_FIELDS, type FactField, recordFact } from "../lib/facts";
import { focusOn } from "../lib/focus";

/**
 * One claim, with what backs it. The only write to a contact's fields.
 *
 * It takes evidence and never a score. That is the whole design: the model
 * reports what it *saw* — "their signature block says Head of Security" — and
 * the ledger decides what that is worth. A `confidence` argument would be the
 * model grading its own homework, and a `sourceUrl` accepted as proof would be
 * the same thing with extra steps.
 *
 * Whether this writes the record or offers a suggestion is decided by the
 * arithmetic, not by the caller. A rejection is a correct outcome.
 */
export default defineTool({
	description:
		"Record one claim about a contact — title, employer, a profile URL, seniority — together with the evidence for it. The evidence decides whether it is written to the record or offered to a rep as a suggestion. Never invent evidence you did not observe.",
	inputSchema: z.object({
		contactId: z.string(),
		field: z
			.enum(FACT_FIELDS as [FactField, ...FactField[]])
			.describe("Which fact about them this is."),
		value: z
			.string()
			.describe("The claim itself, exactly as the source states it."),
		evidence: z
			.array(
				z.object({
					kind: z
						.enum(Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]])
						.describe(
							"What kind of thing you saw. Use `contradiction` when two sources disagree.",
						),
					detail: z
						.string()
						.describe(
							"What it actually said, in one line a rep would understand.",
						),
					sourceUrl: z.string().optional(),
				}),
			)
			.min(1)
			.describe("Everything you observed. One entry per independent source."),
		method: z
			.string()
			.describe(
				'Where it came from: "linkedin.profile", "github.api", "crm.thread", "web".',
			),
		sourceUrl: z
			.string()
			.optional()
			.describe("The page a rep should open to check."),
	}),
	async execute(input, ctx) {
		await assertContact(ctx, input.contactId, PermissionAction.UPDATE);
		focusOn({ contactId: input.contactId });

		const result = await recordFact({
			contactId: input.contactId,
			field: input.field,
			value: input.value,
			evidence: input.evidence as Evidence[],
			method: input.method,
			sourceUrl: input.sourceUrl,
		});

		return {
			stored: result.stored,
			applied: result.applied,
			band: result.band,
			score: Number(result.score.toFixed(2)),
			rationale: result.rationale,
			...(result.reason ? { reason: result.reason } : {}),
		};
	},
});
