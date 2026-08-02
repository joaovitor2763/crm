import { db, type Prisma } from "@crm/db";
import type { AgentAccess } from "./access";

const ACCOUNT_FIELDS = {
	id: true,
	name: true,
	domain: true,
	businessUnitId: true,
	teamId: true,
	ownerId: true,
	customValues: true,
	archivedAt: true,
	mergedAt: true,
	mergedIntoId: true,
	createdAt: true,
	updatedAt: true,
	owner: { select: { id: true, name: true, email: true } },
} as const;

export type AccountRow = Prisma.RevenueAccountGetPayload<{
	select: typeof ACCOUNT_FIELDS;
}>;
type AccountSummaryRow = AccountRow;

export type DuplicateEvidence = {
	signal:
		| "exact-domain"
		| "exact-name"
		| "shared-contact"
		| "shared-company"
		| "shared-deal";
	detail: string;
	weight: number;
};

export type DuplicateSuggestion = {
	account: AccountSummary;
	evidence: DuplicateEvidence[];
	confidence: number;
	band: "high" | "medium" | "low";
	ambiguous: boolean;
};

export type AccountSummary = {
	id: string;
	name: string;
	domain: string | null;
	businessUnitId: string;
	teamId: string | null;
	ownerId: string | null;
	customValues: Record<string, unknown>;
	archivedAt: string | null;
	mergedAt: string | null;
	mergedIntoId: string | null;
	createdAt: string;
	updatedAt: string;
	owner: { id: string; name: string | null; email: string } | null;
	relationCounts: { contacts: number; companies: number; deals: number };
};

export type AccountDetail = AccountSummary & {
	contacts: Array<{
		id: string;
		firstName: string | null;
		lastName: string | null;
		email: string | null;
	}>;
	companies: Array<{ id: string; name: string; domain: string | null }>;
	deals: Array<{ id: string; name: string; companyId: string | null }>;
	attributeHistory: Array<HistoryEntry>;
	lineage: Array<LineageEntry>;
};

export type HistoryEntry = {
	id: string;
	operationId: string;
	fieldKey: string;
	previousValue: unknown;
	nextValue: unknown;
	source: string | null;
	changedAt: string;
};

export type LineageEntry = {
	id: string;
	operationId: string;
	type: string;
	sourceType: string | null;
	sourceId: string | null;
	payload: unknown;
	createdAt: string;
};

export async function searchRevenueAccounts(
	query: string,
	access: AgentAccess,
	limit = 10,
) {
	const term = query.trim();
	if (term.length < 2) return { query: term, rows: [], total: 0 };
	const where: Prisma.RevenueAccountWhereInput = {
		AND: [
			access.revenueAccountWhere,
			{ archivedAt: null, mergedIntoId: null },
			{
				OR: [
					{ name: { contains: term, mode: "insensitive" } },
					{ domain: { contains: term, mode: "insensitive" } },
				],
			},
		],
	};
	const rows = await db.revenueAccount.findMany({
		where,
		take: Math.min(limit, 25),
		orderBy: { name: "asc" },
		select: ACCOUNT_FIELDS,
	});
	const projected = await Promise.all(
		rows.map((row) => summarizeAccount(row, access)),
	);
	const normalized = normalize(term);
	projected.sort(
		(a, b) =>
			accountMatchScore(b, normalized) - accountMatchScore(a, normalized),
	);
	return { query: term, rows: projected, total: projected.length };
}

export async function readRevenueAccount(
	id: string,
	access: AgentAccess,
	lineageLimit = 100,
): Promise<AccountDetail | null> {
	const account = await db.revenueAccount.findFirst({
		where: { AND: [{ id, archivedAt: null }, access.revenueAccountWhere] },
		include: {
			owner: { select: { id: true, name: true, email: true } },
			contacts: {
				where: {
					AND: [{ archivedAt: null }, { contact: { is: access.contactWhere } }],
				},
				select: {
					contact: {
						select: { id: true, firstName: true, lastName: true, email: true },
					},
				},
			},
			companies: {
				where: {
					AND: [{ archivedAt: null }, { company: { is: access.companyWhere } }],
				},
				select: { company: { select: { id: true, name: true, domain: true } } },
			},
			deals: {
				where: {
					AND: [{ archivedAt: null }, { deal: { is: access.dealWhere } }],
				},
				select: { deal: { select: { id: true, name: true, companyId: true } } },
			},
			attributeHistory: {
				orderBy: { changedAt: "desc" },
				take: Math.min(lineageLimit, 100),
			},
			lineage: {
				orderBy: { createdAt: "desc" },
				take: Math.min(lineageLimit, 100),
			},
		},
	});
	if (!account) return null;
	const summary = await summarizeAccount(account, access);
	const visibleFields = await visibleFieldKeys(access);
	const lineageIds = await revenueAccountLineageIds(id, access);
	const [attributeHistory, lineage] = await Promise.all([
		db.revenueAccountAttributeHistory.findMany({
			where: { revenueAccountId: { in: lineageIds } },
			orderBy: { changedAt: "desc" },
			take: Math.min(lineageLimit, 100),
		}),
		db.revenueAccountLineageEvent.findMany({
			where: { revenueAccountId: { in: lineageIds } },
			orderBy: { createdAt: "desc" },
			take: Math.min(lineageLimit, 100),
		}),
	]);
	return {
		...summary,
		contacts: account.contacts.map(({ contact }) => contact),
		companies: account.companies.map(({ company }) => company),
		deals: account.deals.map(({ deal }) => deal),
		attributeHistory: attributeHistory
			.filter(
				(entry) =>
					entry.fieldKey.startsWith("system.") ||
					visibleFields.has(entry.fieldKey),
			)
			.map((entry) => ({
				id: entry.id,
				operationId: entry.operationId,
				fieldKey: entry.fieldKey,
				previousValue: entry.previousValue,
				nextValue: entry.nextValue,
				source: entry.source,
				changedAt: entry.changedAt.toISOString(),
			})),
		lineage: lineage.map((entry) => ({
			id: entry.id,
			operationId: entry.operationId,
			type: entry.type,
			sourceType: entry.sourceType,
			sourceId: entry.sourceId,
			payload: safeLineagePayload(entry.payload, visibleFields),
			createdAt: entry.createdAt.toISOString(),
		})),
	};
}

/** Follow merge aliases without rewriting immutable source identities. */
export async function revenueAccountLineageIds(
	id: string,
	access: AgentAccess,
) {
	const ids = new Set([id]);
	let frontier = [id];
	while (frontier.length > 0) {
		const rows = await db.revenueAccountMerge.findMany({
			where: { targetAccountId: { in: frontier } },
			select: { sourceAccountId: true },
		});
		const visibleSources = await db.revenueAccount.findMany({
			where: {
				AND: [
					{ id: { in: rows.map((row) => row.sourceAccountId) } },
					access.revenueAccountWhere,
				],
			},
			select: { id: true },
		});
		const visibleIds = new Set(visibleSources.map((row) => row.id));
		frontier = rows
			.map((row) => row.sourceAccountId)
			.filter((sourceId) => visibleIds.has(sourceId) && !ids.has(sourceId));
		for (const sourceId of frontier) ids.add(sourceId);
	}
	return [...ids];
}

export async function suggestRevenueAccountDuplicates(
	id: string,
	access: AgentAccess,
	limit = 5,
) {
	const source = await findAccount(id, access);
	if (!source) return null;
	const candidates = await db.revenueAccount.findMany({
		where: {
			AND: [
				access.revenueAccountWhere,
				{ archivedAt: null, mergedIntoId: null, NOT: { id } },
				{
					OR: [
						...(source.domain
							? [
									{
										domain: {
											equals: source.domain,
											mode: "insensitive" as const,
										},
									},
								]
							: []),
						{
							name: {
								contains: source.name.split(/\s+/)[0] ?? source.name,
								mode: "insensitive",
							},
						},
					],
				},
			],
		},
		take: 50,
		select: ACCOUNT_FIELDS,
	});
	const sourceLinks = await relationIds(id, access);
	const suggestions = await Promise.all(
		candidates.map(async (candidate) => {
			const evidence = duplicateEvidence(
				source,
				candidate,
				sourceLinks,
				await relationIds(candidate.id, access),
			);
			const confidence = combinedConfidence(evidence);
			return {
				account: await summarizeAccount(candidate, access),
				evidence,
				confidence: Number(confidence.toFixed(2)),
				band:
					confidence >= 0.85 ? "high" : confidence >= 0.55 ? "medium" : "low",
				ambiguous: confidence < 0.85,
			} satisfies DuplicateSuggestion;
		}),
	);
	return {
		source: await summarizeAccount(source, access),
		candidates: suggestions
			.filter((candidate) => candidate.evidence.length > 0)
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, Math.min(limit, 10)),
	};
}

export async function previewRevenueAccountMerge(
	sourceId: string,
	targetId: string,
	access: AgentAccess,
) {
	if (sourceId === targetId)
		throw new Error("A RevenueAccount cannot merge into itself.");
	const [source, target] = await Promise.all([
		findAccount(sourceId, access),
		findAccount(targetId, access),
	]);
	if (!source || !target) return null;
	const [sourceCustomValues, targetCustomValues] = await Promise.all([
		projectValues(source.customValues, access, true),
		projectValues(target.customValues, access, true),
	]);
	const sourceValues = accountAttributes(source, sourceCustomValues);
	const targetValues = accountAttributes(target, targetCustomValues);
	const conflicts = Object.keys(sourceValues)
		.filter(
			(key) =>
				key in targetValues && !sameValue(sourceValues[key], targetValues[key]),
		)
		.map((fieldKey) => ({
			fieldKey,
			sourceValue: sourceValues[fieldKey],
			targetValue: targetValues[fieldKey],
		}));
	const [sourceRelations, targetRelations] = await Promise.all([
		relationCounts(sourceId, access),
		relationCounts(targetId, access),
	]);
	return {
		source: {
			...(await summarizeAccount(source, access)),
			customValues: sourceCustomValues,
			attributes: sourceValues,
		},
		target: {
			...(await summarizeAccount(target, access)),
			customValues: targetCustomValues,
			attributes: targetValues,
		},
		conflicts,
		fieldGuide: changedKeys(targetValues, sourceValues).map((fieldKey) => ({
			fieldKey,
			sourceValue: sourceValues[fieldKey],
			targetValue: targetValues[fieldKey],
			valueKind:
				Array.isArray(sourceValues[fieldKey]) ||
				Array.isArray(targetValues[fieldKey])
					? "LIST"
					: "SCALAR",
			requiresPolicy: conflicts.some(
				(conflict) => conflict.fieldKey === fieldKey,
			),
		})),
		relationCounts: { source: sourceRelations, target: targetRelations },
		requiresApproval: true as const,
		operationId: crypto.randomUUID(),
	};
}

const SYSTEM_FIELDS = new Set(["system.name", "system.domain"]);

export function accountAttributes(
	account: Pick<
		AccountRow,
		"name" | "domain" | "businessUnitId" | "teamId" | "ownerId"
	>,
	customValues: Record<string, unknown>,
): Record<string, unknown> {
	return {
		"system.name": account.name,
		"system.domain": account.domain,
		...customValues,
	};
}

export function splitAccountAttributes(values: Record<string, unknown>) {
	const name = values["system.name"];
	if (typeof name !== "string" || name.trim().length === 0)
		throw new Error("A merged RevenueAccount needs a name.");
	return {
		name,
		domain: nullableString(values["system.domain"]),
		customValues: Object.fromEntries(
			Object.entries(values).filter(([key]) => !SYSTEM_FIELDS.has(key)),
		),
	};
}

function nullableString(value: unknown) {
	return typeof value === "string" ? value : null;
}

function changedKeys(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
) {
	return [...new Set([...Object.keys(target), ...Object.keys(source)])].filter(
		(key) => !sameValue(target[key], source[key]),
	);
}

export async function findAccount(
	id: string,
	access: AgentAccess,
): Promise<AccountRow | null> {
	return db.revenueAccount.findFirst({
		where: { AND: [{ id, archivedAt: null }, access.revenueAccountWhere] },
		select: ACCOUNT_FIELDS,
	});
}

async function summarizeAccount(
	row: AccountSummaryRow,
	access: AgentAccess,
): Promise<AccountSummary> {
	const relationCount = await relationCounts(row.id, access);
	return {
		id: row.id,
		name: row.name,
		domain: row.domain,
		businessUnitId: row.businessUnitId,
		teamId: row.teamId,
		ownerId: row.ownerId,
		customValues: await projectValues(row.customValues, access),
		archivedAt: row.archivedAt?.toISOString() ?? null,
		mergedAt: row.mergedAt?.toISOString() ?? null,
		mergedIntoId: row.mergedIntoId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		owner: row.owner,
		relationCounts: relationCount,
	};
}

export async function projectValues(
	values: Prisma.JsonValue,
	access: AgentAccess,
	forUpdate = false,
) {
	const raw = asMap(values);
	const readable = await visibleFieldKeys(access, forUpdate);
	return Object.fromEntries(
		[...readable]
			.filter((field) => field in raw)
			.map((field) => [field, raw[field]]),
	) as Record<string, unknown>;
}

async function visibleFieldKeys(access: AgentAccess, forUpdate = false) {
	const fields = await db.customFieldDefinition.findMany({
		where: {
			objectDefinition: { key: "revenue-accounts" },
			archivedAt: null,
			agentReadable: true,
			...(forUpdate ? { agentWritable: true } : {}),
		},
		select: { id: true, key: true },
	});
	return new Set(
		fields
			.filter(
				(field) =>
					access.isSystem ||
					access.isAdmin ||
					(access.fieldPermissions.find(
						(permission) => permission.fieldId === field.id,
					)?.canRead !== false &&
						(forUpdate
							? access.fieldPermissions.find(
									(permission) => permission.fieldId === field.id,
								)?.canUpdate !== false
							: true)),
			)
			.map((field) => field.key),
	);
}

function safeLineagePayload(
	value: Prisma.JsonValue,
	visibleFields: Set<string>,
) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const payload = { ...(value as Record<string, Prisma.JsonValue>) };
	if (payload.fieldPolicies && typeof payload.fieldPolicies === "object") {
		payload.fieldPolicies = Object.fromEntries(
			Object.entries(
				payload.fieldPolicies as Record<string, Prisma.JsonValue>,
			).filter(([key]) => key.startsWith("system.") || visibleFields.has(key)),
		);
	}
	return payload;
}

async function relationIds(id: string, access: AgentAccess) {
	const [contacts, companies, deals] = await Promise.all([
		db.revenueAccountContact.findMany({
			where: {
				AND: [
					{ revenueAccountId: id, archivedAt: null },
					{ contact: { is: access.contactWhere } },
				],
			},
			select: { contactId: true },
		}),
		db.revenueAccountCompany.findMany({
			where: {
				AND: [
					{ revenueAccountId: id, archivedAt: null },
					{ company: { is: access.companyWhere } },
				],
			},
			select: { companyId: true },
		}),
		db.revenueAccountDeal.findMany({
			where: {
				AND: [
					{ revenueAccountId: id, archivedAt: null },
					{ deal: { is: access.dealWhere } },
				],
			},
			select: { dealId: true },
		}),
	]);
	return {
		contacts: new Set(contacts.map((row) => row.contactId)),
		companies: new Set(companies.map((row) => row.companyId)),
		deals: new Set(deals.map((row) => row.dealId)),
	};
}

async function relationCounts(id: string, access: AgentAccess) {
	const [contacts, companies, deals] = await Promise.all([
		db.revenueAccountContact.count({
			where: {
				AND: [
					{ revenueAccountId: id, archivedAt: null },
					{ contact: { is: access.contactWhere } },
				],
			},
		}),
		db.revenueAccountCompany.count({
			where: {
				AND: [
					{ revenueAccountId: id, archivedAt: null },
					{ company: { is: access.companyWhere } },
				],
			},
		}),
		db.revenueAccountDeal.count({
			where: {
				AND: [
					{ revenueAccountId: id, archivedAt: null },
					{ deal: { is: access.dealWhere } },
				],
			},
		}),
	]);
	return { contacts, companies, deals };
}

export function duplicateEvidence(
	source: AccountRow,
	candidate: AccountRow,
	sourceLinks: Awaited<ReturnType<typeof relationIds>>,
	candidateLinks: Awaited<ReturnType<typeof relationIds>>,
): DuplicateEvidence[] {
	const evidence: DuplicateEvidence[] = [];
	if (
		source.domain &&
		candidate.domain &&
		normalize(source.domain) === normalize(candidate.domain)
	)
		evidence.push({
			signal: "exact-domain",
			detail: `Both records use domain ${source.domain}.`,
			weight: 0.75,
		});
	if (normalize(source.name) === normalize(candidate.name))
		evidence.push({
			signal: "exact-name",
			detail: "The account names match after normalization.",
			weight: 0.65,
		});
	for (const [kind, left, right, weight] of [
		["shared-contact", sourceLinks.contacts, candidateLinks.contacts, 0.2],
		["shared-company", sourceLinks.companies, candidateLinks.companies, 0.2],
		["shared-deal", sourceLinks.deals, candidateLinks.deals, 0.2],
	] as const) {
		if ([...left].some((id) => right.has(id)))
			evidence.push({
				signal: kind,
				detail: `The records share a ${kind.slice(7)} relation.`,
				weight,
			});
	}
	return evidence;
}

export function combinedConfidence(evidence: DuplicateEvidence[]) {
	return Math.min(
		0.99,
		1 - evidence.reduce((remaining, item) => remaining * (1 - item.weight), 1),
	);
}

export function asMap(value: Prisma.JsonValue): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function sameValue(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function normalize(value: string | null) {
	return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function accountMatchScore(account: AccountSummary, query: string) {
	const name = normalize(account.name);
	const domain = normalize(account.domain);
	return name === query
		? 3
		: domain === query
			? 2.5
			: name.startsWith(query)
				? 2
				: domain.startsWith(query)
					? 1.5
					: 1;
}
