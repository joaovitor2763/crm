import { type Db, PermissionAction, Prisma } from "@crm/db";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { FieldsService } from "../fields/fields.service";
import { loadAccountConfiguration } from "./revenue-account-config";
import {
	writeAccountDomainEvent,
	writeAccountHistory,
	writeAccountLineage,
} from "./revenue-account-events";
import { visibleAccount } from "./revenue-account-queries";
import {
	assertAccountRelationsInScope,
	relationCounts,
	transferRelations,
} from "./revenue-account-relations";
import type {
	RevenueAccountMergeInput,
	RevenueAccountMergePreviewInput,
} from "./revenue-accounts.contracts";
import {
	accountAttributes,
	asJsonMap,
	changedKeys,
	mergeableAccountAttributes,
	mergeValues,
	splitMergeableAccountAttributes,
} from "./revenue-accounts.helpers";

export async function previewRevenueAccountMerge(
	db: Db,
	accessControl: AccessControlService,
	fields: FieldsService,
	input: RevenueAccountMergePreviewInput,
	principal: EffectivePrincipal,
) {
	const [source, target] = await Promise.all([
		visibleAccount(
			db,
			accessControl,
			input.sourceAccountId,
			principal,
			PermissionAction.UPDATE,
		),
		visibleAccount(
			db,
			accessControl,
			input.targetAccountId,
			principal,
			PermissionAction.UPDATE,
		),
	]);
	if (source.id === target.id)
		throw new BadRequestException("A Conta cannot merge into itself.");
	await Promise.all([
		assertAccountRelationsInScope(db, accessControl, source.id, principal),
		assertAccountRelationsInScope(db, accessControl, target.id, principal),
	]);
	const [projectedSource, projectedTarget] = await Promise.all([
		fields.projectChannelValues(
			"revenue-accounts",
			source.customValues,
			principal,
			"api",
		),
		fields.projectChannelValues(
			"revenue-accounts",
			target.customValues,
			principal,
			"api",
		),
	]);
	const sourceAttributes = mergeableAccountAttributes({
		...source,
		customValues: projectedSource,
	});
	const targetAttributes = mergeableAccountAttributes({
		...target,
		customValues: projectedTarget,
	});
	const values = mergeValues(targetAttributes, sourceAttributes, {});
	return {
		source: { ...source, customValues: projectedSource },
		target: { ...target, customValues: projectedTarget },
		conflicts: values.conflicts,
		fieldGuide: changedKeys(targetAttributes, sourceAttributes).map(
			(fieldKey) => ({
				fieldKey,
				targetValue: targetAttributes[fieldKey],
				sourceValue: sourceAttributes[fieldKey],
				valueKind:
					Array.isArray(targetAttributes[fieldKey]) ||
					Array.isArray(sourceAttributes[fieldKey])
						? "LIST"
						: "SCALAR",
				requiresPolicy: values.conflicts.includes(fieldKey),
			}),
		),
		relationCounts: {
			source: await relationCounts(db, source.id),
			target: await relationCounts(db, target.id),
		},
		policy: (await loadAccountConfiguration(db)).mergePolicy,
	};
}

export async function mergeRevenueAccounts(
	db: Db,
	accessControl: AccessControlService,
	fields: FieldsService,
	input: RevenueAccountMergeInput,
	principal: EffectivePrincipal,
) {
	const existingResult = await existingMergeResult(
		db,
		accessControl,
		fields,
		input,
		principal,
	);
	if (existingResult) return existingResult;
	const [source, target] = await Promise.all([
		visibleAccount(
			db,
			accessControl,
			input.sourceAccountId,
			principal,
			PermissionAction.UPDATE,
		),
		visibleAccount(
			db,
			accessControl,
			input.targetAccountId,
			principal,
			PermissionAction.UPDATE,
		),
	]);
	if (source.id === target.id)
		throw new BadRequestException("A Conta cannot merge into itself.");
	await Promise.all([
		assertAccountRelationsInScope(db, accessControl, source.id, principal),
		assertAccountRelationsInScope(db, accessControl, target.id, principal),
	]);
	const [projectedSource, projectedTarget] = await Promise.all([
		fields.projectChannelValues(
			"revenue-accounts",
			source.customValues,
			principal,
			"api",
		),
		fields.projectChannelValues(
			"revenue-accounts",
			target.customValues,
			principal,
			"api",
		),
	]);
	const configuredPolicy = (await loadAccountConfiguration(db))
		.mergePolicy as Record<string, "TARGET" | "SOURCE" | "UNION" | "SKIP">;
	const fieldPolicies = Object.fromEntries(
		Object.entries({ ...configuredPolicy, ...input.fieldPolicies }).filter(
			([fieldKey]) =>
				fieldKey === "system.name" ||
				fieldKey === "system.domain" ||
				!fieldKey.startsWith("system."),
		),
	);
	const merged = mergeValues(
		mergeableAccountAttributes({ ...target, customValues: projectedTarget }),
		mergeableAccountAttributes({ ...source, customValues: projectedSource }),
		fieldPolicies,
	);
	if (merged.conflicts.length > 0)
		throw new BadRequestException(
			`Choose a merge policy for: ${merged.conflicts.join(", ")}.`,
		);
	const mergedAttributes = splitMergeableAccountAttributes(
		merged.values,
		target,
	);
	const projectedTargetValues = asJsonMap(projectedTarget);
	const mergedCustomValues = {
		...asJsonMap(target.customValues),
		...mergedAttributes.customValues,
	};
	for (const fieldKey of Object.keys(projectedTargetValues)) {
		if (!(fieldKey in mergedAttributes.customValues))
			delete mergedCustomValues[fieldKey];
	}
	const requestedCustomValues = Object.fromEntries(
		Object.entries(mergedAttributes.customValues).filter(
			([fieldKey, value]) =>
				JSON.stringify(projectedTargetValues[fieldKey]) !==
				JSON.stringify(value),
		),
	);
	await fields.validateChannelValues(
		"revenue-accounts",
		mergedAttributes.system.businessUnitId,
		requestedCustomValues,
		principal,
		"api",
	);
	await accessControl.assertAssignment(
		principal,
		CRM_RESOURCE.revenueAccounts,
		PermissionAction.UPDATE,
		mergedAttributes.system,
	);
	const operationId = input.operationId ?? crypto.randomUUID();
	try {
		return await db.$transaction(async (tx) => {
			const updatedTarget = await tx.revenueAccount.update({
				where: { id: target.id },
				data: {
					...mergedAttributes.system,
					customValues: mergedCustomValues,
				},
			});
			await transferRelations(tx, source.id, target.id, principal);
			await tx.revenueAccount.update({
				where: { id: source.id },
				data: {
					archivedAt: new Date(),
					mergedAt: new Date(),
					mergedIntoId: target.id,
				},
			});
			await tx.revenueAccountMerge.create({
				data: {
					sourceAccountId: source.id,
					targetAccountId: target.id,
					operationId,
					policy: fieldPolicies,
					executedByType: principal.actorType,
					executedById: principal.actorId,
				},
			});
			await writeAccountHistory(
				tx,
				target.id,
				operationId,
				accountAttributes(target),
				accountAttributes(updatedTarget),
				principal,
				"merge",
			);
			await writeAccountLineage(
				tx,
				target.id,
				operationId,
				"MERGED_IN",
				principal,
				{ sourceAccountId: source.id, fieldPolicies },
			);
			await writeAccountLineage(
				tx,
				source.id,
				operationId,
				"MERGED_OUT",
				principal,
				{ targetAccountId: target.id },
			);
			await writeAccountDomainEvent(
				tx,
				"revenue-account.merged",
				target.id,
				operationId,
				principal,
				{ sourceAccountId: source.id, targetAccountId: target.id },
				updatedTarget.businessUnitId,
				updatedTarget.teamId,
			);
			return {
				...updatedTarget,
				customValues: await fields.projectChannelValues(
					"revenue-accounts",
					updatedTarget.customValues,
					principal,
					"api",
				),
			};
		});
	} catch (error) {
		if (!isUnique(error) || !input.operationId) throw error;
		const retryResult = await existingMergeResult(
			db,
			accessControl,
			fields,
			input,
			principal,
		);
		if (retryResult) return retryResult;
		throw error;
	}
}

async function existingMergeResult(
	db: Db,
	accessControl: AccessControlService,
	fields: FieldsService,
	input: RevenueAccountMergeInput,
	principal: EffectivePrincipal,
) {
	if (!input.operationId) return null;
	const existing = await db.revenueAccountMerge.findUnique({
		where: { operationId: input.operationId },
	});
	if (!existing) return null;
	if (
		existing.sourceAccountId !== input.sourceAccountId ||
		existing.targetAccountId !== input.targetAccountId
	)
		throw new ConflictException(
			"This operationId is already used for another Conta merge.",
		);
	const target = await visibleAccount(
		db,
		accessControl,
		existing.targetAccountId,
		principal,
		PermissionAction.UPDATE,
	);
	return {
		...target,
		customValues: await fields.projectChannelValues(
			"revenue-accounts",
			target.customValues,
			principal,
			"api",
		),
	};
}

function isUnique(error: unknown) {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}
