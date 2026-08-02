import { db, type Prisma } from "@crm/db";
import { domainOf, normalise } from "./names";

/**
 * Turning what a rep said into the record they meant.
 *
 * This is the gap that produced "I need an actual identifier: a contact's
 * name, email address, or a contact ID". The agent had a lookup by id and a
 * lookup by email and nothing that took the words a person would actually
 * type, so a rep sitting on the Comp AI record — with the answer on screen —
 * was asked to go and find a cuid.
 *
 * Free, local, and deliberately not clever: containment against the fields a
 * human would have searched, then a score that puts exact matches first. No
 * fuzzy distance, because "Northwind" matching "Northwind Savings Group" is
 * useful and "Marchetti" matching "Marchetta" is a wrong record in a CRM.
 * Ambiguity is returned, not resolved — four Marchettis is an answer.
 */

export type RecordKind = "contact" | "company" | "deal";

export type ContactHit = {
	kind: "contact";
	id: string;
	name: string;
	title: string | null;
	email: string | null;
	company: { id: string; name: string } | null;
	lastActivityAt: string | null;
};

export type CompanyHit = {
	kind: "company";
	id: string;
	name: string;
	domain: string | null;
	industry: string | null;
	contacts: number;
	deals: number;
};

export type DealHit = {
	kind: "deal";
	id: string;
	name: string;
	stage: string;
	amount: number | null;
	currency: string;
	company: { id: string; name: string };
};

export type SearchHit = ContactHit | CompanyHit | DealHit;

export type SearchResult = {
	query: string;
	contacts: ContactHit[];
	companies: CompanyHit[];
	deals: DealHit[];
	total: number;
};

/**
 * Everything in the CRM that could be what they meant.
 *
 * An address searches for the person who owns it *and* the company on its
 * domain, because "who is katya@fernhill.com" and "what is Fernhill" are the
 * same question asked from two ends.
 */
export async function searchCrm(
	query: string,
	options: {
		kinds?: RecordKind[];
		limit?: number;
		contactWhere?: Prisma.ContactWhereInput;
		companyWhere?: Prisma.CompanyWhereInput;
		dealWhere?: Prisma.DealWhereInput;
	} = {},
): Promise<SearchResult> {
	const term = query.trim();
	const kinds = options.kinds ?? ["contact", "company", "deal"];
	const limit = options.limit ?? 10;

	if (term.length < 2) {
		return { query: term, contacts: [], companies: [], deals: [], total: 0 };
	}

	const wants = (kind: RecordKind) => kinds.includes(kind);
	const email = term.includes("@") ? term.toLowerCase() : null;
	// A bare domain is a company query in every case that matters: nobody types
	// "fernhill.com" hoping for a deal called Fernhill.com.
	const domain = email ? domainOf(email) : bareDomain(term);
	const words = term.split(/\s+/).filter((word) => word.length >= 2);

	const [contacts, companies, deals] = await Promise.all([
		wants("contact")
			? searchContacts(term, words, email, limit, options.contactWhere)
			: [],
		wants("company")
			? searchCompanies(term, words, domain, limit, options.companyWhere)
			: [],
		wants("deal") ? searchDeals(term, words, limit, options.dealWhere) : [],
	]);

	return {
		query: term,
		contacts,
		companies,
		deals,
		total: contacts.length + companies.length + deals.length,
	};
}

async function searchContacts(
	term: string,
	words: string[],
	email: string | null,
	limit: number,
	scope: Prisma.ContactWhereInput = {},
): Promise<ContactHit[]> {
	const contains = words.flatMap((word) => [
		{ firstName: { contains: word, mode: "insensitive" as const } },
		{ lastName: { contains: word, mode: "insensitive" as const } },
		{ email: { contains: word, mode: "insensitive" as const } },
	]);

	const rows = await db.contact.findMany({
		where: {
			AND: [
				{ archivedAt: null },
				scope,
				{
					OR: [
						...(email
							? [{ email: { equals: email, mode: "insensitive" as const } }]
							: []),
						...contains,
						// The whole phrase against the company, so "Comp AI" finds the
						// people there rather than only a person called Comp.
						{
							company: {
								name: { contains: term, mode: "insensitive" as const },
							},
						},
					],
				},
			],
		},
		orderBy: [{ lastActivityAt: "desc" }, { createdAt: "asc" }],
		take: limit * 3,
		select: {
			id: true,
			firstName: true,
			lastName: true,
			title: true,
			email: true,
			lastActivityAt: true,
			company: { select: { id: true, name: true } },
		},
	});

	return rows
		.map((row) => {
			const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
			return {
				score: score(term, [name, row.email ?? "", row.company?.name ?? ""]),
				hit: {
					kind: "contact" as const,
					id: row.id,
					name,
					title: row.title,
					email: row.email,
					company: row.company,
					lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				},
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((row) => row.hit);
}

async function searchCompanies(
	term: string,
	words: string[],
	domain: string | null,
	limit: number,
	scope: Prisma.CompanyWhereInput = {},
): Promise<CompanyHit[]> {
	const rows = await db.company.findMany({
		where: {
			AND: [
				{ archivedAt: null },
				scope,
				{
					OR: [
						{ name: { contains: term, mode: "insensitive" } },
						...(domain
							? [{ domain: { contains: domain, mode: "insensitive" as const } }]
							: []),
						...words.map((word) => ({
							name: { contains: word, mode: "insensitive" as const },
						})),
					],
				},
			],
		},
		orderBy: [{ lastActivityAt: "desc" }, { name: "asc" }],
		take: limit * 3,
		select: {
			id: true,
			name: true,
			domain: true,
			industry: true,
			_count: {
				select: {
					contacts: { where: { archivedAt: null } },
					deals: { where: { archivedAt: null } },
				},
			},
		},
	});

	return rows
		.map((row) => ({
			score: score(term, [row.name, row.domain ?? ""]),
			hit: {
				kind: "company" as const,
				id: row.id,
				name: row.name,
				domain: row.domain,
				industry: row.industry,
				contacts: row._count.contacts,
				deals: row._count.deals,
			},
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((row) => row.hit);
}

async function searchDeals(
	term: string,
	words: string[],
	limit: number,
	scope: Prisma.DealWhereInput = {},
): Promise<DealHit[]> {
	const rows = await db.deal.findMany({
		where: {
			AND: [
				{ archivedAt: null },
				scope,
				{
					OR: [
						{ name: { contains: term, mode: "insensitive" } },
						...words.map((word) => ({
							name: { contains: word, mode: "insensitive" as const },
						})),
						{ company: { name: { contains: term, mode: "insensitive" } } },
					],
				},
			],
		},
		orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
		take: limit * 3,
		select: {
			id: true,
			name: true,
			stage: { select: { name: true } },
			amount: true,
			currency: true,
			company: { select: { id: true, name: true } },
		},
	});

	return rows
		.map((row) => ({
			score: score(term, [row.name, row.company.name]),
			hit: {
				kind: "deal" as const,
				id: row.id,
				name: row.name,
				stage: row.stage.name,
				amount: row.amount === null ? null : Number(row.amount),
				currency: row.currency,
				company: row.company,
			},
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((row) => row.hit);
}

/**
 * How well a row answers the query: exact, then prefix, then containment, and
 * only then the individual words.
 *
 * The two tiers matter because the SQL above is an `OR` across every word — it
 * has to be, or "Paula Marchetti" would miss a contact filed as "P. Marchetti"
 * — which means a two-word query drags in everything matching either half.
 * Whole-phrase hits score at least 1 and word hits always score below it, so
 * the row a person meant is never buried under the rows that share a word with
 * it.
 *
 * Ordering happens here rather than in Postgres because the interesting rank
 * is across three tables, and `similarity()` would mean an extension a
 * self-hoster has to install. These result sets are tens of rows.
 */
function score(term: string, fields: string[]): number {
	const needle = normalise(term);
	if (!needle) return 0;

	let best = 0;
	for (const field of fields) {
		const hay = normalise(field);
		if (!hay) continue;
		if (hay === needle) best = Math.max(best, 4);
		else if (hay.startsWith(needle)) best = Math.max(best, 3);
		else if (hay.includes(needle)) best = Math.max(best, 2);
	}
	if (best > 0) return best;

	const words = term
		.split(/\s+/)
		.map(normalise)
		.filter((word) => word.length >= 2);
	if (words.length === 0) return 0;

	const hay = fields.map(normalise).join(" ");
	return words.filter((word) => hay.includes(word)).length / words.length;
}

/** `fernhill.com` → `fernhill.com`; `Fernhill` → null. */
function bareDomain(term: string): string | null {
	const candidate = term
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "");
	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(candidate) ? candidate : null;
}
