import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db, EmailDirection } from "@crm/db";
import { readCompanyHistory, readDealHistory } from "../agent/lib/accounts";

/**
 * The account reads, against a real database.
 *
 * These exist because of one sentence the agent said to a rep: "I don't have a
 * tool that lists contacts by company." The assertion that matters in here is
 * not the shape of the payload — it is that a company read comes back holding
 * the **ids** of the people at it, because that is the difference between the
 * agent answering and the agent asking the human to do a join.
 *
 * A real Postgres rather than a mock, for the same reason `facts` is: the
 * joins are the behaviour. A stubbed Prisma would happily return contacts for
 * a thread filter that matches nothing in practice.
 */

const suffix = process.env.TEST_RUN_ID ?? "accounts-spec";
const domain = `fernhill-${suffix}.test`;

let companyId: string;
let dealId: string;
let paulaId: string;
let placeholderId: string;
let userId: string;

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const daysAhead = (days: number) => new Date(Date.now() + days * 86_400_000);

beforeAll(async () => {
	await cleanup();

	// Better Auth mints user ids, so the column has no database default.
	const user = await db.user.create({
		data: {
			id: `user-${suffix}`,
			name: "Rep One",
			email: `rep.${suffix}@example.test`,
			emailVerified: true,
		},
		select: { id: true },
	});
	userId = user.id;

	const company = await db.company.create({
		data: {
			name: `Fernhill Systems ${suffix}`,
			domain,
			industry: "Security software",
			lastActivityAt: daysAgo(1),
		},
		select: { id: true },
	});
	companyId = company.id;

	const paula = await db.contact.create({
		data: {
			firstName: "Paula",
			lastName: "Marchetti",
			title: "Growth Specialist",
			email: `paula.marchetti@${domain}`,
			companyId,
			lastActivityAt: daysAgo(1),
		},
		select: { id: true },
	});
	paulaId = paula.id;

	// Named after their own address, which is what `needsIdentity` reports.
	const placeholder = await db.contact.create({
		data: {
			firstName: "Tsomerville",
			lastName: null,
			email: `tsomerville@${domain}`,
			companyId,
			lastActivityAt: daysAgo(30),
		},
		select: { id: true },
	});
	placeholderId = placeholder.id;

	const deal = await db.deal.create({
		data: {
			name: `Fernhill platform ${suffix}`,
			companyId,
			ownerId: userId,
			pipelineId: "default-pipeline",
			stageId: "default-stage-contract-sent",
			stageChangedAt: daysAgo(42),
			amount: 48_000,
			currency: "USD",
			expectedCloseDate: daysAhead(14),
			lastActivityAt: daysAgo(3),
			contacts: { create: [{ contactId: paulaId, role: "Champion" }] },
		},
		select: { id: true },
	});
	dealId = deal.id;

	await db.activity.createMany({
		data: [
			{
				type: ActivityType.STAGE_CHANGE,
				subject: "Stage changed",
				companyId,
				dealId,
				createdById: userId,
				createdAt: daysAgo(60),
				meta: { from: "DEMO_BOOKED", to: "QUALIFIED_TO_BUY" },
			},
			{
				type: ActivityType.STAGE_CHANGE,
				subject: "Stage changed",
				companyId,
				dealId,
				createdById: userId,
				createdAt: daysAgo(42),
				meta: { from: "QUALIFIED_TO_BUY", to: "CONTRACT_SENT" },
			},
			{
				type: ActivityType.NOTE,
				subject: "Pricing pushback",
				body: "They want the security review done before signing.",
				occurredAt: daysAgo(5),
				companyId,
				dealId,
				createdById: userId,
			},
			// A projection of an email. It must not come back as a note as well.
			{
				type: ActivityType.EMAIL,
				subject: "Re: Contract",
				companyId,
				dealId,
				createdById: userId,
			},
		],
	});

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `<root.${suffix}@example.test>`,
			subject: "Re: Contract",
			companyId,
			contactId: paulaId,
			firstMessageAt: daysAgo(9),
			lastMessageAt: daysAgo(3),
			messageCount: 2,
		},
		select: { id: true },
	});

	await db.emailMessage.createMany({
		data: [
			{
				threadId: thread.id,
				rfcMessageId: `<out.${suffix}@example.test>`,
				direction: EmailDirection.OUTBOUND,
				fromEmail: `rep.${suffix}@example.test`,
				recipients: [],
				subject: "Contract",
				body: "Sending the paperwork over.",
				sentAt: daysAgo(9),
			},
			{
				threadId: thread.id,
				rfcMessageId: `<in.${suffix}@example.test>`,
				direction: EmailDirection.INBOUND,
				fromEmail: `paula.marchetti@${domain}`,
				fromName: "Paula Marchetti",
				recipients: [],
				subject: "Re: Contract",
				body: "Thanks — Paula Marchetti, Growth Specialist, Fernhill.",
				sentAt: daysAgo(3),
			},
		],
	});

	await db.calendarEvent.create({
		data: {
			iCalUid: `event.${suffix}@example.test`,
			originalStartTime: daysAhead(4),
			title: "Security review",
			startsAt: daysAhead(4),
			endsAt: daysAhead(4),
			status: "confirmed",
			companyId,
			contactId: paulaId,
			attendees: {
				create: [
					{ email: `paula.marchetti@${domain}`, name: "Paula Marchetti" },
				],
			},
		},
	});
});

afterAll(cleanup);

async function cleanup(): Promise<void> {
	const company = await db.company.findFirst({
		where: { domain },
		select: { id: true },
	});

	if (company) {
		await db.activity.deleteMany({ where: { companyId: company.id } });
		await db.calendarEvent.deleteMany({ where: { companyId: company.id } });
		await db.emailThread.deleteMany({ where: { companyId: company.id } });
		await db.deal.deleteMany({ where: { companyId: company.id } });
		await db.contact.deleteMany({ where: { companyId: company.id } });
		await db.company.delete({ where: { id: company.id } });
	}

	await db.user.deleteMany({ where: { email: `rep.${suffix}@example.test` } });
}

describe("readCompanyHistory", () => {
	it("names every contact at the company, with their id", async () => {
		const history = await readCompanyHistory(companyId);

		// The whole reason this function exists: the ids are in the payload, so
		// the agent never has to ask a rep for one.
		expect(history?.people.map((person) => person.id).sort()).toEqual(
			[paulaId, placeholderId].sort(),
		);
		expect(history?.people.find((person) => person.id === paulaId)?.title).toBe(
			"Growth Specialist",
		);
	});

	it("flags a contact still named after their email address", async () => {
		const history = await readCompanyHistory(companyId);
		const people = Object.fromEntries(
			(history?.people ?? []).map((person) => [
				person.id,
				person.needsIdentity,
			]),
		);

		expect(people[placeholderId]).toBe(true);
		expect(people[paulaId]).toBe(false);
	});

	it("returns the deals with stage, value and who is on them", async () => {
		const history = await readCompanyHistory(companyId);
		const deal = history?.deals.find((row) => row.id === dealId);

		expect(deal?.stage).toBe("Contract sent");
		expect(deal?.open).toBe(true);
		expect(deal?.amount).toBe(48_000);
		expect(deal?.contacts).toEqual([
			{ id: paulaId, name: "Paula Marchetti", role: "Champion" },
		]);
		expect(history?.stats.openDeals).toBe(1);
	});

	it("reads the correspondence and knows they replied", async () => {
		const history = await readCompanyHistory(companyId);

		expect(history?.threads[0]?.subject).toBe("Re: Contract");
		expect(history?.threads[0]?.contact?.id).toBe(paulaId);
		// Bodies, not snippets — a signature block is the best title evidence
		// there is, and it only exists in the body.
		expect(history?.threads[0]?.messages[0]?.body).toContain(
			"Growth Specialist",
		);
		expect(history?.stats.theyReplied).toBe(true);
		expect(history?.stats.lastReplyFrom).toBe("Paula Marchetti");
		expect(history?.stats.nextMeetingAt).not.toBeNull();
	});

	it("leaves email and meeting projections out of the notes", async () => {
		const history = await readCompanyHistory(companyId);

		expect(history?.notes.map((note) => note.subject)).toEqual([
			"Pricing pushback",
		]);
	});

	it("returns null for a company that does not exist", async () => {
		expect(await readCompanyHistory("nope")).toBeNull();
	});
});

describe("readDealHistory", () => {
	it("reports the stage clock, not just the stage", async () => {
		const history = await readDealHistory(dealId);

		expect(history?.deal.stage).toBe("Contract sent");
		expect(history?.deal.open).toBe(true);
		// Six weeks in contract-sent is the answer to "where does this stand",
		// and the stage field alone cannot say it.
		expect(history?.deal.daysInStage).toBeGreaterThanOrEqual(41);
	});

	it("returns every stage it moved through, oldest first", async () => {
		const history = await readDealHistory(dealId);

		expect(history?.stageHistory.map((change) => change.to)).toEqual([
			"QUALIFIED_TO_BUY",
			"CONTRACT_SENT",
		]);
	});

	it("names who is on it, with ids and roles", async () => {
		const history = await readDealHistory(dealId);

		expect(history?.people).toEqual([
			{
				id: paulaId,
				name: "Paula Marchetti",
				title: "Growth Specialist",
				email: `paula.marchetti@${domain}`,
				role: "Champion",
			},
		]);
		expect(history?.company.id).toBe(companyId);
	});

	it("says the correspondence is the account's, not the deal's", async () => {
		const history = await readDealHistory(dealId);

		expect(history?.threads).toHaveLength(1);
		expect(history?.stats.theyReplied).toBe(true);
		expect(history?.note).toContain("never against a deal");
	});

	it("returns null for a deal that does not exist", async () => {
		expect(await readDealHistory("nope")).toBeNull();
	});
});
