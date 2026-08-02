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
const stakeholderDomain = `stakeholder-${suffix}.test`;

let companyId: string;
let stakeholderCompanyId: string;
let dealId: string;
let paulaId: string;
let placeholderId: string;
let hiddenContactId: string;
let crossCompanyContactId: string;
let hiddenDealId: string;
let userId: string;

const visibleUnitId = "business-unit-default";
const visibleTeamId = "team-default";
const hiddenUnitId = `unit-hidden-${suffix}`;
const hiddenTeamId = `team-hidden-${suffix}`;

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

	await db.businessUnit.create({
		data: {
			id: hiddenUnitId,
			key: hiddenUnitId,
			name: `Hidden unit ${suffix}`,
		},
	});
	await db.businessUnitClosure.create({
		data: { ancestorId: hiddenUnitId, descendantId: hiddenUnitId, depth: 0 },
	});
	await db.team.create({
		data: {
			id: hiddenTeamId,
			businessUnitId: hiddenUnitId,
			key: hiddenTeamId,
			name: `Hidden team ${suffix}`,
		},
	});

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

	const stakeholderCompany = await db.company.create({
		data: {
			name: `Stakeholder Company ${suffix}`,
			domain: stakeholderDomain,
			industry: "Security software",
		},
		select: { id: true },
	});
	stakeholderCompanyId = stakeholderCompany.id;

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
			businessUnitId: visibleUnitId,
			teamId: visibleTeamId,
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

	const hiddenContact = await db.contact.create({
		data: {
			firstName: "Hidden",
			lastName: "Colleague",
			email: `hidden.colleague@${domain}`,
			companyId,
			lastActivityAt: daysAgo(2),
		},
		select: { id: true },
	});
	hiddenContactId = hiddenContact.id;
	await db.dealContact.create({
		data: { dealId, contactId: hiddenContactId, role: "Observer" },
	});

	const crossCompanyContact = await db.contact.create({
		data: {
			firstName: "Casey",
			lastName: "Stakeholder",
			email: `casey.stakeholder@${stakeholderDomain}`,
			companyId: stakeholderCompanyId,
			lastActivityAt: daysAgo(4),
		},
		select: { id: true },
	});
	crossCompanyContactId = crossCompanyContact.id;
	await db.dealContact.create({
		data: { dealId, contactId: crossCompanyContactId, role: "Partner" },
	});

	await db.contactBusinessUnitState.createMany({
		data: [
			{
				id: `contact-state-visible-paula-${suffix}`,
				contactId: paulaId,
				businessUnitId: visibleUnitId,
				teamId: visibleTeamId,
			},
			{
				id: `contact-state-visible-placeholder-${suffix}`,
				contactId: placeholderId,
				businessUnitId: visibleUnitId,
				teamId: visibleTeamId,
			},
			{
				id: `contact-state-hidden-${suffix}`,
				contactId: hiddenContactId,
				businessUnitId: hiddenUnitId,
				teamId: hiddenTeamId,
			},
			{
				id: `contact-state-cross-company-${suffix}`,
				contactId: crossCompanyContactId,
				businessUnitId: visibleUnitId,
				teamId: visibleTeamId,
			},
		],
	});

	const hiddenDeal = await db.deal.create({
		data: {
			name: `Hidden platform ${suffix}`,
			companyId,
			ownerId: userId,
			businessUnitId: hiddenUnitId,
			teamId: hiddenTeamId,
			pipelineId: "default-pipeline",
			stageId: "default-stage-contract-sent",
			stageChangedAt: daysAgo(8),
			amount: 12_000,
			currency: "USD",
			contacts: { create: [{ contactId: hiddenContactId, role: "Observer" }] },
		},
		select: { id: true },
	});
	hiddenDealId = hiddenDeal.id;

	await db.companyBusinessUnitState.create({
		data: {
			id: `company-state-visible-${suffix}`,
			companyId,
			businessUnitId: visibleUnitId,
			teamId: visibleTeamId,
		},
	});

	await db.activity.createMany({
		data: [
			{
				type: ActivityType.STAGE_CHANGE,
				subject: "Stage changed",
				companyId,
				dealId,
				createdById: userId,
				createdAt: daysAgo(60),
				teamId: visibleTeamId,
				meta: { from: "DEMO_BOOKED", to: "QUALIFIED_TO_BUY" },
			},
			{
				type: ActivityType.STAGE_CHANGE,
				subject: "Stage changed",
				companyId,
				dealId,
				createdById: userId,
				createdAt: daysAgo(42),
				teamId: visibleTeamId,
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
				businessUnitId: visibleUnitId,
				teamId: visibleTeamId,
			},
			// A projection of an email. It must not come back as a note as well.
			{
				type: ActivityType.EMAIL,
				subject: "Re: Contract",
				companyId,
				dealId,
				createdById: userId,
			},
			{
				type: ActivityType.NOTE,
				subject: "Hidden note",
				body: "This note belongs to a different team.",
				occurredAt: daysAgo(2),
				companyId,
				contactId: hiddenContactId,
				dealId,
				createdById: userId,
				businessUnitId: hiddenUnitId,
				teamId: hiddenTeamId,
			},
			{
				type: ActivityType.NOTE,
				subject: "Hidden deal note",
				body: "This deal belongs to a different team.",
				occurredAt: daysAgo(1),
				companyId,
				contactId: hiddenContactId,
				dealId: hiddenDealId,
				createdById: userId,
				businessUnitId: hiddenUnitId,
				teamId: hiddenTeamId,
			},
			{
				type: ActivityType.NOTE,
				subject: "Hidden placement note",
				body: "This visible deal has activity in a hidden team.",
				occurredAt: daysAgo(4),
				companyId,
				contactId: paulaId,
				dealId,
				createdById: userId,
				businessUnitId: hiddenUnitId,
				teamId: hiddenTeamId,
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

	const stakeholderThread = await db.emailThread.create({
		data: {
			rootMessageId: `<stakeholder.${suffix}@example.test>`,
			subject: "Stakeholder thread",
			companyId: stakeholderCompanyId,
			contactId: crossCompanyContactId,
			firstMessageAt: daysAgo(5),
			lastMessageAt: daysAgo(4),
			messageCount: 1,
		},
		select: { id: true },
	});
	await db.emailMessage.create({
		data: {
			threadId: stakeholderThread.id,
			rfcMessageId: `<stakeholder-message.${suffix}@example.test>`,
			direction: EmailDirection.INBOUND,
			fromEmail: `casey.stakeholder@${stakeholderDomain}`,
			fromName: "Casey Stakeholder",
			recipients: [],
			subject: "Stakeholder thread",
			body: "Casey is coordinating the security review.",
			sentAt: daysAgo(4),
		},
	});

	const hiddenThread = await db.emailThread.create({
		data: {
			rootMessageId: `<hidden.${suffix}@example.test>`,
			subject: "Hidden thread",
			companyId,
			contactId: hiddenContactId,
			firstMessageAt: daysAgo(2),
			lastMessageAt: daysAgo(2),
			messageCount: 1,
		},
		select: { id: true },
	});
	await db.emailMessage.create({
		data: {
			threadId: hiddenThread.id,
			rfcMessageId: `<hidden-message.${suffix}@example.test>`,
			direction: EmailDirection.INBOUND,
			fromEmail: `hidden.colleague@${domain}`,
			fromName: "Hidden Colleague",
			recipients: [],
			subject: "Hidden thread",
			body: "Private message from the hidden team.",
			sentAt: daysAgo(2),
		},
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

	await db.calendarEvent.create({
		data: {
			iCalUid: `stakeholder-event.${suffix}@example.test`,
			originalStartTime: daysAhead(2),
			title: "Stakeholder review",
			startsAt: daysAhead(2),
			endsAt: daysAhead(2),
			status: "confirmed",
			companyId: stakeholderCompanyId,
			contactId: crossCompanyContactId,
			attendees: {
				create: [
					{
						email: `casey.stakeholder@${stakeholderDomain}`,
						name: "Casey Stakeholder",
						contactId: crossCompanyContactId,
					},
				],
			},
		},
	});

	await db.calendarEvent.create({
		data: {
			iCalUid: `hidden-event.${suffix}@example.test`,
			originalStartTime: daysAhead(5),
			title: "Hidden meeting",
			startsAt: daysAhead(5),
			endsAt: daysAhead(5),
			status: "confirmed",
			companyId,
			contactId: hiddenContactId,
			attendees: {
				create: [
					{
						email: `hidden.colleague@${domain}`,
						name: "Hidden Colleague",
						contactId: hiddenContactId,
					},
				],
			},
		},
	});
});

afterAll(cleanup);

async function cleanup(): Promise<void> {
	const companies = await db.company.findMany({
		where: { domain: { in: [domain, stakeholderDomain] } },
		select: { id: true },
	});

	for (const company of companies) {
		await db.activity.deleteMany({ where: { companyId: company.id } });
		await db.calendarEvent.deleteMany({ where: { companyId: company.id } });
		await db.emailThread.deleteMany({ where: { companyId: company.id } });
		await db.deal.deleteMany({ where: { companyId: company.id } });
		await db.contact.deleteMany({ where: { companyId: company.id } });
		await db.company.delete({ where: { id: company.id } });
	}

	await db.team.deleteMany({ where: { id: hiddenTeamId } });
	await db.businessUnitClosure.deleteMany({
		where: {
			OR: [{ ancestorId: hiddenUnitId }, { descendantId: hiddenUnitId }],
		},
	});
	await db.businessUnit.deleteMany({ where: { id: hiddenUnitId } });

	await db.user.deleteMany({ where: { email: `rep.${suffix}@example.test` } });
}

const visibleContactScope = {
	unitStates: {
		some: { businessUnitId: visibleUnitId, teamId: visibleTeamId },
	},
};
const visibleDealScope = {
	businessUnitId: visibleUnitId,
	teamId: visibleTeamId,
};
const visibleActivityScope = {
	businessUnitId: visibleUnitId,
	teamId: visibleTeamId,
};

describe("readCompanyHistory", () => {
	it("names every contact at the company, with their id", async () => {
		const history = await readCompanyHistory(companyId);

		// The whole reason this function exists: the ids are in the payload, so
		// the agent never has to ask a rep for one.
		expect(history?.people.map((person) => person.id).sort()).toEqual(
			[paulaId, placeholderId, hiddenContactId].sort(),
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
			{ id: hiddenContactId, name: "Hidden Colleague", role: "Observer" },
			{ id: crossCompanyContactId, name: "Casey Stakeholder", role: "Partner" },
		]);
		expect(history?.stats.openDeals).toBe(2);
	});

	it("reads the correspondence and knows they replied", async () => {
		const history = await readCompanyHistory(companyId);
		const thread = history?.threads.find(
			(candidate) => candidate.subject === "Re: Contract",
		);

		expect(thread?.subject).toBe("Re: Contract");
		expect(thread?.contact?.id).toBe(paulaId);
		// Bodies, not snippets — a signature block is the best title evidence
		// there is, and it only exists in the body.
		expect(thread?.messages[0]?.body).toContain("Growth Specialist");
		expect(history?.stats.theyReplied).toBe(true);
		expect(history?.stats.nextMeetingAt).not.toBeNull();
	});

	it("leaves email and meeting projections out of the notes", async () => {
		const history = await readCompanyHistory(companyId);
		const subjects = history?.notes.map((note) => note.subject) ?? [];

		expect(subjects).toContain("Pricing pushback");
		expect(subjects).not.toContain("Re: Contract");
	});

	it("returns null for a company that does not exist", async () => {
		expect(await readCompanyHistory("nope")).toBeNull();
	});

	it("keeps company history inside the contact and deal scope", async () => {
		const history = await readCompanyHistory(companyId, {
			threads: 20,
			contactWhere: visibleContactScope,
			dealWhere: visibleDealScope,
			activityWhere: visibleActivityScope,
		});

		expect(history?.people.map((person) => person.id).sort()).toEqual(
			[paulaId, placeholderId].sort(),
		);
		expect(history?.deals.map((deal) => deal.id)).toEqual([dealId]);
		expect(history?.threads.map((thread) => thread.subject)).toEqual([
			"Re: Contract",
		]);
		expect(history?.meetings.map((meeting) => meeting.title)).toEqual([
			"Security review",
		]);
		expect(history?.notes.map((note) => note.subject)).toEqual([
			"Pricing pushback",
		]);
		expect(history?.stats).toMatchObject({
			people: 2,
			emails: 2,
			meetings: 1,
		});
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

		expect(history?.people).toHaveLength(3);
		expect(history?.people).toEqual(
			expect.arrayContaining([
				{
					id: paulaId,
					name: "Paula Marchetti",
					title: "Growth Specialist",
					email: `paula.marchetti@${domain}`,
					role: "Champion",
				},
				{
					id: hiddenContactId,
					name: "Hidden Colleague",
					title: null,
					email: `hidden.colleague@${domain}`,
					role: "Observer",
				},
				{
					id: crossCompanyContactId,
					name: "Casey Stakeholder",
					title: null,
					email: `casey.stakeholder@${stakeholderDomain}`,
					role: "Partner",
				},
			]),
		);
		expect(history?.company.id).toBe(companyId);
	});

	it("filters nested deal contacts with the contact scope", async () => {
		const history = await readDealHistory(dealId, {
			contactWhere: visibleContactScope,
		});

		expect(history?.people.map((person) => person.id)).toEqual([
			paulaId,
			crossCompanyContactId,
		]);
		expect(history?.people.map((person) => person.id)).not.toContain(
			hiddenContactId,
		);
	});

	it("includes visible cross-company stakeholder correspondence", async () => {
		const history = await readDealHistory(dealId, {
			threads: 20,
			contactWhere: visibleContactScope,
			activityWhere: visibleActivityScope,
		});

		expect(history?.threads.map((thread) => thread.subject)).toContain(
			"Stakeholder thread",
		);
		expect(history?.meetings.map((meeting) => meeting.title)).toContain(
			"Stakeholder review",
		);
		expect(history?.threads.map((thread) => thread.subject)).not.toContain(
			"Hidden thread",
		);
		expect(history?.meetings.map((meeting) => meeting.title)).not.toContain(
			"Hidden meeting",
		);
	});

	it("says the correspondence is the account's, not the deal's", async () => {
		const history = await readDealHistory(dealId);

		expect(
			history?.threads.some((thread) => thread.subject === "Re: Contract"),
		).toBe(true);
		expect(history?.stats.theyReplied).toBe(true);
		expect(history?.note).toContain("never against a deal");
	});

	it("returns null for a deal that does not exist", async () => {
		expect(await readDealHistory("nope")).toBeNull();
	});

	it("does not fetch a deal outside the caller's deal scope", async () => {
		expect(
			await readDealHistory(hiddenDealId, {
				dealWhere: visibleDealScope,
			}),
		).toBeNull();
	});

	it("does not expose a deal or its account history outside scope", async () => {
		const history = await readDealHistory(dealId, {
			threads: 20,
			contactWhere: visibleContactScope,
			dealWhere: visibleDealScope,
			activityWhere: visibleActivityScope,
		});

		expect(history?.people.map((person) => person.id)).toEqual([
			paulaId,
			crossCompanyContactId,
		]);
		expect(history?.threads.map((thread) => thread.subject)).toEqual([
			"Re: Contract",
			"Stakeholder thread",
		]);
		expect(history?.meetings.map((meeting) => meeting.title)).toEqual([
			"Security review",
			"Stakeholder review",
		]);
		expect(history?.threads.map((thread) => thread.subject)).not.toContain(
			"Hidden thread",
		);
		expect(history?.meetings.map((meeting) => meeting.title)).not.toContain(
			"Hidden meeting",
		);
		expect(history?.notes.map((note) => note.subject)).toEqual([
			"Pricing pushback",
		]);
		expect(
			await readDealHistory(hiddenDealId, {
				contactWhere: visibleContactScope,
				dealWhere: visibleDealScope,
			}),
		).toBeNull();
	});
});
