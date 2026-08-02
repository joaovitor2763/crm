import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import { AccessControlService } from "../src/access-control/access-control.service";
import type { EffectivePrincipal } from "../src/access-control/access-control.types";
import { OntologyService } from "../src/fields/ontology.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `ontology-test-${suffix}`;
const schemaKey = `ontology-${suffix}`;

let service: OntologyService;
let principal: EffectivePrincipal;
let firstDraftId: string;
let publishedId: string;

async function cleanup() {
	await db.domainEvent.deleteMany({
		where: { resource: "ontology-schemas", actorId: userId },
	});
	await db.auditEvent.deleteMany({
		where: { resource: "ontology-schemas", actorId: userId },
	});
	await db.ontologySchemaDefinition.deleteMany({ where: { key: schemaKey } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await cleanup();
	await db.user.create({
		data: {
			id: userId,
			name: "Ontology Test Admin",
			email: `${userId}@example.test`,
		},
	});
	await db.userAccess.create({
		data: {
			userId,
			roleId: "role-global-admin",
			primaryBusinessUnitId: "business-unit-default",
			primaryTeamId: "team-default",
		},
	});
	await db.businessUnitMembership.create({
		data: {
			userId,
			businessUnitId: "business-unit-default",
			type: "ADMIN",
		},
	});
	await db.teamMembership.create({
		data: { userId, teamId: "team-default", isLead: true },
	});
	const access = new AccessControlService(db);
	principal = await access.forUser(userId);
	service = new OntologyService(db);
});

afterAll(cleanup);

describe("Ontology schema journal", () => {
	it("creates a draft from the runtime schema and previews its impact", async () => {
		const draft = await service.createDraft(
			{ key: schemaKey, name: "Test ontology" },
			principal,
		);
		firstDraftId = draft.id;
		expect(draft.status).toBe("DRAFT");
		expect(draft.version).toBe(1);
		expect(draft.snapshot).toBeDefined();
		expect(draft.checksum).toMatch(/^[a-f0-9]{64}$/);

		const preview = await service.impactPreview(draft.id, principal);
		expect(preview.fromVersion).toBeNull();
		expect(preview.impact.objects.added.length).toBeGreaterThanOrEqual(0);
	});

	it("requires explicit confirmation and keeps one published version", async () => {
		await expect(
			service.publish(firstDraftId, false, principal),
		).rejects.toThrow("confirmed: true");
		const published = await service.publish(firstDraftId, true, principal);
		publishedId = published.id;
		expect(published.status).toBe("PUBLISHED");

		const nextDraft = await service.createDraft(
			{ key: schemaKey, name: "Test ontology" },
			principal,
		);
		expect(nextDraft.version).toBe(2);
		const snapshot = nextDraft.snapshot as {
			objects: Array<{ name: string }>;
		};
		if (snapshot.objects[0]) snapshot.objects[0].name = "Renamed object";
		const replaced = await service.replaceDraft(
			{ id: nextDraft.id, snapshot: nextDraft.snapshot as never },
			principal,
		);
		expect(replaced.version).toBe(3);
		await service.publish(replaced.id, true, principal);

		const versions = await db.ontologySchemaVersion.findMany({
			where: { schemaDefinition: { key: schemaKey } },
			orderBy: { version: "asc" },
			select: { id: true, status: true },
		});
		expect(
			versions.filter((version) => version.status === "PUBLISHED"),
		).toHaveLength(1);
		expect(versions.find((version) => version.id === publishedId)?.status).toBe(
			"ARCHIVED",
		);
		const original = await db.ontologySchemaVersion.findUnique({
			where: { id: publishedId },
			select: { checksum: true, snapshot: true },
		});
		expect(original?.checksum).toBe(published.checksum);
		const events = await db.domainEvent.findMany({
			where: { resource: "ontology-schemas", actorId: userId },
			select: { type: true },
		});
		expect(events.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				"ontology.schema.draft.created",
				"ontology.schema.published",
			]),
		);
	});

	it("restricts the journal to global administrators", async () => {
		const scoped = { ...principal, isAdmin: false };
		await expect(
			service.list({ includeArchived: false }, scoped),
		).rejects.toBeInstanceOf(ForbiddenException);
	});
});
