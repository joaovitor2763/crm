import { db, OntologySchemaVersionStatus } from "@crm/db";
import type { AgentAccess } from "./access";

export async function readOntologySchemas(access: AgentAccess) {
	assertAdmin(access);
	const definitions = await db.ontologySchemaDefinition.findMany({
		orderBy: { key: "asc" },
		include: {
			versions: {
				where: { status: { not: OntologySchemaVersionStatus.ARCHIVED } },
				orderBy: { version: "desc" },
				select: versionSelect,
			},
		},
	});
	return definitions.map((definition) => ({
		id: definition.id,
		key: definition.key,
		name: definition.name,
		description: definition.description,
		versions: definition.versions,
	}));
}

export async function readOntologyVersion(
	access: AgentAccess,
	input: { versionId?: string; key?: string },
) {
	assertAdmin(access);
	const version = input.versionId
		? await db.ontologySchemaVersion.findUnique({
				where: { id: input.versionId },
				include: { schemaDefinition: true },
			})
		: await db.ontologySchemaVersion.findFirst({
				where: {
					schemaDefinition: { key: input.key },
					status: { not: OntologySchemaVersionStatus.ARCHIVED },
				},
				orderBy: { version: "desc" },
				include: { schemaDefinition: true },
			});
	if (!version) return null;
	return serializeVersion(version);
}

export async function previewOntologyImpact(
	access: AgentAccess,
	versionId: string,
) {
	assertAdmin(access);
	const version = await db.ontologySchemaVersion.findUnique({
		where: { id: versionId },
		include: { schemaDefinition: true },
	});
	if (!version) return null;
	const published = await db.ontologySchemaVersion.findFirst({
		where: {
			schemaDefinitionId: version.schemaDefinitionId,
			status: OntologySchemaVersionStatus.PUBLISHED,
			NOT: { id: version.id },
		},
		orderBy: { version: "desc" },
	});
	const from = asRecord(published?.snapshot);
	const to = asRecord(version.snapshot);
	return {
		schema: {
			key: version.schemaDefinition.key,
			name: version.schemaDefinition.name,
		},
		version: serializeVersion(version),
		fromVersion: published?.version ?? null,
		impact: diffSnapshot(from, to),
	};
}

function assertAdmin(access: AgentAccess) {
	if (!access.isSystem && !access.isAdmin)
		throw new Error(
			"Ontology governance is restricted to global administrators.",
		);
}

const versionSelect = {
	id: true,
	version: true,
	status: true,
	checksum: true,
	createdByType: true,
	createdById: true,
	publishedAt: true,
	archivedAt: true,
	createdAt: true,
} as const;

function serializeVersion(row: {
	id: string;
	version: number;
	status: OntologySchemaVersionStatus;
	checksum: string;
	createdByType: string;
	createdById: string | null;
	publishedAt: Date | null;
	archivedAt: Date | null;
	createdAt: Date;
	snapshot: unknown;
	schemaDefinition?: { key: string; name: string; description: string | null };
}) {
	return {
		id: row.id,
		version: row.version,
		status: row.status,
		checksum: row.checksum,
		createdByType: row.createdByType,
		createdById: row.createdById,
		publishedAt: row.publishedAt?.toISOString() ?? null,
		archivedAt: row.archivedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		schema: row.schemaDefinition ?? null,
		snapshot: row.snapshot,
	};
}

function diffSnapshot(
	from: Record<string, unknown>,
	to: Record<string, unknown>,
) {
	const group = (key: string) =>
		diffKeys(asArray(from[key]), asArray(to[key]), key);
	const objects = group("objects");
	const relations = group("relations");
	const fields = diffFields(asArray(from.objects), asArray(to.objects));
	const breakingChanges = [
		...objects.removed.map((key) => `object removed: ${key}`),
		...fields.removed.map((key) => `field removed: ${key}`),
	];
	return {
		objects,
		fields,
		relations,
		breakingChanges,
		hasBreakingChanges: breakingChanges.length > 0,
	};
}

function diffFields(from: unknown[], to: unknown[]) {
	const left = new Map<string, Record<string, unknown>>();
	const right = new Map<string, Record<string, unknown>>();
	for (const object of from) {
		const record = asRecord(object);
		for (const field of asArray(record.fields)) {
			const item = asRecord(field);
			left.set(`${record.key}.${item.key}`, item);
		}
	}
	for (const object of to) {
		const record = asRecord(object);
		for (const field of asArray(record.fields)) {
			const item = asRecord(field);
			right.set(`${record.key}.${item.key}`, item);
		}
	}
	return diffMaps(left, right);
}

function diffKeys(from: unknown[], to: unknown[], key: string) {
	const left = new Map(
		from.map((value) => [identity(value, key), asRecord(value)]),
	);
	const right = new Map(
		to.map((value) => [identity(value, key), asRecord(value)]),
	);
	return diffMaps(left, right);
}

function diffMaps(
	from: Map<string, Record<string, unknown>>,
	to: Map<string, Record<string, unknown>>,
) {
	const added = [...to.keys()].filter((key) => !from.has(key));
	const removed = [...from.keys()].filter((key) => !to.has(key));
	const changed = [...to.keys()].filter(
		(key) =>
			from.has(key) &&
			JSON.stringify(from.get(key)) !== JSON.stringify(to.get(key)),
	);
	return { added, removed, changed };
}

function identity(value: unknown, collection: string) {
	const record = asRecord(value);
	return String(
		record.key ?? record.id ?? `${collection}:${JSON.stringify(record)}`,
	);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function asArray(value: unknown) {
	return Array.isArray(value) ? value : [];
}
