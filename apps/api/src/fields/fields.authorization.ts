import {
	AccessScope,
	ObjectDefinitionKind,
	PermissionAction,
	type Prisma,
} from "@crm/db";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";

type ManagedDefinition = {
	kind: ObjectDefinitionKind;
	businessUnitId: string | null;
	archivedAt: Date | null;
};

type CreatableDefinition = ManagedDefinition & { key: string };

type ManagedField = {
	businessUnitId: string | null;
	objectDefinition: ManagedDefinition;
};

type Assignment = {
	businessUnitId: string;
	teamId?: string | null;
	ownerId?: string | null;
};

export class FieldsAuthorization {
	constructor(private readonly accessControl: AccessControlService) {}

	assertManage(principal: EffectivePrincipal) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.fields,
			PermissionAction.MANAGE,
		);
	}

	assertBusinessUnitManage(
		principal: EffectivePrincipal,
		businessUnitId: string | null | undefined,
	) {
		const scope = this.accessControl.configurationWhere(
			principal,
			CRM_RESOURCE.fields,
			PermissionAction.MANAGE,
			false,
		);
		if (principal.isAdmin) return;
		const allowed = scope.businessUnitId;
		if (
			!businessUnitId ||
			!allowed ||
			!("in" in allowed) ||
			!allowed.in.includes(businessUnitId)
		) {
			throw new ForbiddenException(
				"That business unit is outside your permitted fields scope.",
			);
		}
	}

	assertFieldValueBusinessUnit(
		principal: EffectivePrincipal,
		businessUnitId: string | null,
	) {
		if (
			principal.isAdmin ||
			businessUnitId === null ||
			principal.businessUnitTreeIds.includes(businessUnitId)
		) {
			return;
		}
		throw new ForbiddenException(
			"That business unit is outside your permitted field-value scope.",
		);
	}

	assertDefinitionInputManage(
		principal: EffectivePrincipal,
		kind: ObjectDefinitionKind,
		businessUnitId: string | null | undefined,
	) {
		if (
			!principal.isAdmin &&
			(kind === ObjectDefinitionKind.SYSTEM || !businessUnitId)
		) {
			throw new ForbiddenException(
				"Only administrators can create system or global object definitions.",
			);
		}
		this.assertBusinessUnitManage(principal, businessUnitId);
	}

	assertDefinitionManage(
		principal: EffectivePrincipal,
		definition: ManagedDefinition,
	) {
		if (definition.archivedAt) {
			throw new BadRequestException(
				"Archived object definitions are read-only.",
			);
		}
		if (
			!principal.isAdmin &&
			(definition.kind === ObjectDefinitionKind.SYSTEM ||
				!definition.businessUnitId)
		) {
			throw new ForbiddenException(
				"Only administrators can alter system or global object definitions.",
			);
		}
		this.assertBusinessUnitManage(principal, definition.businessUnitId);
	}

	assertFieldObjectManage(
		principal: EffectivePrincipal,
		definition: ManagedDefinition,
	) {
		if (definition.archivedAt) {
			throw new BadRequestException(
				"Archived object definitions are read-only.",
			);
		}
		if (
			!principal.isAdmin &&
			definition.kind === ObjectDefinitionKind.CUSTOM &&
			!definition.businessUnitId
		) {
			throw new ForbiddenException(
				"Only administrators can alter global custom object definitions.",
			);
		}
		if (definition.kind === ObjectDefinitionKind.CUSTOM) {
			this.assertBusinessUnitManage(principal, definition.businessUnitId);
		}
	}

	assertFieldManage(principal: EffectivePrincipal, field: ManagedField) {
		this.assertFieldObjectManage(principal, field.objectDefinition);
		if (
			field.objectDefinition.kind === ObjectDefinitionKind.CUSTOM &&
			field.objectDefinition.businessUnitId &&
			field.objectDefinition.businessUnitId !== field.businessUnitId
		) {
			throw new BadRequestException(
				"A custom object's field must use the object's business unit.",
			);
		}
		this.assertBusinessUnitManage(principal, field.businessUnitId);
	}

	async assertCustomRecordAssignment(
		principal: EffectivePrincipal,
		assignment: Assignment,
	) {
		await this.accessControl.assertAssignment(
			principal,
			CRM_RESOURCE.fields,
			PermissionAction.MANAGE,
			assignment,
		);
	}

	async assertCustomRecordCreate(
		principal: EffectivePrincipal,
		definition: CreatableDefinition,
		assignment: Assignment,
	) {
		const scope = this.accessControl.configurationWhere(
			principal,
			definition.key,
			PermissionAction.CREATE,
			false,
		);
		if (
			!principal.isAdmin &&
			(!definition.businessUnitId ||
				(scope.businessUnitId &&
					"in" in scope.businessUnitId &&
					!scope.businessUnitId.in.includes(definition.businessUnitId)))
		) {
			throw new ForbiddenException(
				"That custom object is outside your permitted create scope.",
			);
		}
		if (
			definition.businessUnitId &&
			definition.businessUnitId !== assignment.businessUnitId
		) {
			throw new ForbiddenException(
				"The record business unit must match its custom object.",
			);
		}
		await this.accessControl.assertAssignment(
			principal,
			definition.key,
			PermissionAction.CREATE,
			assignment,
		);
	}

	customRecordUpdateScope(
		principal: EffectivePrincipal,
		resource: string,
	): Prisma.CustomObjectRecordWhereInput {
		const scope = this.accessControl.configurationWhere(
			principal,
			resource,
			PermissionAction.UPDATE,
			false,
		);
		if (scope.businessUnitId === null) {
			return { businessUnitId: { in: [] } };
		}
		return scope as Prisma.CustomObjectRecordWhereInput;
	}

	async assertCustomRecordUpdateAssignment(
		principal: EffectivePrincipal,
		resource: string,
		assignment: Assignment,
	) {
		if (
			this.accessControl.permission(
				principal,
				resource,
				PermissionAction.UPDATE,
			) === AccessScope.OWNED &&
			assignment.ownerId !== principal.userId
		) {
			throw new ForbiddenException(
				"An owned record must have you as its owner.",
			);
		}
		await this.accessControl.assertAssignment(
			principal,
			resource,
			PermissionAction.UPDATE,
			assignment,
		);
	}
}
