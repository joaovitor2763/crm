import { db } from "../src/client";
import { ActivityType, PipelineStageType } from "../src/generated/prisma/enums";

/**
 * A believable pipeline to develop against: real domains so the enrichment
 * agent has something to look up, deals spread across every stage, and tasks
 * that are genuinely overdue.
 *
 * Idempotent — companies key off `domain`, contacts off `email`, and deals off
 * a deterministic id — so re-running tops the data up rather than duplicating
 * it. Randomness comes from a seeded generator for the same reason: two runs
 * produce the same pipeline.
 *
 * Users are the exception. Better Auth owns them, and a row written here has no
 * Google account attached — but account linking is enabled for Google, so
 * signing in with a matching address adopts the row rather than creating a
 * second one. Real users are used when they exist; the placeholders below are
 * only created when the table is empty.
 */

// --- deterministic randomness -----------------------------------------------

/** mulberry32 — small, fast, and identical across runs. */
function makeRandom(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = makeRandom(20260731);

function pick<T>(items: readonly T[]): T {
	const item = items[Math.floor(random() * items.length)];
	if (item === undefined) throw new Error("pick() on an empty list");
	return item;
}

function chance(probability: number): boolean {
	return random() < probability;
}

function integer(min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

/** Negative is the past. */
function daysFromNow(days: number, jitterHours = 0): Date {
	const jitter = jitterHours
		? (random() - 0.5) * jitterHours * 60 * 60 * 1000
		: 0;
	return new Date(NOW + days * DAY_MS + jitter);
}

// --- source data ------------------------------------------------------------

const OWNERS = [
	{ name: "Ada Okafor", email: "ada@trycomp.ai" },
	{ name: "Marcus Lindqvist", email: "marcus@trycomp.ai" },
	{ name: "Priya Raman", email: "priya@trycomp.ai" },
] as const;

type SeedCompany = {
	name: string;
	domain: string;
	industry: string;
	city: string;
	country: string;
	countryCode: string;
};

const COMPANIES: readonly SeedCompany[] = [
	{
		name: "Stripe",
		domain: "stripe.com",
		industry: "Financial Services",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Linear",
		domain: "linear.app",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Vercel",
		domain: "vercel.com",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Ramp",
		domain: "ramp.com",
		industry: "Financial Services",
		city: "New York",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Notion",
		domain: "notion.so",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Monzo",
		domain: "monzo.com",
		industry: "Banking",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
	},
	{
		name: "Wise",
		domain: "wise.com",
		industry: "Financial Services",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
	},
	{
		name: "Personio",
		domain: "personio.com",
		industry: "Human Resources",
		city: "Munich",
		country: "Germany",
		countryCode: "DE",
	},
	{
		name: "Pennylane",
		domain: "pennylane.com",
		industry: "Accounting",
		city: "Paris",
		country: "France",
		countryCode: "FR",
	},
	{
		name: "Cal.com",
		domain: "cal.com",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Supabase",
		domain: "supabase.com",
		industry: "Software",
		city: "Singapore",
		country: "Singapore",
		countryCode: "SG",
	},
	{
		name: "Retool",
		domain: "retool.com",
		industry: "Software",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Deel",
		domain: "deel.com",
		industry: "Human Resources",
		city: "New York",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Mercury",
		domain: "mercury.com",
		industry: "Banking",
		city: "San Francisco",
		country: "United States",
		countryCode: "US",
	},
	{
		name: "Attio",
		domain: "attio.com",
		industry: "Software",
		city: "London",
		country: "United Kingdom",
		countryCode: "GB",
	},
];

const FIRST_NAMES = [
	"Amara",
	"Ben",
	"Chidi",
	"Dana",
	"Elias",
	"Farah",
	"Gus",
	"Hana",
	"Ines",
	"Jonas",
	"Kofi",
	"Lena",
	"Mateo",
	"Nadia",
	"Omar",
	"Pia",
	"Quinn",
	"Rosa",
	"Sami",
	"Tara",
	"Ugo",
	"Vera",
	"Wes",
	"Yuki",
] as const;

const LAST_NAMES = [
	"Adeyemi",
	"Bergström",
	"Chen",
	"Dubois",
	"Eriksen",
	"Fontaine",
	"Gupta",
	"Haddad",
	"Ivanova",
	"Jensen",
	"Kowalski",
	"Lombardi",
	"Moreau",
	"Nakamura",
	"Oyelaran",
	"Petrov",
	"Quintana",
	"Rossi",
	"Sørensen",
	"Takahashi",
] as const;

const TITLES = [
	"Head of Security",
	"CTO",
	"VP Engineering",
	"Compliance Manager",
	"Head of Legal",
	"Security Engineer",
	"COO",
	"IT Director",
	"Head of Platform",
	"Chief of Staff",
] as const;

const DEFAULT_PIPELINE_ID = "default-pipeline";
const OPEN_STAGES = [
	{
		id: "default-stage-demo-booked",
		name: "Demo booked",
		type: PipelineStageType.OPEN,
	},
	{
		id: "default-stage-qualified",
		name: "Qualified to buy",
		type: PipelineStageType.OPEN,
	},
	{
		id: "default-stage-decision-maker",
		name: "Decision maker in",
		type: PipelineStageType.OPEN,
	},
	{
		id: "default-stage-contract-sent",
		name: "Contract sent",
		type: PipelineStageType.OPEN,
	},
] as const;

const CLOSED_STAGES = [
	{
		id: "default-stage-closed-won",
		name: "Closed won",
		type: PipelineStageType.WON,
	},
	{
		id: "default-stage-closed-lost",
		name: "Closed lost",
		type: PipelineStageType.LOST,
	},
	{
		id: "default-stage-unqualified",
		name: "Unqualified",
		type: PipelineStageType.UNQUALIFIED,
	},
] as const;

const LOST_REASONS = [
	"Went with an incumbent vendor",
	"No budget this cycle",
	"Timeline slipped to next year",
	"Not a fit — no compliance requirement yet",
] as const;

const NOTE_BODIES = [
	"Ran through the SOC 2 timeline. They want evidence collection automated before the audit window opens.",
	"Procurement wants a security questionnaire back before they will look at pricing.",
	"Champion is keen, but the budget owner has not been in a call yet.",
	"They are evaluating us against two others. Differentiator is the agent, not the checklist.",
	"Asked for a reference in the same vertical. Following up with marketing.",
	"Pushed the decision to after their board meeting.",
] as const;

const CALL_SUBJECTS = [
	"Discovery call",
	"Technical deep dive",
	"Pricing discussion",
	"Follow-up call",
	"Security review",
] as const;

const TASK_SUBJECTS = [
	"Send the security questionnaire",
	"Share pricing proposal",
	"Book the technical deep dive",
	"Chase procurement",
	"Send SOC 2 report",
	"Introduce the implementation team",
] as const;

const MEETING_SUBJECTS = [
	"Product demo",
	"Onboarding walkthrough",
	"Quarterly check-in",
	"Stakeholder alignment",
] as const;

const EMAIL_SUBJECTS = [
	"Re: next steps",
	"Following up after the demo",
	"Pricing and terms",
	"Intro to your implementation lead",
] as const;

// --- helpers ----------------------------------------------------------------

/** Letters NFD cannot decompose into base + accent — they are their own letter. */
const TRANSLITERATIONS: Record<string, string> = {
	ø: "o",
	æ: "ae",
	œ: "oe",
	å: "a",
	ß: "ss",
	đ: "d",
	ł: "l",
	þ: "th",
};

function slug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[øæœåßđłþ]/g, (char) => TRANSLITERATIONS[char] ?? char)
			.normalize("NFD")
			// Combining marks left behind by NFD (é → e + ́ ).
			.replace(/\p{Mn}/gu, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
	);
}

// --- seed -------------------------------------------------------------------

async function seedOwners(): Promise<string[]> {
	const existing = await db.user.findMany({ select: { id: true } });

	if (existing.length > 0) {
		console.log(`Using ${existing.length} existing user(s) as owners.`);
		return existing.map((user) => user.id);
	}

	console.log("No users yet — creating placeholder sales reps.");
	const created = await Promise.all(
		OWNERS.map((owner) =>
			db.user.upsert({
				where: { email: owner.email },
				create: {
					id: `seed-${slug(owner.name)}`,
					name: owner.name,
					email: owner.email,
					emailVerified: true,
					updatedAt: new Date(),
				},
				update: {},
				select: { id: true },
			}),
		),
	);

	return created.map((user) => user.id);
}

async function seedCompanies(
	ownerIds: string[],
): Promise<{ id: string; name: string; domain: string }[]> {
	const companies = [];

	for (const company of COMPANIES) {
		const row = await db.company.upsert({
			where: { domain: company.domain },
			create: {
				name: company.name,
				domain: company.domain,
				website: `https://${company.domain}`,
				industry: company.industry,
				city: company.city,
				country: company.country,
				countryCode: company.countryCode,
				ownerId: pick(ownerIds),
				// Left PENDING on purpose: the logo, description and socials are the
				// agent's job, and this gives it real work on first run.
				createdAt: daysFromNow(-integer(30, 400), 12),
			},
			update: {},
			select: { id: true, name: true, domain: true },
		});
		companies.push({ ...row, domain: row.domain ?? company.domain });
	}

	return companies;
}

type SeededContact = { id: string; companyId: string };

async function seedContacts(
	companies: { id: string; domain: string }[],
	ownerIds: string[],
): Promise<SeededContact[]> {
	const contacts: SeededContact[] = [];
	const used = new Set<string>();

	// A handful per company: a primary contact plus the stakeholders a real deal
	// drags in.
	for (const company of companies) {
		for (let index = 0; index < integer(2, 4); index++) {
			const firstName = pick(FIRST_NAMES);
			const lastName = pick(LAST_NAMES);
			const email = `${slug(firstName)}.${slug(lastName)}@${company.domain}`;
			if (used.has(email)) continue;
			used.add(email);

			const contact = await db.contact.upsert({
				where: { email },
				create: {
					firstName,
					lastName,
					email,
					title: pick(TITLES),
					phone: chance(0.4) ? `+1 415 555 ${integer(1000, 9999)}` : null,
					companyId: company.id,
					ownerId: pick(ownerIds),
					createdAt: daysFromNow(-integer(10, 300), 12),
				},
				update: {},
				select: { id: true },
			});

			contacts.push({ id: contact.id, companyId: company.id });
		}
	}

	// The first contact at each company is the one to call.
	for (const company of companies) {
		const first = contacts.find((contact) => contact.companyId === company.id);
		if (!first) continue;
		await db.company.update({
			where: { id: company.id },
			data: { primaryContactId: first.id },
		});
	}

	return contacts;
}

type SeededDeal = {
	id: string;
	companyId: string;
	ownerId: string;
	closed: boolean;
	stageName: string;
};

async function seedDeals(
	companies: { id: string; name: string }[],
	contacts: SeededContact[],
	ownerIds: string[],
): Promise<SeededDeal[]> {
	const deals: SeededDeal[] = [];

	for (const [index, company] of companies.entries()) {
		// Every company has a deal; about half also have an expansion.
		const count = index % 2 === 0 ? 2 : 1;

		for (let n = 0; n < count; n++) {
			const id = `seed-deal-${slug(company.name)}-${n}`;
			const closed = chance(0.35);
			const stage = closed ? pick(CLOSED_STAGES) : pick(OPEN_STAGES);
			const ownerId = pick(ownerIds);
			const createdDaysAgo = integer(20, 210);
			const createdAt = daysFromNow(-createdDaysAgo, 12);
			// A closed deal closes somewhere between a fortnight after it opened and
			// today, so the overview's six-month trend and its rolling win rate have
			// something in every bucket. Closing them all inside the last fortnight —
			// which is what a flat `integer(1, 20)` did — made every chart a spike
			// against five empty months.
			const closedDaysAgo = closed
				? integer(0, Math.max(createdDaysAgo - 14, 0))
				: null;
			const stageChangedAt = daysFromNow(
				closedDaysAgo === null ? -integer(1, 20) : -closedDaysAgo,
				12,
			);

			await db.deal.upsert({
				where: { id },
				create: {
					id,
					name:
						n === 0
							? `${company.name} — Sales Ontology`
							: `${company.name} — expansion`,
					companyId: company.id,
					ownerId,
					pipelineId: DEFAULT_PIPELINE_ID,
					stageId: stage.id,
					stageChangedAt,
					amount: integer(6, 90) * 1000,
					currency: "USD",
					// A closed deal landed near the date it was forecast for; an open one
					// is still forecast, and some are already late.
					expectedCloseDate: daysFromNow(
						closedDaysAgo === null
							? integer(-10, 75)
							: -closedDaysAgo + integer(-4, 9),
					),
					closedAt: closed ? stageChangedAt : null,
					closedReason:
						stage.type === PipelineStageType.LOST ||
						stage.type === PipelineStageType.UNQUALIFIED
							? pick(LOST_REASONS)
							: null,
					createdAt,
				},
				update: {},
			});

			// One or two people from the company are on the deal.
			const companyContacts = contacts.filter(
				(contact) => contact.companyId === company.id,
			);
			for (const contact of companyContacts.slice(0, integer(1, 2))) {
				await db.dealContact.upsert({
					where: { dealId_contactId: { dealId: id, contactId: contact.id } },
					create: {
						dealId: id,
						contactId: contact.id,
						role: chance(0.5) ? "Champion" : "Decision maker",
					},
					update: {},
				});
			}

			deals.push({
				id,
				companyId: company.id,
				ownerId,
				closed,
				stageName: stage.name,
			});
		}
	}

	return deals;
}

async function seedActivities(
	companies: { id: string }[],
	contacts: SeededContact[],
	deals: SeededDeal[],
	ownerIds: string[],
): Promise<number> {
	// Re-running should not stack another 150 rows on top.
	const existing = await db.activity.count();
	if (existing > 0) {
		console.log(`Activities already seeded (${existing}) — skipping.`);
		return existing;
	}

	type ActivityRow = {
		type: ActivityType;
		subject: string | null;
		body: string | null;
		occurredAt: Date | null;
		dueAt: Date | null;
		completedAt: Date | null;
		companyId: string | null;
		contactId: string | null;
		dealId: string | null;
		createdById: string;
		createdAt: Date;
		meta?: { from: string; to: string };
	};

	const rows: ActivityRow[] = [];

	const base = (companyId: string, createdById: string, createdAt: Date) => ({
		companyId,
		contactId: null,
		dealId: null,
		occurredAt: null,
		dueAt: null,
		completedAt: null,
		subject: null,
		body: null,
		createdById,
		createdAt,
	});

	// History on every deal: the calls, notes and emails that got it here.
	for (const deal of deals) {
		const dealContacts = contacts.filter((c) => c.companyId === deal.companyId);

		for (let n = 0; n < integer(3, 6); n++) {
			const at = daysFromNow(-integer(2, 120), 18);
			const type = pick([
				ActivityType.NOTE,
				ActivityType.CALL,
				ActivityType.EMAIL,
				ActivityType.MEETING,
			]);

			rows.push({
				...base(deal.companyId, deal.ownerId, at),
				type,
				// The company id is stamped above so this shows on the company
				// timeline as well as the deal's.
				dealId: deal.id,
				contactId: dealContacts.length > 0 ? pick(dealContacts).id : null,
				subject:
					type === ActivityType.CALL
						? pick(CALL_SUBJECTS)
						: type === ActivityType.MEETING
							? pick(MEETING_SUBJECTS)
							: type === ActivityType.EMAIL
								? pick(EMAIL_SUBJECTS)
								: null,
				body: type === ActivityType.NOTE ? pick(NOTE_BODIES) : null,
				occurredAt: type === ActivityType.NOTE ? null : at,
			});
		}

		// The stage change that landed it where it is.
		rows.push({
			...base(deal.companyId, deal.ownerId, daysFromNow(-integer(1, 20), 12)),
			type: ActivityType.STAGE_CHANGE,
			dealId: deal.id,
			subject: "Stage changed",
			meta: {
				from: "Demo booked",
				to: deal.stageName,
			},
		});
	}

	// Tasks: a spread of done, upcoming and overdue, so the dashboard has all
	// three to show on the first run.
	for (const deal of deals) {
		if (deal.closed) continue;

		for (let n = 0; n < integer(1, 3); n++) {
			const roll = random();
			const overdue = roll < 0.3;
			const done = roll >= 0.3 && roll < 0.6;
			const dueAt = overdue
				? daysFromNow(-integer(1, 14), 6)
				: daysFromNow(integer(1, 21), 6);

			rows.push({
				...base(deal.companyId, deal.ownerId, daysFromNow(-integer(1, 30), 12)),
				type: ActivityType.TASK,
				dealId: deal.id,
				subject: pick(TASK_SUBJECTS),
				dueAt: done ? daysFromNow(-integer(1, 20), 6) : dueAt,
				completedAt: done ? daysFromNow(-integer(1, 10), 6) : null,
			});
		}
	}

	// A few notes that belong to the company rather than any one deal.
	for (const company of companies) {
		if (!chance(0.6)) continue;
		rows.push({
			...base(company.id, pick(ownerIds), daysFromNow(-integer(5, 200), 12)),
			type: ActivityType.NOTE,
			body: pick(NOTE_BODIES),
		});
	}

	await db.activity.createMany({ data: rows });
	return rows.length;
}

async function main() {
	const ownerIds = await seedOwners();
	const companies = await seedCompanies(ownerIds);
	const contacts = await seedContacts(companies, ownerIds);
	const deals = await seedDeals(companies, contacts, ownerIds);
	const activities = await seedActivities(companies, contacts, deals, ownerIds);

	console.log(
		`Seeded ${companies.length} companies, ${contacts.length} contacts, ` +
			`${deals.length} deals, ${activities} activities.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
