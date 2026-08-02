import { createHash } from "node:crypto";
import { CustomFieldType, type Prisma } from "@crm/db";
import { BadRequestException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import {
	type OntologySnapshot,
	ontologySnapshotInput,
} from "./ontology.contracts";

type SnapshotClient = Pick<
	Prisma.TransactionClient,
	"objectDefinition" | "rolePermission"
>;

export type OntologyImpact = {
	objects: OntologyImpactGroup;
	fields: OntologyImpactGroup;
	relations: OntologyImpactGroup;
	breakingChanges: string[];
	hasBreakingChanges: boolean;
};

type OntologyImpactGroup = {
	added: string[];
	removed: string[];
	changed: string[];
};

export async function snapshotRuntime(
	tx: SnapshotClient,
): Promise<OntologySnapshot> {
	const [objects, rolePermissions] = await Promise.all([
		tx.objectDefinition.findMany({
			orderBy: { key: "asc" },
			include: {
				fields: {
					orderBy: [{ position: "asc" }, { key: "asc" }],
					include: {
						options: { orderBy: [{ position: "asc" }, { key: "asc" }] },
						permissions: { orderBy: { roleId: "asc" } },
					},
				},
				sourceRelations: {
					orderBy: { key: "asc" },
					include: {
						targetObject: { select: { id: true, key: true } },
					},
				},
			},
		}),
		tx.rolePermission.findMany({
			where: { resource: CRM_RESOURCE.fields },
			orderBy: [{ roleId: "asc" }, { action: "asc" }],
			select: { roleId: true, resource: true, action: true, scope: true },
		}),
	]);

	const snapshot: OntologySnapshot = {
		objects: objects.map((object) => ({
			id: object.id,
			key: object.key,
			name: object.name,
			pluralName: object.pluralName,
			kind: object.kind,
			systemModel: object.systemModel,
			businessUnitId: object.businessUnitId,
			archivedAt: object.archivedAt?.toISOString() ?? null,
			fields: object.fields.map((field) => ({
				id: field.id,
				businessUnitId: field.businessUnitId,
				key: field.key,
				label: field.label,
				description: field.description,
				type: field.type,
				indexMode: field.indexMode,
				classification: field.classification,
				position: field.position,
				isRequired: field.isRequired,
				defaultValue: field.defaultValue,
				agentReadable: field.agentReadable,
				agentWritable: field.agentWritable,
				apiReadable: field.apiReadable,
				apiWritable: field.apiWritable,
				archivedAt: field.archivedAt?.toISOString() ?? null,
				options: field.options.map((option) => ({
					id: option.id,
					key: option.key,
					label: option.label,
					position: option.position,
					color: option.color,
					archivedAt: option.archivedAt?.toISOString() ?? null,
				})),
				permissions: field.permissions.map((permission) => ({
					roleId: permission.roleId,
					canRead: permission.canRead,
					canUpdate: permission.canUpdate,
				})),
			})),
		})),
		relations: objects.flatMap((object) =>
			object.sourceRelations.map((relation) => ({
				id: relation.id,
				sourceObjectId: relation.sourceObjectId,
				sourceObjectKey: object.key,
				targetObjectId: relation.targetObjectId,
				targetObjectKey: relation.targetObject.key,
				key: relation.key,
				name: relation.name,
				inverseName: relation.inverseName,
				cardinality: relation.cardinality,
				archivedAt: relation.archivedAt?.toISOString() ?? null,
			})),
		),
		policies: {
			rolePermissions: rolePermissions.map((permission) => ({
				roleId: permission.roleId,
				resource: permission.resource,
				action: permission.action,
				scope: permission.scope,
			})),
		},
	};

	return normalizeOntologySnapshot(snapshot);
}

export function normalizeOntologySnapshot(
	input: OntologySnapshot,
): OntologySnapshot {
	const parsed = ontologySnapshotInput.parse(input);
	return {
		objects: [...parsed.objects]
			.sort((a, b) => a.key.localeCompare(b.key))
			.map((object) => ({
				...object,
				fields: [...object.fields]
					.sort((a, b) => fieldIdentity(a).localeCompare(fieldIdentity(b)))
					.map((field) => ({
						...field,
						options: [...field.options].sort((a, b) =>
							a.key.localeCompare(b.key),
						),
						permissions: [...field.permissions].sort((a, b) =>
							a.roleId.localeCompare(b.roleId),
						),
					})),
			})),
		relations: [...parsed.relations].sort((a, b) =>
			relationIdentity(a).localeCompare(relationIdentity(b)),
		),
		policies: {
			rolePermissions: [...parsed.policies.rolePermissions].sort((a, b) =>
				permissionIdentity(a).localeCompare(permissionIdentity(b)),
			),
		},
	};
}

export function validateOntologySnapshot(
	input: OntologySnapshot,
	baseline?: OntologySnapshot,
): OntologySnapshot {
	const snapshot = normalizeOntologySnapshot(input);
	const objectKeys = new Set<string>();
	const objectIds = new Set<string>();
	for (const object of snapshot.objects) {
		if (objectKeys.has(object.key)) {
			throw invalid(`Duplicate object key: ${object.key}.`);
		}
		if (object.id && objectIds.has(object.id)) {
			throw invalid(`Duplicate object id: ${object.id}.`);
		}
		objectKeys.add(object.key);
		if (object.id) objectIds.add(object.id);

		const fieldKeys = new Set<string>();
		const fieldIds = new Set<string>();
		for (const field of object.fields) {
			const identity = fieldIdentity(field);
			if (fieldKeys.has(identity)) {
				throw invalid(`Duplicate field key: ${identity}.`);
			}
			if (field.id && fieldIds.has(field.id)) {
				throw invalid(`Duplicate field id: ${field.id}.`);
			}
			fieldKeys.add(identity);
			if (field.id) fieldIds.add(field.id);
			const optionKeys = new Set<string>();
			for (const option of field.options) {
				if (optionKeys.has(option.key)) {
					throw invalid(`Duplicate option key: ${identity}/${option.key}.`);
				}
				optionKeys.add(option.key);
			}
			const needsOptions =
				field.type === CustomFieldType.SELECT ||
				field.type === CustomFieldType.MULTI_SELECT;
			if (needsOptions && field.options.length === 0) {
				throw invalid(`Select field needs options: ${identity}.`);
			}
			if (!needsOptions && field.options.length > 0) {
				throw invalid(`Only select fields can define options: ${identity}.`);
			}
			const permissionKeys = new Set<string>();
			for (const permission of field.permissions) {
				if (permissionKeys.has(permission.roleId)) {
					throw invalid(
						`Duplicate field permission: ${identity}/${permission.roleId}.`,
					);
				}
				permissionKeys.add(permission.roleId);
			}
		}
	}

	const relationKeys = new Set<string>();
	const relationIds = new Set<string>();
	for (const relation of snapshot.relations) {
		const identity = relationIdentity(relation);
		if (relationKeys.has(identity)) {
			throw invalid(`Duplicate relation key: ${identity}.`);
		}
		if (relation.id && relationIds.has(relation.id)) {
			throw invalid(`Duplicate relation id: ${relation.id}.`);
		}
		if (!objectKeys.has(relation.sourceObjectKey)) {
			throw invalid(
				`Relation source object not found: ${relation.sourceObjectKey}.`,
			);
		}
		if (!objectKeys.has(relation.targetObjectKey)) {
			throw invalid(
				`Relation target object not found: ${relation.targetObjectKey}.`,
			);
		}
		relationKeys.add(identity);
		if (relation.id) relationIds.add(relation.id);
	}

	const policyKeys = new Set<string>();
	for (const permission of snapshot.policies.rolePermissions) {
		const identity = permissionIdentity(permission);
		if (policyKeys.has(identity)) {
			throw invalid(`Duplicate role permission: ${identity}.`);
		}
		policyKeys.add(identity);
	}

	if (baseline) assertStableKeys(snapshot, normalizeOntologySnapshot(baseline));
	return snapshot;
}

export function checksumOntologySnapshot(snapshot: OntologySnapshot): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(normalizeOntologySnapshot(snapshot))))
		.digest("hex");
}

export function diffOntologySnapshots(
	from: OntologySnapshot | null,
	to: OntologySnapshot,
): OntologyImpact {
	const previous = from ? normalizeOntologySnapshot(from) : emptySnapshot();
	const current = normalizeOntologySnapshot(to);
	const objects = diffGroup(
		new Map(previous.objects.map((item) => [item.key, item])),
		new Map(current.objects.map((item) => [item.key, item])),
	);
	const fields = diffGroup(
		new Map(
			previous.objects.flatMap((object) =>
				object.fields.map((field) => [
					`${object.key}/${fieldIdentity(field)}`,
					field,
				]),
			),
		),
		new Map(
			current.objects.flatMap((object) =>
				object.fields.map((field) => [
					`${object.key}/${fieldIdentity(field)}`,
					field,
				]),
			),
		),
	);
	const relations = diffGroup(
		new Map(previous.relations.map((item) => [relationIdentity(item), item])),
		new Map(current.relations.map((item) => [relationIdentity(item), item])),
	);
	const breakingChanges = [
		...objects.removed.map((key) => `Object removed: ${key}`),
		...fields.removed.map((key) => `Field removed: ${key}`),
		...relations.removed.map((key) => `Relation removed: ${key}`),
		...current.objects.flatMap((object) =>
			object.fields
				.filter((field) => field.isRequired)
				.filter((field) => {
					const previousField = previous.objects
						.find((item) => item.key === object.key)
						?.fields.find(
							(item) => fieldIdentity(item) === fieldIdentity(field),
						);
					return previousField && !previousField.isRequired;
				})
				.map((field) => `Field became required: ${object.key}/${field.key}`),
		),
	];
	return {
		objects,
		fields,
		relations,
		breakingChanges,
		hasBreakingChanges: breakingChanges.length > 0,
	};
}

export function emptySnapshot(): OntologySnapshot {
	return { objects: [], relations: [], policies: { rolePermissions: [] } };
}

function assertStableKeys(
	draft: OntologySnapshot,
	published: OntologySnapshot,
): void {
	const draftObjectsById = new Map(
		draft.objects.filter((item) => item.id).map((item) => [item.id, item]),
	);
	const draftObjectsByKey = new Map(
		draft.objects.map((item) => [item.key, item]),
	);
	for (const object of published.objects) {
		if (object.id) {
			const matching = draftObjectsById.get(object.id);
			if (matching && matching.key !== object.key) {
				throw invalid(`Object stable key cannot change: ${object.key}.`);
			}
		}
		const matching = draftObjectsByKey.get(object.key);
		if (!matching) {
			throw invalid(
				`Object stable key is missing; archive it instead: ${object.key}.`,
			);
		}
		if (object.id && matching.id !== object.id) {
			throw invalid(`Object id changed for stable key: ${object.key}.`);
		}
	}

	const fieldsById = new Map(
		draft.objects.flatMap((object) =>
			object.fields
				.filter((field) => field.id)
				.map((field) => [field.id, { object, field }]),
		),
	);
	const fieldsByKey = new Map(
		draft.objects.flatMap((object) =>
			object.fields.map((field) => [
				`${object.key}/${fieldIdentity(field)}`,
				{ object, field },
			]),
		),
	);
	for (const object of published.objects) {
		for (const field of object.fields) {
			if (field.id) {
				const matching = fieldsById.get(field.id);
				if (matching && matching.field.key !== field.key) {
					throw invalid(
						`Field stable key cannot change: ${object.key}/${field.key}.`,
					);
				}
			}
			const identity = `${object.key}/${fieldIdentity(field)}`;
			const matching = fieldsByKey.get(identity);
			if (!matching) {
				throw invalid(
					`Field stable key is missing; archive it instead: ${identity}.`,
				);
			}
			if (field.id && matching.field.id !== field.id) {
				throw invalid(`Field id changed for stable key: ${identity}.`);
			}
		}
	}

	const relationsById = new Map(
		draft.relations.filter((item) => item.id).map((item) => [item.id, item]),
	);
	const relationsByKey = new Map(
		draft.relations.map((item) => [relationIdentity(item), item]),
	);
	for (const relation of published.relations) {
		if (relation.id) {
			const matching = relationsById.get(relation.id);
			if (matching && matching.key !== relation.key) {
				throw invalid(
					`Relation stable key cannot change: ${relationIdentity(relation)}.`,
				);
			}
		}
		const matching = relationsByKey.get(relationIdentity(relation));
		if (!matching) {
			throw invalid(
				`Relation stable key is missing; archive it instead: ${relationIdentity(relation)}.`,
			);
		}
		if (relation.id && matching.id !== relation.id) {
			throw invalid(
				`Relation id changed for stable key: ${relationIdentity(relation)}.`,
			);
		}
	}
}

function fieldIdentity(field: { businessUnitId: string | null; key: string }) {
	return `${field.businessUnitId ?? "global"}/${field.key}`;
}

function relationIdentity(relation: { sourceObjectKey: string; key: string }) {
	return `${relation.sourceObjectKey}/${relation.key}`;
}

function permissionIdentity(permission: {
	roleId: string;
	resource: string;
	action: string;
}) {
	return `${permission.roleId}/${permission.resource}/${permission.action}`;
}

function diffGroup(
	from: Map<string, unknown>,
	to: Map<string, unknown>,
): OntologyImpactGroup {
	const added = [...to.keys()].filter((key) => !from.has(key)).sort();
	const removed = [...from.keys()].filter((key) => !to.has(key)).sort();
	const changed = [...to.keys()]
		.filter(
			(key) =>
				from.has(key) &&
				JSON.stringify(canonicalize(from.get(key))) !==
					JSON.stringify(canonicalize(to.get(key))),
		)
		.sort();
	return { added, removed, changed };
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, canonicalize(item)]),
		);
	}
	return value;
}

function invalid(message: string): BadRequestException {
	return new BadRequestException(message);
}
