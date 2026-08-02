import {
	AccessScope,
	CustomFieldIndexMode,
	CustomFieldType,
	DataClassification,
	ObjectDefinitionKind,
	PermissionAction,
	RelationCardinality,
} from "@crm/db";
import { z } from "zod";

export const ontologyKey = z
	.string()
	.trim()
	.min(2)
	.max(64)
	.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const timestamp = z.string().min(1);

const optionSnapshot = z.object({
	id: z.string().optional(),
	key: ontologyKey,
	label: z.string().min(1).max(120),
	position: z.number().int().min(0),
	color: z.string().max(32).nullable(),
	archivedAt: timestamp.nullable(),
});

const fieldPermissionSnapshot = z.object({
	roleId: z.string().min(1),
	canRead: z.boolean(),
	canUpdate: z.boolean(),
});

const fieldSnapshot = z.object({
	id: z.string().optional(),
	businessUnitId: z.string().nullable(),
	key: ontologyKey,
	label: z.string().min(1).max(120),
	description: z.string().max(500).nullable(),
	type: z.enum(CustomFieldType),
	indexMode: z.enum(CustomFieldIndexMode),
	classification: z.enum(DataClassification),
	position: z.number().int().min(0),
	isRequired: z.boolean(),
	defaultValue: z.unknown().default(null),
	agentReadable: z.boolean(),
	agentWritable: z.boolean(),
	apiReadable: z.boolean(),
	apiWritable: z.boolean(),
	archivedAt: timestamp.nullable(),
	options: z.array(optionSnapshot),
	permissions: z.array(fieldPermissionSnapshot),
});

const objectSnapshot = z.object({
	id: z.string().optional(),
	key: ontologyKey,
	name: z.string().min(1).max(120),
	pluralName: z.string().min(1).max(120),
	kind: z.enum(ObjectDefinitionKind),
	systemModel: z.string().nullable(),
	businessUnitId: z.string().nullable(),
	archivedAt: timestamp.nullable(),
	fields: z.array(fieldSnapshot),
});

const relationSnapshot = z.object({
	id: z.string().optional(),
	sourceObjectId: z.string().optional(),
	sourceObjectKey: ontologyKey,
	targetObjectId: z.string().optional(),
	targetObjectKey: ontologyKey,
	key: ontologyKey,
	name: z.string().min(1).max(120),
	inverseName: z.string().min(1).max(120),
	cardinality: z.enum(RelationCardinality),
	archivedAt: timestamp.nullable(),
});

const rolePermissionSnapshot = z.object({
	roleId: z.string().min(1),
	resource: z.string().min(1),
	action: z.enum(PermissionAction),
	scope: z.enum(AccessScope),
});

export const ontologySnapshotInput = z.object({
	objects: z.array(objectSnapshot),
	relations: z.array(relationSnapshot),
	policies: z.object({
		rolePermissions: z.array(rolePermissionSnapshot),
	}),
});

export const ontologySchemaListInput = z.object({
	key: ontologyKey.optional(),
	includeArchived: z.boolean().default(false),
});

export const ontologyVersionIdInput = z.object({ id: z.string().min(1) });

export const ontologyCreateDraftInput = z.object({
	key: ontologyKey,
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(500).nullable().optional(),
	snapshot: ontologySnapshotInput.optional(),
});

export const ontologyReplaceDraftInput = z.object({
	id: z.string().min(1),
	snapshot: ontologySnapshotInput,
});

export const ontologyPublishInput = z.object({
	id: z.string().min(1),
	confirmed: z.literal(true),
});

export type OntologySnapshot = z.infer<typeof ontologySnapshotInput>;
export type OntologyCreateDraftInput = z.infer<typeof ontologyCreateDraftInput>;
export type OntologyReplaceDraftInput = z.infer<
	typeof ontologyReplaceDraftInput
>;
export type OntologySchemaListInput = z.infer<typeof ontologySchemaListInput>;
