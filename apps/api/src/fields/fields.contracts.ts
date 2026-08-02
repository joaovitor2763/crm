import {
	CustomFieldIndexMode,
	CustomFieldType,
	DataClassification,
	ObjectDefinitionKind,
	RelationCardinality,
} from "@crm/db";
import { z } from "zod";

const key = z
	.string()
	.trim()
	.min(2)
	.max(64)
	.regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

const optionInput = z.object({
	key,
	label: z.string().trim().min(1).max(120),
	color: z.string().trim().max(32).nullable().optional(),
});

export const objectDefinitionCreateInput = z.object({
	key,
	name: z.string().trim().min(1).max(120),
	pluralName: z.string().trim().min(1).max(120),
	kind: z.enum(ObjectDefinitionKind).default(ObjectDefinitionKind.CUSTOM),
	businessUnitId: z.string().nullable().optional(),
});

export const fieldCreateInput = z
	.object({
		objectDefinitionId: z.string(),
		businessUnitId: z.string().nullable().optional(),
		key,
		label: z.string().trim().min(1).max(120),
		description: z.string().trim().max(500).nullable().optional(),
		type: z.enum(CustomFieldType),
		indexMode: z.enum(CustomFieldIndexMode).default(CustomFieldIndexMode.BASIC),
		classification: z
			.enum(DataClassification)
			.default(DataClassification.INTERNAL),
		isRequired: z.boolean().default(false),
		agentReadable: z.boolean().default(false),
		agentWritable: z.boolean().default(false),
		apiReadable: z.boolean().default(true),
		apiWritable: z.boolean().default(true),
		options: z.array(optionInput).max(100).default([]),
	})
	.superRefine((input, ctx) => {
		const needsOptions =
			input.type === CustomFieldType.SELECT ||
			input.type === CustomFieldType.MULTI_SELECT;
		if (needsOptions && input.options.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["options"],
				message: "Select fields need at least one option.",
			});
		}
		if (!needsOptions && input.options.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["options"],
				message: "Only select fields can define options.",
			});
		}
	});

export const fieldUpdateInput = z.object({
	id: z.string(),
	label: z.string().trim().min(1).max(120).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	position: z.number().int().min(0).optional(),
	indexMode: z.enum(CustomFieldIndexMode).optional(),
	classification: z.enum(DataClassification).optional(),
	isRequired: z.boolean().optional(),
	agentReadable: z.boolean().optional(),
	agentWritable: z.boolean().optional(),
	apiReadable: z.boolean().optional(),
	apiWritable: z.boolean().optional(),
});

export const fieldPermissionInput = z.object({
	fieldId: z.string(),
	roleId: z.string(),
	canRead: z.boolean(),
	canUpdate: z.boolean(),
});

export const fieldIdInput = z.object({ id: z.string() });

export const fieldSchemaInput = z.object({
	objectKey: key.optional(),
	businessUnitId: z.string().nullable().optional(),
});

export const recordCustomValuesInput = z.object({
	objectKey: key,
	recordId: z.string(),
	businessUnitId: z.string().nullable().optional(),
	values: z.record(z.string(), z.unknown()),
});

export const customRecordCreateInput = z.object({
	objectDefinitionId: z.string(),
	businessUnitId: z.string(),
	teamId: z.string().nullable().optional(),
	ownerId: z.string().nullable().optional(),
	displayName: z.string().trim().min(1).max(240),
	values: z.record(z.string(), z.unknown()).default({}),
});

export const relationDefinitionCreateInput = z.object({
	sourceObjectId: z.string(),
	targetObjectId: z.string(),
	key,
	name: z.string().trim().min(1).max(120),
	inverseName: z.string().trim().min(1).max(120),
	cardinality: z
		.enum(RelationCardinality)
		.default(RelationCardinality.MANY_TO_MANY),
});

export const recordRelationCreateInput = z.object({
	relationDefinitionId: z.string(),
	sourceRecordId: z.string(),
	targetRecordId: z.string(),
	businessUnitId: z.string().nullable().optional(),
});

export type ObjectDefinitionCreateInput = z.infer<
	typeof objectDefinitionCreateInput
>;
export type FieldCreateInput = z.infer<typeof fieldCreateInput>;
export type FieldUpdateInput = z.infer<typeof fieldUpdateInput>;
export type FieldPermissionInput = z.infer<typeof fieldPermissionInput>;
export type RecordCustomValuesInput = z.infer<typeof recordCustomValuesInput>;
export type CustomRecordCreateInput = z.infer<typeof customRecordCreateInput>;
export type RelationDefinitionCreateInput = z.infer<
	typeof relationDefinitionCreateInput
>;
export type RecordRelationCreateInput = z.infer<
	typeof recordRelationCreateInput
>;
