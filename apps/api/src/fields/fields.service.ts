import {
	CustomFieldIndexMode,
	CustomFieldType,
	type Db,
	ObjectDefinitionKind,
	type Prisma,
} from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { FieldsAuthorization } from "./fields.authorization";
import type {
	CustomRecordCreateInput,
	FieldCreateInput,
	FieldPermissionInput,
	FieldUpdateInput,
	ObjectDefinitionCreateInput,
	RecordCustomValuesInput,
	RecordRelationCreateInput,
	RelationDefinitionCreateInput,
} from "./fields.contracts";
import {
	assertCustomRelationObjects,
	findVisibleCustomRelationRecords,
	lockRecordRelation,
	relationConflictMessage,
	relationConflictWhere,
} from "./fields.relations";

type JsonObject = Record<string, Prisma.InputJsonValue>;
type ProjectionField = {
	id: string;
	label: string;
	type: CustomFieldType;
	indexMode: CustomFieldIndexMode;
	options: { id: string; key: string }[];
};
type ProjectionValue = {
	textValue?: string;
	normalizedTextValue?: string;
	numberValue?: number;
	booleanValue?: boolean;
	dateValue?: Date;
	jsonValue?: Prisma.InputJsonValue;
	optionId?: string;
};

@Injectable()
export class FieldsService {
	private readonly authorization: FieldsAuthorization;

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {
		this.authorization = new FieldsAuthorization(accessControl);
	}

	async schema(principal: EffectivePrincipal, objectKey?: string) {
		const definitions = await this.db.objectDefinition.findMany({
			where: {
				archivedAt: null,
				...(objectKey ? { key: objectKey } : {}),
				OR: [
					{ businessUnitId: null },
					{ businessUnitId: { in: principal.businessUnitTreeIds } },
				],
			},
			orderBy: [{ kind: "asc" }, { name: "asc" }],
			include: {
				fields: {
					where: {
						archivedAt: null,
						OR: [
							{ businessUnitId: null },
							{ businessUnitId: { in: principal.businessUnitTreeIds } },
						],
					},
					orderBy: [{ position: "asc" }, { label: "asc" }],
					include: {
						options: {
							where: { archivedAt: null },
							orderBy: { position: "asc" },
						},
					},
				},
				sourceRelations: {
					where: { archivedAt: null },
					include: { targetObject: true },
				},
			},
		});

		return definitions.map((definition) => ({
			...definition,
			fields: definition.fields.filter((field) =>
				this.accessControl.canReadField(principal, field.id),
			),
		}));
	}

	async validateChannelValues(
		objectKey: string,
		businessUnitId: string,
		values: Record<string, unknown>,
		principal: EffectivePrincipal,
		channel: "api" | "agent",
	): Promise<JsonObject> {
		if (Object.keys(values).length === 0) return {};
		const definition = await this.db.objectDefinition.findFirst({
			where: { key: objectKey, archivedAt: null },
			include: {
				fields: {
					where: {
						key: { in: Object.keys(values) },
						archivedAt: null,
						OR: [{ businessUnitId: null }, { businessUnitId }],
						...(channel === "api"
							? { apiWritable: true }
							: { agentWritable: true }),
					},
					include: { options: { where: { archivedAt: null } } },
				},
			},
		});
		if (
			!definition ||
			definition.fields.length !== Object.keys(values).length
		) {
			throw new BadRequestException(
				"One or more custom fields are unknown or not writable through this channel.",
			);
		}
		for (const field of definition.fields) {
			if (!this.accessControl.canUpdateField(principal, field.id)) {
				throw new BadRequestException(`Field ${field.label} is read-only.`);
			}
			validateValue(field, values[field.key]);
		}
		return toJsonObject(values);
	}

	async projectChannelValues(
		objectKey: string,
		values: unknown,
		principal: EffectivePrincipal,
		channel: "api" | "agent",
	): Promise<JsonObject> {
		const source = isJsonObject(values) ? values : {};
		if (Object.keys(source).length === 0) return {};
		const definition = await this.db.objectDefinition.findFirst({
			where: { key: objectKey, archivedAt: null },
			include: {
				fields: {
					where: {
						key: { in: Object.keys(source) },
						archivedAt: null,
						OR: [
							{ businessUnitId: null },
							{ businessUnitId: { in: principal.businessUnitTreeIds } },
						],
						...(channel === "api"
							? { apiReadable: true }
							: { agentReadable: true }),
					},
					select: { id: true, key: true },
				},
			},
		});
		const allowed = new Set(
			(definition?.fields ?? [])
				.filter((field) => this.accessControl.canReadField(principal, field.id))
				.map((field) => field.key),
		);
		return Object.fromEntries(
			Object.entries(source).filter(([key]) => allowed.has(key)),
		) as JsonObject;
	}

	createObjectDefinition(
		input: ObjectDefinitionCreateInput,
		principal: EffectivePrincipal,
	) {
		this.authorization.assertManage(principal);
		const kind = input.kind ?? ObjectDefinitionKind.CUSTOM;
		this.authorization.assertDefinitionInputManage(
			principal,
			kind,
			input.businessUnitId,
		);
		return this.db.$transaction(async (tx) => {
			const definition = await tx.objectDefinition.create({
				data: { ...input, kind },
			});
			await this.audit(
				tx,
				principal,
				"object-definition.created",
				"object-definitions",
				definition.id,
			);
			return definition;
		});
	}

	createField(input: FieldCreateInput, principal: EffectivePrincipal) {
		this.authorization.assertManage(principal);
		return this.db.$transaction(async (tx) => {
			const object = await tx.objectDefinition.findUnique({
				where: { id: input.objectDefinitionId },
				select: {
					id: true,
					kind: true,
					businessUnitId: true,
					archivedAt: true,
				},
			});
			if (!object) throw new NotFoundException("Object definition not found.");
			this.authorization.assertFieldManage(principal, {
				businessUnitId: input.businessUnitId ?? null,
				objectDefinition: object,
			});
			if (object.archivedAt) {
				throw new BadRequestException(
					"Archived object definitions are read-only.",
				);
			}
			const last = await tx.customFieldDefinition.aggregate({
				where: { objectDefinitionId: input.objectDefinitionId },
				_max: { position: true },
			});
			const { options, ...fieldInput } = input;
			const field = await tx.customFieldDefinition.create({
				data: {
					...fieldInput,
					position: (last._max.position ?? -1) + 1,
					options: {
						create: options.map((option, position) => ({
							...option,
							position,
						})),
					},
				},
				include: { options: { orderBy: { position: "asc" } } },
			});
			await this.audit(
				tx,
				principal,
				"custom-field.created",
				"custom-fields",
				field.id,
			);
			return field;
		});
	}

	updateField(input: FieldUpdateInput, principal: EffectivePrincipal) {
		this.authorization.assertManage(principal);
		return this.db.$transaction(async (tx) => {
			const { id, ...data } = input;
			const current = await tx.customFieldDefinition.findUnique({
				where: { id },
				select: {
					id: true,
					businessUnitId: true,
					archivedAt: true,
					objectDefinition: {
						select: {
							kind: true,
							businessUnitId: true,
							archivedAt: true,
						},
					},
				},
			});
			if (!current) throw new NotFoundException("Custom field not found.");
			this.authorization.assertFieldManage(principal, current);
			if (current.archivedAt) {
				throw new BadRequestException("Archived fields are read-only.");
			}
			const field = await tx.customFieldDefinition.update({
				where: { id },
				data,
			});
			await this.audit(
				tx,
				principal,
				"custom-field.updated",
				"custom-fields",
				id,
			);
			return field;
		});
	}

	archiveField(id: string, principal: EffectivePrincipal) {
		this.authorization.assertManage(principal);
		return this.db.$transaction(async (tx) => {
			const current = await tx.customFieldDefinition.findUnique({
				where: { id },
				select: {
					id: true,
					businessUnitId: true,
					archivedAt: true,
					objectDefinition: {
						select: {
							kind: true,
							businessUnitId: true,
							archivedAt: true,
						},
					},
				},
			});
			if (!current) throw new NotFoundException("Custom field not found.");
			this.authorization.assertFieldManage(principal, current);
			const field = await tx.customFieldDefinition.update({
				where: { id },
				data: { archivedAt: new Date() },
			});
			await this.audit(
				tx,
				principal,
				"custom-field.archived",
				"custom-fields",
				id,
			);
			return field;
		});
	}

	setPermission(input: FieldPermissionInput, principal: EffectivePrincipal) {
		this.authorization.assertManage(principal);
		return this.db.$transaction(async (tx) => {
			const field = await tx.customFieldDefinition.findUnique({
				where: { id: input.fieldId },
				select: {
					businessUnitId: true,
					objectDefinition: {
						select: {
							kind: true,
							businessUnitId: true,
							archivedAt: true,
						},
					},
				},
			});
			if (!field) throw new NotFoundException("Custom field not found.");
			this.authorization.assertFieldManage(principal, field);
			const permission = await tx.fieldPermission.upsert({
				where: {
					roleId_fieldId: { roleId: input.roleId, fieldId: input.fieldId },
				},
				create: input,
				update: { canRead: input.canRead, canUpdate: input.canUpdate },
			});
			await this.audit(
				tx,
				principal,
				"custom-field.permission-updated",
				"custom-fields",
				input.fieldId,
			);
			return permission;
		});
	}

	createRelationDefinition(
		input: RelationDefinitionCreateInput,
		principal: EffectivePrincipal,
	) {
		this.authorization.assertManage(principal);
		return this.db.$transaction(async (tx) => {
			const [sourceObject, targetObject] = await Promise.all([
				tx.objectDefinition.findUnique({
					where: { id: input.sourceObjectId },
					select: {
						id: true,
						kind: true,
						businessUnitId: true,
						archivedAt: true,
					},
				}),
				tx.objectDefinition.findUnique({
					where: { id: input.targetObjectId },
					select: {
						id: true,
						kind: true,
						businessUnitId: true,
						archivedAt: true,
					},
				}),
			]);
			if (!sourceObject || !targetObject) {
				throw new NotFoundException("Relation object definition not found.");
			}
			this.authorization.assertDefinitionManage(principal, sourceObject);
			this.authorization.assertDefinitionManage(principal, targetObject);
			const definition = await tx.objectRelationDefinition.create({
				data: input,
			});
			await this.audit(
				tx,
				principal,
				"relation-definition.created",
				"relation-definitions",
				definition.id,
			);
			return definition;
		});
	}

	createRecordRelation(
		input: RecordRelationCreateInput,
		principal: EffectivePrincipal,
	) {
		this.authorization.assertManage(principal);
		return this.db.$transaction(async (tx) => {
			const definition = await tx.objectRelationDefinition.findUnique({
				where: { id: input.relationDefinitionId },
				select: {
					id: true,
					cardinality: true,
					archivedAt: true,
					sourceObject: {
						select: {
							id: true,
							kind: true,
							businessUnitId: true,
							archivedAt: true,
						},
					},
					targetObject: {
						select: {
							id: true,
							kind: true,
							businessUnitId: true,
							archivedAt: true,
						},
					},
				},
			});
			if (!definition || definition.archivedAt) {
				throw new NotFoundException("Relation definition not found.");
			}
			this.authorization.assertDefinitionManage(
				principal,
				definition.sourceObject,
			);
			this.authorization.assertDefinitionManage(
				principal,
				definition.targetObject,
			);
			assertCustomRelationObjects(definition);
			await lockRecordRelation(
				tx,
				definition.id,
				definition.cardinality,
				input.sourceRecordId,
				input.targetRecordId,
			);
			const { sourceRecord, targetRecord } =
				await findVisibleCustomRelationRecords(
					tx,
					this.accessControl,
					principal,
					definition,
					input.sourceRecordId,
					input.targetRecordId,
				);
			await this.authorization.assertCustomRecordAssignment(
				principal,
				sourceRecord,
			);
			await this.authorization.assertCustomRecordAssignment(
				principal,
				targetRecord,
			);
			const businessUnitId =
				input.businessUnitId ?? sourceRecord.businessUnitId;
			this.authorization.assertBusinessUnitManage(principal, businessUnitId);

			const existing = await tx.recordRelation.findFirst({
				where: {
					relationDefinitionId: input.relationDefinitionId,
					...relationConflictWhere(
						definition.cardinality,
						input.sourceRecordId,
						input.targetRecordId,
					),
				},
				select: { id: true },
			});
			if (existing) {
				throw new ConflictException(
					relationConflictMessage(definition.cardinality),
				);
			}

			let relation: Awaited<ReturnType<typeof tx.recordRelation.create>>;
			try {
				relation = await tx.recordRelation.create({
					data: {
						...input,
						businessUnitId,
						createdByType: principal.actorType,
						createdById: principal.actorId,
					},
				});
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new ConflictException(
						relationConflictMessage(definition.cardinality),
					);
				}
				throw error;
			}
			await this.audit(
				tx,
				principal,
				"record-relation.created",
				"record-relations",
				relation.id,
			);
			return relation;
		});
	}

	createCustomRecord(
		input: CustomRecordCreateInput,
		principal: EffectivePrincipal,
	) {
		return this.db.$transaction(async (tx) => {
			const definition = await tx.objectDefinition.findFirst({
				where: {
					id: input.objectDefinitionId,
					kind: "CUSTOM",
				},
				select: {
					id: true,
					key: true,
					kind: true,
					businessUnitId: true,
					archivedAt: true,
				},
			});
			if (!definition) {
				throw new NotFoundException("Custom object definition not found.");
			}
			if (definition.archivedAt) {
				throw new BadRequestException(
					"Archived object definitions are read-only.",
				);
			}
			await this.authorization.assertCustomRecordCreate(principal, definition, {
				businessUnitId: input.businessUnitId,
				teamId: input.teamId,
				ownerId: input.ownerId,
			});
			const record = await tx.customObjectRecord.create({
				data: {
					objectDefinitionId: input.objectDefinitionId,
					businessUnitId: input.businessUnitId,
					teamId: input.teamId,
					ownerId: input.ownerId,
					displayName: input.displayName,
					customValues: {},
				},
			});
			if (Object.keys(input.values).length > 0) {
				await this.writeValues(
					tx,
					definition.key,
					record.id,
					input.businessUnitId,
					input.values,
					principal,
				);
			}
			await this.audit(
				tx,
				principal,
				"custom-record.created",
				definition.key,
				record.id,
				input.businessUnitId,
			);
			return tx.customObjectRecord.findUniqueOrThrow({
				where: { id: record.id },
			});
		});
	}

	setRecordValues(
		input: RecordCustomValuesInput,
		principal: EffectivePrincipal,
	) {
		return this.db.$transaction((tx) =>
			this.writeValues(
				tx,
				input.objectKey,
				input.recordId,
				input.businessUnitId ?? null,
				input.values,
				principal,
			),
		);
	}

	private async writeValues(
		tx: Prisma.TransactionClient,
		objectKey: string,
		recordId: string,
		businessUnitId: string | null,
		values: Record<string, unknown>,
		principal: EffectivePrincipal,
	) {
		this.authorization.assertFieldValueBusinessUnit(principal, businessUnitId);
		const definition = await tx.objectDefinition.findFirst({
			where: { key: objectKey, archivedAt: null },
			include: {
				fields: {
					where: {
						key: { in: Object.keys(values) },
						archivedAt: null,
						OR: [{ businessUnitId: null }, { businessUnitId }],
					},
					include: { options: { where: { archivedAt: null } } },
				},
			},
		});
		if (!definition)
			throw new NotFoundException("Object definition not found.");
		if (definition.fields.length !== Object.keys(values).length) {
			throw new BadRequestException(
				"One or more custom fields are unknown here.",
			);
		}

		for (const field of definition.fields) {
			if (!this.accessControl.canUpdateField(principal, field.id)) {
				throw new BadRequestException(`Field ${field.label} is read-only.`);
			}
			validateValue(field, values[field.key]);
		}

		if (!definition.systemModel) {
			const record = await tx.customObjectRecord.findFirst({
				where: {
					AND: [
						{
							id: recordId,
							objectDefinitionId: definition.id,
							archivedAt: null,
						},
						this.authorization.customRecordUpdateScope(principal, objectKey),
					],
				},
				select: {
					businessUnitId: true,
					teamId: true,
					ownerId: true,
				},
			});
			if (!record)
				throw new NotFoundException("Record not found in your scope.");
			await this.authorization.assertCustomRecordUpdateAssignment(
				principal,
				objectKey,
				record,
			);
		}

		const current = await this.readRecordValues(
			tx,
			definition.systemModel,
			recordId,
		);
		const merged = { ...current, ...toJsonObject(values) };
		await this.updateRecordValues(tx, definition.systemModel, recordId, merged);

		for (const field of definition.fields) {
			if (field.indexMode === CustomFieldIndexMode.BASIC) continue;
			await this.upsertProjection(
				tx,
				definition.systemModel,
				recordId,
				field,
				values[field.key],
			);
		}

		await this.audit(
			tx,
			principal,
			"custom-values.updated",
			objectKey,
			recordId,
			businessUnitId,
		);
		return merged;
	}

	private async readRecordValues(
		tx: Prisma.TransactionClient,
		systemModel: string | null,
		recordId: string,
	): Promise<JsonObject> {
		const record = await this.findRecord(tx, systemModel, recordId);
		if (!record) throw new NotFoundException("Record not found.");
		return (record.customValues ?? {}) as JsonObject;
	}

	private findRecord(
		tx: Prisma.TransactionClient,
		systemModel: string | null,
		recordId: string,
	) {
		if (systemModel === "Contact") {
			return tx.contact.findUnique({
				where: { id: recordId },
				select: { customValues: true },
			});
		}
		if (systemModel === "Company") {
			return tx.company.findUnique({
				where: { id: recordId },
				select: { customValues: true },
			});
		}
		if (systemModel === "Deal") {
			return tx.deal.findUnique({
				where: { id: recordId },
				select: { customValues: true },
			});
		}
		if (systemModel === "RevenueAccount") {
			return tx.revenueAccount.findUnique({
				where: { id: recordId },
				select: { customValues: true },
			});
		}
		return tx.customObjectRecord.findUnique({
			where: { id: recordId },
			select: { customValues: true },
		});
	}

	private updateRecordValues(
		tx: Prisma.TransactionClient,
		systemModel: string | null,
		recordId: string,
		customValues: JsonObject,
	) {
		if (systemModel === "Contact") {
			return tx.contact.update({
				where: { id: recordId },
				data: { customValues },
			});
		}
		if (systemModel === "Company") {
			return tx.company.update({
				where: { id: recordId },
				data: { customValues },
			});
		}
		if (systemModel === "Deal") {
			return tx.deal.update({
				where: { id: recordId },
				data: { customValues },
			});
		}
		if (systemModel === "RevenueAccount") {
			return tx.revenueAccount.update({
				where: { id: recordId },
				data: { customValues },
			});
		}
		return tx.customObjectRecord.update({
			where: { id: recordId },
			data: { customValues },
		});
	}

	private async upsertProjection(
		tx: Prisma.TransactionClient,
		systemModel: string | null,
		recordId: string,
		field: ProjectionField,
		value: unknown,
	) {
		const target = projectionTarget(systemModel, recordId);
		await tx.customFieldSearchValue.deleteMany({
			where: { fieldId: field.id, ...target },
		});
		if (value === null || value === undefined || value === "") return;
		try {
			await tx.customFieldSearchValue.create({
				data: {
					fieldId: field.id,
					...target,
					...projectionValue(field, value),
					...(field.indexMode === CustomFieldIndexMode.UNIQUE
						? { uniqueNormalizedValue: normalizeUnique(value) }
						: {}),
				},
			});
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(`${field.label} must be unique.`);
			}
			throw error;
		}
	}

	private audit(
		tx: Prisma.TransactionClient,
		actor: EffectivePrincipal,
		eventType: string,
		resource: string,
		resourceId: string,
		businessUnitId?: string | null,
	) {
		return tx.auditEvent.create({
			data: {
				actorType: actor.actorType,
				actorId: actor.actorId,
				businessUnitId: businessUnitId ?? actor.primaryBusinessUnitId,
				action: eventType,
				resource,
				recordId: resourceId,
			},
		});
	}
}

function validateValue(
	field: {
		label: string;
		type: CustomFieldType;
		isRequired: boolean;
		options: { id: string; key: string }[];
	},
	value: unknown,
) {
	if (value === null || value === undefined || value === "") {
		if (field.isRequired)
			throw new BadRequestException(`${field.label} is required.`);
		return;
	}
	const stringTypes: CustomFieldType[] = [
		CustomFieldType.TEXT,
		CustomFieldType.EMAIL,
		CustomFieldType.PHONE,
		CustomFieldType.URL,
		CustomFieldType.RELATION,
	];
	if (stringTypes.includes(field.type) && typeof value !== "string") {
		throw new BadRequestException(`${field.label} must be text.`);
	}
	if (
		(field.type === CustomFieldType.NUMBER ||
			field.type === CustomFieldType.CURRENCY) &&
		typeof value !== "number"
	) {
		throw new BadRequestException(`${field.label} must be numeric.`);
	}
	if (field.type === CustomFieldType.BOOLEAN && typeof value !== "boolean") {
		throw new BadRequestException(`${field.label} must be boolean.`);
	}
	if (
		(field.type === CustomFieldType.DATE ||
			field.type === CustomFieldType.DATE_TIME) &&
		(typeof value !== "string" || Number.isNaN(Date.parse(value)))
	) {
		throw new BadRequestException(`${field.label} must be an ISO date.`);
	}
	const optionKeys = new Set(field.options.map((option) => option.key));
	if (
		field.type === CustomFieldType.SELECT &&
		(typeof value !== "string" || !optionKeys.has(value))
	) {
		throw new BadRequestException(`${field.label} has an invalid option.`);
	}
	if (
		field.type === CustomFieldType.MULTI_SELECT &&
		(!Array.isArray(value) ||
			value.some(
				(entry) => typeof entry !== "string" || !optionKeys.has(entry),
			))
	) {
		throw new BadRequestException(`${field.label} has invalid options.`);
	}
}

function projectionTarget(systemModel: string | null, recordId: string) {
	if (systemModel === "Contact") return { contactId: recordId };
	if (systemModel === "Company") return { companyId: recordId };
	if (systemModel === "Deal") return { dealId: recordId };
	if (systemModel === "RevenueAccount") return { revenueAccountId: recordId };
	return { customObjectRecordId: recordId };
}

function projectionValue(
	field: { type: CustomFieldType; options: { id: string; key: string }[] },
	value: unknown,
): ProjectionValue {
	if (
		field.type === CustomFieldType.NUMBER ||
		field.type === CustomFieldType.CURRENCY
	) {
		return { numberValue: value as number };
	}
	if (field.type === CustomFieldType.BOOLEAN)
		return { booleanValue: value as boolean };
	if (
		field.type === CustomFieldType.DATE ||
		field.type === CustomFieldType.DATE_TIME
	) {
		return { dateValue: new Date(value as string) };
	}
	if (field.type === CustomFieldType.SELECT) {
		return {
			optionId: field.options.find((option) => option.key === value)?.id,
		};
	}
	if (field.type === CustomFieldType.MULTI_SELECT) {
		return { jsonValue: value as Prisma.InputJsonValue };
	}
	const textValue = String(value);
	return { textValue, normalizedTextValue: textValue.trim().toLowerCase() };
}

function normalizeUnique(value: unknown): string {
	return JSON.stringify(value).trim().toLowerCase();
}

function toJsonObject(values: Record<string, unknown>): JsonObject {
	return JSON.parse(JSON.stringify(values)) as JsonObject;
}

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "P2002"
	);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
