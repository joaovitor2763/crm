import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db, PipelineStageType } from "@crm/db";
import { activityCreateInput } from "../src/activities/activities.contracts";
import { ActivitiesService } from "../src/activities/activities.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { dealListInput } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { MarketingService } from "../src/marketing/marketing.service";
import { PipelinesService } from "../src/pipelines/pipelines.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const userId = `crm-foundations-user-${suffix}`;
const companyId = `crm-foundations-company-${suffix}`;
const pipelineId = `crm-foundations-pipeline-${suffix}`;
const openStageId = `crm-foundations-open-${suffix}`;
const lostStageId = `crm-foundations-lost-${suffix}`;
const dealId = `crm-foundations-deal-${suffix}`;
const productId = `crm-foundations-product-${suffix}`;
const generatedPipelineName = `CRM Foundations Generated Pipeline ${suffix}`;
const marketingEventName = `CRM Foundations Event ${suffix}`;
const guardPipelineName = `CRM Foundations Open Guard ${suffix}`;
const handoverPipelineName = `CRM Foundations Handover Pipeline ${suffix}`;
const primaryContactId = `crm-foundations-primary-${suffix}`;

let deals: DealsService;
let activities: ActivitiesService;
let pipelines: PipelinesService;
let marketing: MarketingService;
let generatedDealId: string;
let contacts: ContactsService;

async function cleanup() {
	await db.company.deleteMany({ where: { id: companyId } });
	await db.contact.deleteMany({ where: { id: primaryContactId } });
	await db.product.deleteMany({ where: { id: productId } });
	await db.marketingEvent.deleteMany({ where: { name: marketingEventName } });
	await db.pipeline.deleteMany({ where: { name: generatedPipelineName } });
	await db.pipeline.deleteMany({ where: { name: guardPipelineName } });
	await db.pipeline.deleteMany({ where: { name: handoverPipelineName } });
	await db.pipeline.deleteMany({ where: { id: pipelineId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await cleanup();
	await db.user.create({
		data: {
			id: userId,
			name: "CRM Foundations Test Rep",
			email: `${userId}@example.test`,
		},
	});
	await db.company.create({
		data: { id: companyId, name: "CRM Foundations Test Company" },
	});
	await db.pipeline.create({
		data: {
			id: pipelineId,
			name: "CRM Foundations Test Pipeline",
			stages: {
				create: [
					{ id: openStageId, name: "Discovery", position: 0, type: "OPEN" },
					{ id: lostStageId, name: "Lost", position: 1, type: "LOST" },
				],
			},
		},
	});
	await db.deal.create({
		data: {
			id: dealId,
			name: "CRM Foundations Test Deal",
			companyId,
			ownerId: userId,
			pipelineId,
			stageId: openStageId,
		},
	});

	const stamp = new ActivityStampService(db);
	deals = new DealsService(db, stamp);
	activities = new ActivitiesService(db, stamp);
	pipelines = new PipelinesService(db);
	marketing = new MarketingService(db);
	contacts = new ContactsService(
		db,
		{} as ConstructorParameters<typeof ContactsService>[1],
		{} as ConstructorParameters<typeof ContactsService>[2],
		{} as ConstructorParameters<typeof ContactsService>[3],
	);
});

afterAll(cleanup);

describe("configurable CRM foundations", () => {
	it("creates a second pipeline and persists a complete stage reorder", async () => {
		const created = await pipelines.create(generatedPipelineName);
		const original = await db.pipelineStage.findMany({
			where: { pipelineId: created.id },
			orderBy: { position: "asc" },
		});
		expect(original.map((stage) => stage.name)).toEqual([
			"Demo booked",
			"Qualified to buy",
			"Decision maker in",
			"Contract sent",
			"Closed won",
			"Closed lost",
			"Unqualified",
		]);

		const reversed = original.map((stage) => stage.id).reverse();
		await pipelines.reorderStages(created.id, reversed);
		const reordered = await db.pipelineStage.findMany({
			where: { pipelineId: created.id },
			orderBy: { position: "asc" },
			select: { id: true },
		});
		expect(reordered.map((stage) => stage.id)).toEqual(reversed);

		const generatedDeal = await deals.create({
			name: "CRM Foundations First Open Stage",
			companyId,
			ownerId: userId,
			pipelineId: created.id,
		});
		generatedDealId = generatedDeal.id;
		const generatedDetails = await deals.byId(generatedDeal.id);
		expect(generatedDetails.stage.type).toBe("OPEN");
		expect(generatedDetails.stage.name).toBe("Contract sent");
		const mismatchedPipeline = Promise.resolve(
			db.deal.update({
				where: { id: generatedDeal.id },
				data: { pipelineId },
			}),
		);
		expect(mismatchedPipeline).rejects.toMatchObject({ code: "P2003" });
		await deals.archive(generatedDeal.id);
	});

	it("will not move a deal into an archived pipeline", async () => {
		const pipeline = await db.pipeline.findFirstOrThrow({
			where: { name: generatedPipelineName },
			include: { stages: true },
		});
		await db.pipeline.update({
			where: { id: pipeline.id },
			data: { archivedAt: new Date() },
		});
		const stage = pipeline.stages[0];
		if (!stage) throw new Error("expected a generated stage");

		expect(
			deals.setStage({ id: dealId, stageId: stage.id }, userId),
		).rejects.toThrow("No stage");
		expect(
			deals.setStage({ id: generatedDealId, stageId: openStageId }, userId),
		).rejects.toThrow("Restore this deal before changing its stage");
		expect(deals.restore(generatedDealId)).rejects.toThrow(
			"Restore this deal's pipeline",
		);
		const archivedDeals = await deals.archived();
		expect(archivedDeals.map((deal) => deal.id)).toContain(generatedDealId);
	});

	it("publishes immutable handovers and enforces them when a deal moves", async () => {
		const pipeline = await pipelines.create(handoverPipelineName);
		const stages = await db.pipelineStage.findMany({
			where: { pipelineId: pipeline.id },
			orderBy: { position: "asc" },
		});
		const first = stages[0];
		const second = stages[1];
		const won = stages.find((stage) => stage.type === PipelineStageType.WON);
		const lost = stages.find((stage) => stage.type === PipelineStageType.LOST);
		if (!first || !second || !won || !lost)
			throw new Error("expected pipeline stages");

		const blueprint = {
			type: "full_bowtie" as const,
			stages: stages.map((stage) => ({
				key: stage.key,
				position: stage.position,
				type: stage.type,
				semanticPhase: stage.semanticPhase,
				allowedRoles: [
					...(stage === first ? ["sdr", "closer"] : []),
					...(stage === second ? ["closer"] : []),
					...(stage !== first && stage !== second ? ["account_manager"] : []),
				],
				responsibleRole:
					stage === first
						? "sdr"
						: stage === second
							? "closer"
							: "account_manager",
				...(stage === first ? { allowedNextStages: [second.key] } : {}),
			})),
			handovers: [
				{
					fromStage: first.key,
					toStage: second.key,
					fromRole: "sdr",
					toRole: "closer",
					acceptanceRequired: true,
					acceptanceSlaMinutes: 60,
					assignmentStrategy: "role_default" as const,
				},
			],
		};
		await pipelines.publishBlueprint({ id: pipeline.id, blueprint });
		const versions = await db.pipelineBlueprintVersion.findMany({
			where: { pipelineId: pipeline.id },
			orderBy: { version: "asc" },
			include: { handoverRules: true },
		});
		expect(versions.map((version) => version.version)).toEqual([1, 2]);
		expect(versions[1]?.handoverRules[0]).toMatchObject({
			fromRoleKey: "sdr",
			toRoleKey: "closer",
			acceptanceRequired: true,
			acceptanceSlaMinutes: 60,
			assignmentStrategy: "role_default",
		});

		const deal = await deals.create({
			name: "CRM Foundations Handover Deal",
			companyId,
			ownerId: userId,
			pipelineId: pipeline.id,
		});
		expect(
			deals.setStage({ id: deal.id, stageId: won.id }, userId, "sdr"),
		).rejects.toThrow("not allowed from the current stage");
		expect(
			deals.setStage({ id: deal.id, stageId: second.id }, userId, "sdr"),
		).rejects.toThrow("explicitly accepted");
		expect(
			deals.setStage(
				{ id: deal.id, stageId: second.id, handoverAccepted: true },
				userId,
				"closer",
			),
		).rejects.toThrow("does not own this handover");
		await deals.setStage(
			{ id: deal.id, stageId: second.id, handoverAccepted: true },
			userId,
			"sdr",
		);

		await deals.archive(deal.id);
		await pipelines.archive(pipeline.id);
	});

	it("keeps at least one open stage in every active pipeline", async () => {
		const pipeline = await pipelines.create(guardPipelineName);
		const stages = await db.pipelineStage.findMany({
			where: { pipelineId: pipeline.id },
			orderBy: { position: "asc" },
		});
		const openStages = stages.filter((stage) => stage.type === "OPEN");
		const lastOpen = openStages.at(-1);
		if (!lastOpen) throw new Error("expected an open stage");
		for (const stage of openStages.slice(0, -1)) {
			await pipelines.removeStage(stage.id);
		}

		expect(
			pipelines.updateStage({ id: lastOpen.id, type: "WON" }),
		).rejects.toThrow("at least one open stage");
		expect(pipelines.removeStage(lastOpen.id)).rejects.toThrow(
			"at least one open stage",
		);
	});

	it("enforces one default pipeline in Postgres", async () => {
		const attempt = Promise.resolve(
			db.pipeline.update({
				where: { id: pipelineId },
				data: { isDefault: true },
			}),
		);
		expect(attempt).rejects.toMatchObject({ code: "P2002" });
	});

	it("requires a reason for a losing stage and records the accepted move", async () => {
		expect(
			deals.setStage({ id: dealId, stageId: lostStageId }, userId),
		).rejects.toThrow("why it was lost or unqualified");

		await deals.setStage(
			{ id: dealId, stageId: lostStageId, closedReason: "Budget moved" },
			userId,
		);

		const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
		const firstClosedAt = deal.closedAt;
		const stageChange = await db.activity.findFirstOrThrow({
			where: { dealId, type: ActivityType.STAGE_CHANGE },
		});
		expect(deal.stageId).toBe(lostStageId);
		expect(deal.closedReason).toBe("Budget moved");
		expect(deal.closedAt).not.toBeNull();
		expect(stageChange.body).toBe("Budget moved");
		expect(stageChange.meta).toMatchObject({
			from: "Discovery",
			to: "Lost",
		});
		expect(
			pipelines.updateStage({ id: lostStageId, type: "WON" }),
		).rejects.toThrow("Move deals out");

		const explicitStage = await deals.list(
			dealListInput.parse({ status: "open", stage: lostStageId }),
		);
		expect(explicitStage.rows.map((row) => row.id)).toContain(dealId);

		const unqualified = await pipelines.createStage({
			pipelineId,
			name: "Unqualified",
			type: "UNQUALIFIED",
		});
		await deals.setStage(
			{
				id: dealId,
				stageId: unqualified.id,
				closedReason: "Not a fit",
			},
			userId,
		);
		const movedBetweenClosedStages = await db.deal.findUniqueOrThrow({
			where: { id: dealId },
		});
		expect(movedBetweenClosedStages.closedAt?.toISOString()).toBe(
			firstClosedAt?.toISOString(),
		);
		expect(
			await deals.setStage({ id: dealId, stageId: unqualified.id }, userId),
		).toMatchObject({ changed: false });
	});

	it("validates and stores SMS or WhatsApp as a message activity", async () => {
		expect(
			activityCreateInput.safeParse({
				type: ActivityType.MESSAGE,
				dealId,
				body: "Following up",
			}).success,
		).toBe(false);
		expect(
			activityCreateInput.safeParse({
				type: ActivityType.NOTE,
				dealId,
				body: "Not a marketing conversion",
				utmSource: "newsletter",
			}).success,
		).toBe(false);

		const input = activityCreateInput.parse({
			type: ActivityType.MESSAGE,
			dealId,
			body: "Following up",
			messageChannel: "WHATSAPP",
		});
		const entry = await activities.create(input, userId);

		expect(entry.type).toBe(ActivityType.MESSAGE);
		expect(entry.meta).toMatchObject({ channel: "WHATSAPP" });
		expect(entry.company?.id).toBe(companyId);
	});

	it("keeps event attribution and serializes partial date updates", async () => {
		const event = await marketing.createEvent({
			name: marketingEventName,
			startsAt: "2026-08-10T12:00:00.000Z",
			endsAt: "2026-08-10T14:00:00.000Z",
		});
		await Promise.all([
			marketing.updateEvent({
				id: event.id,
				startsAt: "2026-08-10T13:00:00.000Z",
			}),
			marketing.updateEvent({
				id: event.id,
				endsAt: "2026-08-10T15:00:00.000Z",
			}),
		]);
		const stored = await db.marketingEvent.findUniqueOrThrow({
			where: { id: event.id },
		});
		expect(stored.startsAt?.toISOString()).toBe("2026-08-10T13:00:00.000Z");
		expect(stored.endsAt?.toISOString()).toBe("2026-08-10T15:00:00.000Z");

		const entry = await activities.create(
			activityCreateInput.parse({
				type: ActivityType.EVENT_ATTENDANCE,
				dealId,
				marketingEventId: event.id,
				body: "Attended the roundtable",
				utmSource: "linkedin",
				utmCampaign: "roundtable",
			}),
			userId,
		);
		expect(entry.meta).toMatchObject({
			utmSource: "linkedin",
			utmCampaign: "roundtable",
		});
		expect(
			activityCreateInput.safeParse({
				type: ActivityType.NOTE,
				dealId,
				body: "Not attendance",
				marketingEventId: event.id,
			}).success,
		).toBe(false);
		await marketing.archiveEvent(event.id);
		expect(
			activities.create(
				activityCreateInput.parse({
					type: ActivityType.EVENT_ATTENDANCE,
					dealId,
					marketingEventId: event.id,
					body: "Late import",
				}),
				userId,
			),
		).rejects.toThrow("not active");
	});

	it("clears the primary contact when that contact is archived", async () => {
		await db.contact.create({
			data: {
				id: primaryContactId,
				firstName: "Primary",
				lastName: "Contact",
				companyId,
			},
		});
		await db.dealContact.create({
			data: { dealId, contactId: primaryContactId, role: "Primary" },
		});
		await db.company.update({
			where: { id: companyId },
			data: { primaryContactId },
		});

		await contacts.archive(primaryContactId);
		const archivedContacts = await contacts.archived();
		const company = await db.company.findUniqueOrThrow({
			where: { id: companyId },
			select: { primaryContactId: true },
		});
		expect(company.primaryContactId).toBeNull();
		expect(archivedContacts.map((contact) => contact.id)).toContain(
			primaryContactId,
		);
		const deal = await deals.byId(dealId);
		expect(deal.contacts.map((contact) => contact.id)).not.toContain(
			primaryContactId,
		);
	});

	it("marks a Kanban result that exceeds its explicit cap", async () => {
		await db.deal.createMany({
			data: Array.from({ length: 1001 }, (_, index) => ({
				id: `crm-foundations-board-${suffix}-${index}`,
				name: `Board deal ${index}`,
				companyId,
				ownerId: userId,
				pipelineId,
				stageId: openStageId,
			})),
		});
		const board = await deals.board({
			q: "",
			owner: "all",
			pipeline: pipelineId,
			closing: "all",
		});
		expect(board.truncated).toBe(true);
		expect(board.deals).toHaveLength(1000);
	});

	it("snapshots a product price and currency on the deal", async () => {
		await db.product.create({
			data: {
				id: productId,
				sku: `CRM-${suffix}`,
				name: "CRM Foundations Product",
				price: 125,
				currency: "BRL",
			},
		});
		await deals.addLineItem({ dealId, productId, quantity: 2 });
		await db.product.update({
			where: { id: productId },
			data: { price: 250, currency: "USD" },
		});

		const deal = await deals.byId(dealId);
		expect(deal.lineItems[0]).toMatchObject({
			sku: `CRM-${suffix}`,
			unitPriceCents: 12_500,
			currency: "BRL",
			quantity: 2,
		});
		expect(
			deals.addLineItem({ dealId: generatedDealId, productId, quantity: 1 }),
		).rejects.toThrow("Restore this deal before changing its products");
	});
});
