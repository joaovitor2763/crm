import { describe, expect, it } from "bun:test";
import {
	AccessScope,
	AuditActorType,
	type Db,
	ObjectDefinitionKind,
	PermissionAction,
	RelationCardinality,
	UserAccessStatus,
} from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import { CRM_RESOURCE } from "../src/access-control/access-control.constants";
import { AccessControlService } from "../src/access-control/access-control.service";
import type { EffectivePrincipal } from "../src/access-control/access-control.types";
import { FieldsAuthorization } from "../src/fields/fields.authorization";
import { FieldsService } from "../src/fields/fields.service";

const principal: EffectivePrincipal = {
	actorType: AuditActorType.USER,
	actorId: "fields-test-user",
	userId: "fields-test-user",
	roleId: "fields-test-role",
	roleKey: "operations",
	isAdmin: false,
	status: UserAccessStatus.ACTIVE,
	primaryBusinessUnitId: "bu-1",
	primaryTeamId: "team-1",
	businessUnitIds: ["bu-1"],
	businessUnitTreeIds: ["bu-1"],
	teamIds: ["team-1"],
	managedTeamIds: [],
	teamAssignments: [],
	ownerAssignments: [],
	permissions: [],
	fieldPermissions: [],
};

function accessControlMock(scopeOverrides: Record<string, AccessScope> = {}) {
	const assignments: unknown[] = [];
	const assignmentCalls: Array<{
		resource: string;
		action: PermissionAction;
		assignment: unknown;
	}> = [];
	const scopeFor = (resource: string, action: PermissionAction) =>
		scopeOverrides[`${resource}:${action}`] ?? AccessScope.BUSINESS_UNIT_TREE;
	const assert = (
		_principal: EffectivePrincipal,
		resource: string,
		action: PermissionAction,
	) => {
		const scope = scopeFor(resource, action);
		if (scope === AccessScope.NONE) {
			throw new ForbiddenException(
				`Your role cannot ${action.toLowerCase()} ${resource}.`,
			);
		}
		return scope;
	};
	return {
		assignments,
		assignmentCalls,
		assert,
		permission: (
			_principal: EffectivePrincipal,
			resource: string,
			action: PermissionAction,
		) => scopeFor(resource, action),
		configurationWhere: (
			_principal: EffectivePrincipal,
			resource: string,
			action: PermissionAction,
		) => {
			const scope = assert(_principal, resource, action);
			return scope === AccessScope.ALL
				? {}
				: { businessUnitId: { in: ["bu-1"] } };
		},
		assertAssignment: (
			_principal: EffectivePrincipal,
			resource: string,
			action: PermissionAction,
			assignment: unknown,
		) => {
			assignments.push(assignment);
			assignmentCalls.push({ resource, action, assignment });
		},
	} as unknown as AccessControlService & {
		assignments: unknown[];
		assignmentCalls: Array<{
			resource: string;
			action: PermissionAction;
			assignment: unknown;
		}>;
	};
}

describe("fields authorization", () => {
	it("blocks non-admin system and global object definitions", () => {
		const authorization = new FieldsAuthorization(accessControlMock());

		expect(() =>
			authorization.assertDefinitionInputManage(
				principal,
				ObjectDefinitionKind.SYSTEM,
				"bu-1",
			),
		).toThrow("Only administrators");
		expect(() =>
			authorization.assertDefinitionInputManage(
				principal,
				ObjectDefinitionKind.CUSTOM,
				null,
			),
		).toThrow("Only administrators");
	});

	it("honors the effective business-unit scope and delegates assignments", async () => {
		const access = accessControlMock();
		const authorization = new FieldsAuthorization(access);

		authorization.assertBusinessUnitManage(principal, "bu-1");
		expect(() =>
			authorization.assertBusinessUnitManage(principal, "bu-2"),
		).toThrow("outside your permitted fields scope");

		await authorization.assertCustomRecordAssignment(principal, {
			businessUnitId: "bu-1",
			teamId: "team-1",
			ownerId: "owner-1",
		});
		expect(access.assignments).toEqual([
			{ businessUnitId: "bu-1", teamId: "team-1", ownerId: "owner-1" },
		]);
	});

	it("allows a scoped field on an active system object", () => {
		const authorization = new FieldsAuthorization(accessControlMock());

		authorization.assertFieldManage(principal, {
			businessUnitId: "bu-1",
			objectDefinition: {
				kind: ObjectDefinitionKind.SYSTEM,
				businessUnitId: null,
				archivedAt: null,
			},
		});
		expect(() =>
			authorization.assertFieldManage(principal, {
				businessUnitId: null,
				objectDefinition: {
					kind: ObjectDefinitionKind.SYSTEM,
					businessUnitId: null,
					archivedAt: null,
				},
			}),
		).toThrow("outside your permitted fields scope");
	});

	it("keeps custom-object fields in the object's business unit", () => {
		const authorization = new FieldsAuthorization(accessControlMock());

		expect(() =>
			authorization.assertFieldManage(principal, {
				businessUnitId: "bu-2",
				objectDefinition: {
					kind: ObjectDefinitionKind.CUSTOM,
					businessUnitId: "bu-1",
					archivedAt: null,
				},
			}),
		).toThrow("must use the object's business unit");
	});

	it("fails closed for ownerless records in an OWNED update scope", async () => {
		const access = accessControlMock();
		access.permission = () => AccessScope.OWNED;
		const authorization = new FieldsAuthorization(access);

		await expect(
			authorization.assertCustomRecordUpdateAssignment(
				principal,
				"custom-object",
				{ businessUnitId: "bu-1", ownerId: null },
			),
		).rejects.toThrow("must have you as its owner");
	});

	it("keeps field-value writes inside the business-unit tree", () => {
		const authorization = new FieldsAuthorization(accessControlMock());

		authorization.assertFieldValueBusinessUnit(principal, null);
		authorization.assertFieldValueBusinessUnit(principal, "bu-1");
		expect(() =>
			authorization.assertFieldValueBusinessUnit(principal, "bu-2"),
		).toThrow("outside your permitted field-value scope");
	});
});

describe("custom record creation authorization", () => {
	const input = {
		objectDefinitionId: "object-custom",
		businessUnitId: "bu-1",
		teamId: "team-1",
		ownerId: "owner-1",
		displayName: "Custom record",
		values: {},
	};

	it("allows CREATE without fields MANAGE", async () => {
		const access = accessControlMock({
			[`${CRM_RESOURCE.fields}:${PermissionAction.MANAGE}`]: AccessScope.NONE,
		});
		const service = new FieldsService(
			fakeDatabase(customRecordTransaction()),
			access,
		);

		const record = await service.createCustomRecord(input, {
			...principal,
			permissions: [
				{
					resource: "custom-object",
					action: PermissionAction.CREATE,
					scope: AccessScope.BUSINESS_UNIT_TREE,
				},
			],
		});

		expect(record.id).toBe("custom-record-1");
		expect(access.assignmentCalls).toEqual([
			{
				resource: "custom-object",
				action: PermissionAction.CREATE,
				assignment: {
					businessUnitId: "bu-1",
					teamId: "team-1",
					ownerId: "owner-1",
				},
			},
		]);
	});

	it("denies MANAGE without CREATE", async () => {
		const access = accessControlMock({
			[`${CRM_RESOURCE.fields}:${PermissionAction.MANAGE}`]:
				AccessScope.BUSINESS_UNIT_TREE,
			"custom-object:CREATE": AccessScope.NONE,
		});
		const service = new FieldsService(
			fakeDatabase(customRecordTransaction()),
			access,
		);

		await expect(service.createCustomRecord(input, principal)).rejects.toThrow(
			"cannot create custom-object",
		);
	});

	it("keeps archived custom objects read-only", async () => {
		const service = new FieldsService(
			fakeDatabase(customRecordTransaction(new Date("2026-01-01T00:00:00Z"))),
			accessControlMock(),
		);

		await expect(service.createCustomRecord(input, principal)).rejects.toThrow(
			"Archived object definitions are read-only",
		);
	});
});

describe("record relation integrity", () => {
	it("rejects a one-to-one endpoint that is already related", async () => {
		const access = accessControlMock();
		const lockKeys: string[] = [];
		const tx = relationTransaction({
			cardinality: RelationCardinality.ONE_TO_ONE,
			existing: { id: "existing-relation" },
			lockKeys,
		});
		const service = new FieldsService(fakeDatabase(tx), access);

		await expect(
			service.createRecordRelation(
				{
					relationDefinitionId: "relation-1",
					sourceRecordId: "source-1",
					targetRecordId: "target-1",
				},
				{ ...principal, isAdmin: true },
			),
		).rejects.toThrow("one_to_one relation already exists");
		expect(lockKeys).toEqual([
			"crm:record-relation:1:1:source:relation-1:source-1",
			"crm:record-relation:1:1:target:relation-1:target-1",
		]);
	});

	it("rejects a target reused in a one-to-many relation", async () => {
		const access = accessControlMock();
		const lockKeys: string[] = [];
		const tx = relationTransaction({
			cardinality: RelationCardinality.ONE_TO_MANY,
			existing: { id: "existing-relation" },
			lockKeys,
		});
		const service = new FieldsService(fakeDatabase(tx), access);

		await expect(
			service.createRecordRelation(
				{
					relationDefinitionId: "relation-1",
					sourceRecordId: "source-1",
					targetRecordId: "target-1",
				},
				{ ...principal, isAdmin: true },
			),
		).rejects.toThrow("one_to_many relation already exists");
		expect(lockKeys).toEqual([
			"crm:record-relation:1:n:target:relation-1:target-1",
		]);
	});

	it("requires both records to match the relation object types", async () => {
		const access = accessControlMock();
		const tx = relationTransaction({
			cardinality: RelationCardinality.MANY_TO_MANY,
			targetRecord: null,
		});
		const service = new FieldsService(fakeDatabase(tx), access);

		await expect(
			service.createRecordRelation(
				{
					relationDefinitionId: "relation-1",
					sourceRecordId: "source-1",
					targetRecordId: "wrong-type",
				},
				{ ...principal, isAdmin: true },
			),
		).rejects.toThrow("related record was not found");
	});

	it("persists a valid many-to-many relation with its source scope", async () => {
		const access = accessControlMock();
		const created: Record<string, unknown>[] = [];
		const events: string[] = [];
		const lockKeys: string[] = [];
		const tx = relationTransaction({
			cardinality: RelationCardinality.MANY_TO_MANY,
			events,
			lockKeys,
			create: (data) => {
				created.push(data);
				return { id: "record-relation-1", ...data };
			},
		});
		const service = new FieldsService(fakeDatabase(tx), access);

		await service.createRecordRelation(
			{
				relationDefinitionId: "relation-1",
				sourceRecordId: "source-1",
				targetRecordId: "target-1",
			},
			{ ...principal, isAdmin: true },
		);

		expect(created[0]).toMatchObject({
			businessUnitId: "bu-1",
			sourceRecordId: "source-1",
			targetRecordId: "target-1",
		});
		expect(events.indexOf("lock")).toBeGreaterThanOrEqual(0);
		expect(events.indexOf("lock")).toBeLessThan(events.indexOf("check"));
		expect(events.indexOf("check")).toBeLessThan(events.indexOf("create"));
		expect(lockKeys).toEqual([
			"crm:record-relation:n:n:pair:relation-1:source-1:target-1",
		]);
	});

	it("maps a concurrent unique conflict to ConflictException", async () => {
		const access = accessControlMock();
		const tx = relationTransaction({
			cardinality: RelationCardinality.ONE_TO_ONE,
			createError: { code: "P2002" },
		});
		const service = new FieldsService(fakeDatabase(tx), access);

		await expect(
			service.createRecordRelation(
				{
					relationDefinitionId: "relation-1",
					sourceRecordId: "source-1",
					targetRecordId: "target-1",
				},
				{ ...principal, isAdmin: true },
			),
		).rejects.toThrow("one_to_one relation already exists");
	});
});

function fakeDatabase(tx: Record<string, unknown>): Db {
	return {
		$transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) =>
			callback(tx),
	} as unknown as Db;
}

function customRecordTransaction(archivedAt: Date | null = null) {
	let created: Record<string, unknown> | null = null;
	return {
		objectDefinition: {
			findFirst: async () => ({
				id: "object-custom",
				key: "custom-object",
				kind: ObjectDefinitionKind.CUSTOM,
				businessUnitId: "bu-1",
				archivedAt,
			}),
		},
		customObjectRecord: {
			create: async ({ data }: { data: Record<string, unknown> }) => {
				created = { id: "custom-record-1", ...data };
				return created;
			},
			findUniqueOrThrow: async () => created,
		},
		auditEvent: { create: async () => ({ id: "audit-1" }) },
	};
}

function relationTransaction(options: {
	cardinality: RelationCardinality;
	existing?: { id: string } | null;
	targetRecord?: Record<string, string> | null;
	events?: string[];
	createError?: { code: string };
	lockKeys?: string[];
	create?: (data: Record<string, unknown>) => Record<string, unknown>;
}) {
	const targetRecord =
		options.targetRecord === undefined
			? { id: "target-1", businessUnitId: "bu-1", teamId: null, ownerId: null }
			: options.targetRecord;
	return {
		objectRelationDefinition: {
			findUnique: async () => ({
				id: "relation-1",
				cardinality: options.cardinality,
				archivedAt: null,
				sourceObject: {
					id: "object-source",
					kind: ObjectDefinitionKind.CUSTOM,
					businessUnitId: "bu-1",
					archivedAt: null,
				},
				targetObject: {
					id: "object-target",
					kind: ObjectDefinitionKind.CUSTOM,
					businessUnitId: "bu-1",
					archivedAt: null,
				},
			}),
		},
		customObjectRecord: {
			findFirst: async ({ where }: { where: { AND: { id?: string }[] } }) => {
				const id = where.AND[0]?.id;
				if (id === "source-1") {
					return {
						id,
						businessUnitId: "bu-1",
						teamId: null,
						ownerId: null,
					};
				}
				return targetRecord;
			},
		},
		recordRelation: {
			findFirst: async () => {
				options.events?.push("check");
				return options.existing ?? null;
			},
			create: async ({ data }: { data: Record<string, unknown> }) => {
				options.events?.push("create");
				if (options.createError) throw options.createError;
				return options.create?.(data) ?? { id: "record-relation-1", ...data };
			},
		},
		auditEvent: { create: async () => ({ id: "audit-1" }) },
		$queryRaw: async (_query: unknown, key: string) => {
			options.events?.push("lock");
			options.lockKeys?.push(key);
			return [{ locked: 1 }];
		},
	};
}
