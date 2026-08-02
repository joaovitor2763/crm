import {
	ObjectDefinitionKind,
	PermissionAction,
	type Prisma,
	RelationCardinality,
} from "@crm/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";

type RelationObjects = {
	cardinality: RelationCardinality;
	sourceObject: { id: string; kind: ObjectDefinitionKind };
	targetObject: { id: string; kind: ObjectDefinitionKind };
};

export function assertCustomRelationObjects(definition: RelationObjects) {
	if (
		definition.sourceObject.kind !== ObjectDefinitionKind.CUSTOM ||
		definition.targetObject.kind !== ObjectDefinitionKind.CUSTOM
	) {
		throw new BadRequestException(
			"Record relations currently require custom object records.",
		);
	}
}

export async function findVisibleCustomRelationRecords(
	tx: Prisma.TransactionClient,
	accessControl: AccessControlService,
	principal: EffectivePrincipal,
	definition: RelationObjects,
	sourceRecordId: string,
	targetRecordId: string,
) {
	const scope = accessControl.configurationWhere(
		principal,
		CRM_RESOURCE.fields,
		PermissionAction.MANAGE,
		false,
	);
	const recordScope =
		scope.businessUnitId === null
			? { businessUnitId: { in: [] } }
			: (scope as Prisma.CustomObjectRecordWhereInput);
	const [sourceRecord, targetRecord] = await Promise.all([
		tx.customObjectRecord.findFirst({
			where: {
				AND: [
					{
						id: sourceRecordId,
						objectDefinitionId: definition.sourceObject.id,
						archivedAt: null,
					},
					recordScope,
				],
			},
			select: {
				id: true,
				businessUnitId: true,
				teamId: true,
				ownerId: true,
			},
		}),
		tx.customObjectRecord.findFirst({
			where: {
				AND: [
					{
						id: targetRecordId,
						objectDefinitionId: definition.targetObject.id,
						archivedAt: null,
					},
					recordScope,
				],
			},
			select: {
				id: true,
				businessUnitId: true,
				teamId: true,
				ownerId: true,
			},
		}),
	]);
	if (!sourceRecord || !targetRecord) {
		throw new NotFoundException(
			"A related record was not found in your scope.",
		);
	}
	return { sourceRecord, targetRecord };
}

export async function lockRecordRelation(
	tx: Prisma.TransactionClient,
	relationDefinitionId: string,
	cardinality: RelationCardinality,
	sourceRecordId: string,
	targetRecordId: string,
) {
	const keys =
		cardinality === RelationCardinality.ONE_TO_ONE
			? [
					`crm:record-relation:1:1:source:${relationDefinitionId}:${sourceRecordId}`,
					`crm:record-relation:1:1:target:${relationDefinitionId}:${targetRecordId}`,
				]
			: cardinality === RelationCardinality.ONE_TO_MANY
				? [
						`crm:record-relation:1:n:target:${relationDefinitionId}:${targetRecordId}`,
					]
				: [
						`crm:record-relation:n:n:pair:${relationDefinitionId}:${sourceRecordId}:${targetRecordId}`,
					];
	for (const key of [...new Set(keys)].sort()) {
		await tx.$queryRaw`
			SELECT 1::int AS "locked"
			FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))
		`;
	}
}

export function relationConflictWhere(
	cardinality: RelationCardinality,
	sourceRecordId: string,
	targetRecordId: string,
): Prisma.RecordRelationWhereInput {
	const endpoints =
		cardinality === RelationCardinality.ONE_TO_ONE
			? [{ sourceRecordId }, { targetRecordId }]
			: cardinality === RelationCardinality.ONE_TO_MANY
				? [{ targetRecordId }]
				: [{ sourceRecordId, targetRecordId }];
	return {
		OR: endpoints,
	};
}

export function relationConflictMessage(cardinality: RelationCardinality) {
	return `The ${cardinality.toLowerCase()} relation already exists.`;
}
