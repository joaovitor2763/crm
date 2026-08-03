import { db, PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";

const events = [
	{
		id: "lead.submitted",
		resource: "contacts",
		description: "A lead arrives through the public ingestion API.",
	},
	{
		id: "contact.created",
		resource: "contacts",
		description: "A contact is created.",
	},
	{
		id: "contact.became_mql",
		resource: "contacts",
		description: "A contact first becomes MQL.",
	},
	{
		id: "contact.lifecycle_changed",
		resource: "contacts",
		description: "A contact lifecycle changes.",
	},
	{
		id: "deal.created",
		resource: "deals",
		description: "A deal enters a pipeline.",
	},
	{
		id: "deal.stage_changed",
		resource: "deals",
		description: "A deal moves to another stage or pipeline.",
	},
] as const;

export default defineTool({
	description:
		"Read the exact roles, business units, pipelines, stages, triggers, condition paths and action types available to the workflow builder. Call this before drafting an automation.",
	inputSchema: z.object({}),
	async execute(_input, ctx) {
		const access = await crmAccess(ctx, PermissionAction.MANAGE, "automations");
		const unitScope =
			access.isAdmin || access.isSystem
				? {}
				: { id: { in: [...(access.businessUnitTreeIds ?? [])] } };
		const [roles, businessUnits, pipelines] = await Promise.all([
			db.role.findMany({
				where: { archivedAt: null, isAdmin: false },
				orderBy: { name: "asc" },
				select: { id: true, key: true, name: true },
			}),
			db.businessUnit.findMany({
				where: { archivedAt: null, ...unitScope },
				orderBy: { name: "asc" },
				select: { id: true, key: true, name: true },
			}),
			db.pipeline.findMany({
				where: {
					archivedAt: null,
					...(access.isAdmin || access.isSystem
						? {}
						: {
								OR: [
									{ businessUnitId: null },
									{
										businessUnitId: {
											in: [...(access.businessUnitTreeIds ?? [])],
										},
									},
								],
							}),
				},
				orderBy: { name: "asc" },
				select: {
					id: true,
					name: true,
					businessUnitId: true,
					stages: {
						orderBy: { position: "asc" },
						select: { id: true, key: true, name: true, type: true },
					},
				},
			}),
		]);

		return {
			roles,
			businessUnits,
			pipelines,
			events,
			conditionPaths: [
				"payload.source",
				"payload.utmSource",
				"payload.utmCampaign",
				"payload.to",
				"record.globalLifecycleStage",
				"record.title",
				"record.email",
				"record.amount",
				"record.stageId",
				"record.ownerId",
				"event.teamId",
			],
			actionTypes: [
				"set_lifecycle",
				"assign_contact",
				"update_contact",
				"create_task",
				"add_note",
				"move_deal",
				"update_deal",
				"archive_contact",
				"emit_event",
			],
		};
	},
});
