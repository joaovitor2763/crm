import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	AuditActorType,
	db,
	LeadSubmissionStatus,
} from "@crm/db";
import { AccessControlService } from "../src/access-control/access-control.service";
import {
	attributionEventInput,
	externalAttributionEventInput,
} from "../src/attribution/attribution.contracts";
import { AttributionService } from "../src/attribution/attribution.service";
import { FieldsService } from "../src/fields/fields.service";
import { RevenueAccountsService } from "../src/revenue-accounts/revenue-accounts.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `attribution-test-${suffix}`;
const companyId = `attribution-company-${suffix}`;
const contactId = `attribution-contact-${suffix}`;
const dealId = `attribution-deal-${suffix}`;
const accountId = `attribution-account-${suffix}`;
const activityId = `attribution-activity-${suffix}`;
const submissionId = `attribution-submission-${suffix}`;

let service: AttributionService;
let principal: Awaited<ReturnType<AccessControlService["forUser"]>>;
let pipelineId: string;
let stageId: string;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Attribution Test Admin",
			email: `${userId}@example.test`,
		},
	});
	await db.userAccess.create({
		data: {
			userId,
			roleId: "role-global-admin",
			primaryBusinessUnitId: "business-unit-default",
			primaryTeamId: "team-default",
		},
	});
	await db.businessUnitMembership.create({
		data: { userId, businessUnitId: "business-unit-default", type: "ADMIN" },
	});
	await db.teamMembership.create({
		data: { userId, teamId: "team-default", isLead: true },
	});

	const access = new AccessControlService(db);
	principal = await access.forUser(userId);
	const fields = new FieldsService(db, access);
	const accounts = new RevenueAccountsService(db, access, fields);
	service = new AttributionService(db, access, accounts);

	const pipeline = await db.pipeline.findFirst({
		where: { archivedAt: null },
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			stages: { orderBy: { position: "asc" }, select: { id: true } },
		},
	});
	if (!pipeline?.stages[0])
		throw new Error("The test database needs a pipeline.");
	pipelineId = pipeline.id;
	stageId = pipeline.stages[0].id;

	await db.company.create({
		data: { id: companyId, name: "Attribution Test Company" },
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: "Attribution",
			lastName: "Contact",
			companyId,
		},
	});
	await db.deal.create({
		data: {
			id: dealId,
			name: "Attribution Test Deal",
			companyId,
			ownerId: userId,
			pipelineId,
			stageId,
		},
	});
	await db.revenueAccount.create({
		data: {
			id: accountId,
			name: "Attribution Test Account",
			businessUnitId: "business-unit-default",
		},
	});
	await db.activity.create({
		data: {
			id: activityId,
			type: ActivityType.FORM_CONVERSION,
			subject: "Form conversion",
			occurredAt: new Date("2026-01-02T10:00:00.000Z"),
			businessUnitId: "business-unit-default",
			createdById: userId,
			companyId,
			contactId,
			meta: { utmSource: "activity-source", utmCampaign: "activity-campaign" },
		},
	});
	await db.leadSubmission.create({
		data: {
			id: submissionId,
			source: "landing-page",
			status: LeadSubmissionStatus.ACCEPTED,
			payload: { email: `${userId}@example.test` },
			normalizedPayload: {
				utmSource: "first-source",
				utmMedium: "paid",
			},
			businessUnitId: "business-unit-default",
			contactId,
			receivedByType: AuditActorType.USER,
			receivedById: userId,
		},
	});
});

afterAll(async () => {
	await db.domainEvent.deleteMany({
		where: { resource: "conversion-attribution", actorId: userId },
	});
	await db.conversionAttributionEvent.deleteMany({
		where: { entityId: { in: [contactId, companyId, dealId, accountId] } },
	});
	await db.activity.deleteMany({ where: { id: activityId } });
	await db.leadSubmission.deleteMany({ where: { id: submissionId } });
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.revenueAccount.deleteMany({ where: { id: accountId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.teamMembership.delete({
		where: { userId_teamId: { userId, teamId: "team-default" } },
	});
	await db.businessUnitMembership.delete({
		where: {
			userId_businessUnitId: {
				userId,
				businessUnitId: "business-unit-default",
			},
		},
	});
	await db.userAccess.delete({ where: { userId } });
	await db.user.delete({ where: { id: userId } });
});

describe("attribution conversion lineage", () => {
	it("records all ontology element kinds and emits a webhook event", async () => {
		const common = {
			channel: "paid-search",
			source: "google",
			conversionType: "PIPELINE_ENTRY",
			utmSource: "google",
			utmMedium: "cpc",
			pipelineId,
			pipelineStageId: stageId,
		};
		for (const [entityType, entityId] of [
			["CONTACT", contactId],
			["COMPANY", companyId],
			["DEAL", dealId],
			["REVENUE_ACCOUNT", accountId],
		] as const) {
			const event = await service.record(
				{
					...common,
					entityType,
					entityId,
					dealId: entityType === "DEAL" ? dealId : undefined,
					operationId: `${entityType}-${suffix}`,
				},
				principal,
			);
			expect(event.entityType).toBe(entityType);
			expect(event.operationId).toBe(`${entityType}-${suffix}`);
			const retry = await service.record(
				{
					...common,
					entityType,
					entityId,
					dealId: entityType === "DEAL" ? dealId : undefined,
					operationId: `${entityType}-${suffix}`,
				},
				principal,
			);
			expect(retry.id).toBe(event.id);
		}
		const outbox = await db.domainEvent.findMany({
			where: { resource: "conversion-attribution", actorId: userId },
			select: { eventKey: true },
		});
		expect(outbox).toHaveLength(4);
		expect(outbox.map((event) => event.eventKey)).toEqual(
			expect.arrayContaining([
				`revenue-conversion.recorded:CONTACT:${contactId}:CONTACT-${suffix}`,
				`revenue-conversion.recorded:COMPANY:${companyId}:COMPANY-${suffix}`,
				`revenue-conversion.recorded:DEAL:${dealId}:DEAL-${suffix}`,
				`revenue-conversion.recorded:REVENUE_ACCOUNT:${accountId}:REVENUE_ACCOUNT-${suffix}`,
			]),
		);
	});

	it("projects first/current touch without overwriting recurring sources", async () => {
		const first = await service.record(
			{
				entityType: "CONTACT",
				entityId: contactId,
				channel: "organic",
				source: "community",
				conversionType: "FIRST_TOUCH",
				occurredAt: "2025-12-01T10:00:00.000Z",
				operationId: `first-${suffix}`,
			},
			principal,
		);
		const current = await service.record(
			{
				entityType: "CONTACT",
				entityId: contactId,
				channel: "partner",
				source: "referral",
				conversionType: "CURRENT_CONVERSION",
				occurredAt: "2030-02-01T10:00:00.000Z",
				operationId: `current-${suffix}`,
			},
			principal,
		);
		await service.record(
			{
				entityType: "CONTACT",
				entityId: contactId,
				conversionType: "TOUCH",
				occurredAt: "2026-01-15T10:00:00.000Z",
				operationId: `touch-${suffix}`,
			},
			principal,
		);
		const projection = await service.projection(
			{
				entityType: "CONTACT",
				entityId: contactId,
				includeEvents: true,
				limit: 100,
			},
			principal,
		);
		expect(projection.firstTouch?.id).toBe(
			projection.events.find((event) => event.id === first.id)?.id,
		);
		expect(projection.currentTouch?.id).toBe(current.id);
		expect(projection.currentConversion?.id).toBe(current.id);
		expect(projection.sourceHistory).toEqual(
			expect.arrayContaining([
				"community",
				"landing-page",
				"google",
				"referral",
			]),
		);
		expect(projection.conversionCount).toBe(
			projection.events.filter((event) => event.conversionType !== "TOUCH")
				.length,
		);
		expect(projection.touchCount).toBe(
			projection.events.filter((event) => event.conversionType === "TOUCH")
				.length,
		);
		expect(projection.pipelineEntryCount).toBeGreaterThanOrEqual(0);
		expect(projection.events.some((event) => event.origin === "ACTIVITY")).toBe(
			true,
		);
		expect(
			projection.events.some((event) => event.origin === "LEAD_SUBMISSION"),
		).toBe(true);
	});

	it("requires operation ids for external records", () => {
		const input = {
			entityType: "CONTACT" as const,
			entityId: contactId,
			conversionType: "EXTERNAL",
		};
		expect(attributionEventInput.safeParse(input).success).toBe(true);
		expect(externalAttributionEventInput.safeParse(input).success).toBe(false);
	});

	it("retains a stable tombstone when a subject is hard-deleted", async () => {
		const event = await service.record(
			{
				entityType: "CONTACT",
				entityId: contactId,
				conversionType: "TOMBSTONE_CHECK",
				operationId: `tombstone-${suffix}`,
			},
			principal,
		);

		await db.contact.delete({ where: { id: contactId } });
		const retained = await db.conversionAttributionEvent.findUnique({
			where: { id: event.id },
			select: { entityType: true, entityId: true, contactId: true },
		});

		expect(retained).toEqual({
			entityType: "CONTACT",
			entityId: contactId,
			contactId: null,
		});
	});
});
