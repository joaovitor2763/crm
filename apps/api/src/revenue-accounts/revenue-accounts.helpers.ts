import type { Prisma } from "@crm/db";

export type JsonMap = Record<string, Prisma.InputJsonValue>;

const SYSTEM_PREFIX = "system.";

type AccountAttributes = {
	name: string;
	domain: string | null;
	businessUnitId: string;
	teamId: string | null;
	ownerId: string | null;
	customValues: unknown;
};

export function accountAttributes(account: AccountAttributes): JsonMap {
	return {
		"system.name": account.name,
		"system.businessUnitId": account.businessUnitId,
		...(account.domain === null ? {} : { "system.domain": account.domain }),
		...(account.teamId === null ? {} : { "system.teamId": account.teamId }),
		...(account.ownerId === null ? {} : { "system.ownerId": account.ownerId }),
		...asJsonMap(account.customValues),
	};
}

export function splitAccountAttributes(values: JsonMap) {
	const name = values["system.name"];
	const businessUnitId = values["system.businessUnitId"];
	if (typeof name !== "string" || !name.trim()) {
		throw new Error("A merged Account needs a name.");
	}
	if (typeof businessUnitId !== "string" || !businessUnitId) {
		throw new Error("A merged Account needs a business unit.");
	}
	return {
		system: {
			name,
			domain: nullableString(values["system.domain"]),
			businessUnitId,
			teamId: nullableString(values["system.teamId"]),
			ownerId: nullableString(values["system.ownerId"]),
		},
		customValues: Object.fromEntries(
			Object.entries(values).filter(([key]) => !key.startsWith(SYSTEM_PREFIX)),
		) as JsonMap,
	};
}

export function normalizeMatch(value: string | null | undefined): string {
	return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function asJsonMap(value: unknown): JsonMap {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonMap)
		: {};
}

export function changedKeys(before: JsonMap, after: JsonMap): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
		(key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
	);
}

export function mergeValues(
	target: JsonMap,
	source: JsonMap,
	policies: Record<string, "TARGET" | "SOURCE" | "UNION" | "SKIP">,
): { values: JsonMap; conflicts: string[] } {
	const values: JsonMap = { ...target };
	const conflicts: string[] = [];
	for (const key of new Set([...Object.keys(target), ...Object.keys(source)])) {
		if (!(key in target)) {
			const sourceValue = source[key];
			if (sourceValue !== undefined) values[key] = sourceValue;
			continue;
		}
		if (
			!(key in source) ||
			JSON.stringify(target[key]) === JSON.stringify(source[key])
		) {
			continue;
		}
		const policy = policies[key];
		if (!policy) {
			conflicts.push(key);
			continue;
		}
		if (policy === "SOURCE" && source[key] !== undefined)
			values[key] = source[key];
		if (
			policy === "UNION" &&
			source[key] !== undefined &&
			target[key] !== undefined
		)
			values[key] = unionValues(target[key], source[key]);
		if (policy === "SKIP") delete values[key];
	}
	return { values, conflicts };
}

function unionValues(
	left: Prisma.InputJsonValue,
	right: Prisma.InputJsonValue,
) {
	if (Array.isArray(left) && Array.isArray(right)) {
		return [
			...new Map(
				[...left, ...right].map((value) => [JSON.stringify(value), value]),
			).values(),
		];
	}
	return right;
}

export function relationTable(targetKind: "CONTACT" | "COMPANY" | "DEAL") {
	if (targetKind === "CONTACT") return "contact" as const;
	if (targetKind === "COMPANY") return "company" as const;
	return "deal" as const;
}

function nullableString(
	value: Prisma.InputJsonValue | undefined,
): string | null {
	return typeof value === "string" ? value : null;
}
