import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AutomationStatus,
	CustomFieldIndexMode,
	CustomFieldType,
	db,
	LifecycleStage,
} from "@crm/db";
import request from "supertest";
import { AccessControlService } from "../src/access-control/access-control.service";
import { ApiCredentialsService } from "../src/api-credentials/api-credentials.service";
import { AutomationsService } from "../src/automations/automations.service";
import { createApp } from "../src/create-app";
import { FieldsService } from "../src/fields/fields.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `external-api-admin-${suffix}`;
const email = `external-api-lead-${suffix}@example.test`;
let app: Awaited<ReturnType<typeof createApp>>;
let token: string;
let credentialId: string;

async function cleanup() {
	await db.domainEvent.deleteMany({
		where: { recordId: { in: await contactIds() } },
	});
	await db.leadSubmission.deleteMany({
		where: { source: `external-test-${suffix}` },
	});
	await db.contact.deleteMany({ where: { email } });
	if (credentialId) {
		await db.apiCredential.deleteMany({ where: { id: credentialId } });
	}
	await db.user.deleteMany({ where: { id: userId } });
}

async function contactIds() {
	const contacts = await db.contact.findMany({
		where: { email },
		select: { id: true },
	});
	return contacts.map((contact) => contact.id);
}

beforeAll(async () => {
	await cleanup();
	await db.user.create({
		data: {
			id: userId,
			name: "External API Test Admin",
			email: `${userId}@example.test`,
			access: {
				create: {
					roleId: "role-global-admin",
					primaryBusinessUnitId: "business-unit-default",
					primaryTeamId: "team-default",
				},
			},
			businessUnitMemberships: {
				create: { businessUnitId: "business-unit-default", type: "ADMIN" },
			},
			teamMemberships: {
				create: { teamId: "team-default", isLead: true },
			},
		},
	});
	app = await createApp();
	await app.init();
	const access = app.get(AccessControlService);
	const credentials = app.get(ApiCredentialsService);
	const principal = await access.forUser(userId);
	const created = await credentials.create(
		{
			name: `External API Test ${suffix}`,
			roleId: "role-sales-representative",
			businessUnitIds: ["business-unit-default"],
			teamIds: ["team-default"],
		},
		principal,
	);
	token = created.token;
	credentialId = created.id;
});

afterAll(async () => {
	await cleanup();
	await app?.close();
});

describe("external CRM API", () => {
	it("exposes the scoped CRM tools through Streamable HTTP MCP", async () => {
		const initialized = await request(app.getHttpServer())
			.post("/mcp")
			.set("authorization", `Bearer ${token}`)
			.set("accept", "application/json, text/event-stream")
			.send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "crm-integration-test", version: "1.0.0" },
				},
			})
			.expect(200);
		expect(mcpPayload(initialized).result.serverInfo.name).toBe("crm-oss");

		const tools = await request(app.getHttpServer())
			.post("/mcp")
			.set("authorization", `Bearer ${token}`)
			.set("accept", "application/json, text/event-stream")
			.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
			.expect(200);
		expect(
			mcpPayload(tools).result.tools.map((tool: { name: string }) => tool.name),
		).toEqual(["submit_lead", "get_contact", "search_contacts"]);
	});

	it("validates typed fields and materializes indexed values", async () => {
		const access = app.get(AccessControlService);
		const fields = app.get(FieldsService);
		const admin = await access.forUser(userId);
		const contact = await db.contact.create({
			data: {
				firstName: "Typed",
				email: `typed-${suffix}@example.test`,
				unitStates: {
					create: {
						businessUnitId: "business-unit-default",
						teamId: "team-default",
					},
				},
			},
			select: { id: true },
		});
		const object = await db.objectDefinition.findUniqueOrThrow({
			where: { key: "contacts" },
			select: { id: true },
		});
		const field = await fields.createField(
			{
				objectDefinitionId: object.id,
				businessUnitId: "business-unit-default",
				key: `lead-score-${suffix}`,
				label: "Lead score test",
				type: CustomFieldType.NUMBER,
				indexMode: CustomFieldIndexMode.INDEXED,
				classification: "INTERNAL",
				isRequired: false,
				agentReadable: true,
				agentWritable: true,
				apiReadable: true,
				apiWritable: true,
				options: [],
			},
			admin,
		);
		try {
			await fields.setRecordValues(
				{
					objectKey: "contacts",
					recordId: contact.id,
					businessUnitId: "business-unit-default",
					values: { [field.key]: 42.5 },
				},
				admin,
			);
			const projection = await db.customFieldSearchValue.findFirstOrThrow({
				where: { fieldId: field.id, contactId: contact.id },
				select: { numberValue: true },
			});
			expect(Number(projection.numberValue)).toBe(42.5);

			await fields.setPermission(
				{
					fieldId: field.id,
					roleId: "role-sales-representative",
					canRead: false,
					canUpdate: false,
				},
				admin,
			);
			const delegated = await access.forApiCredential(credentialId);
			await expect(
				fields.validateChannelValues(
					"contacts",
					"business-unit-default",
					{ [field.key]: 10 },
					delegated,
					"api",
				),
			).rejects.toThrow("read-only");
		} finally {
			await db.customFieldDefinition.delete({ where: { id: field.id } });
			await db.contact.delete({ where: { id: contact.id } });
		}
	});

	it("leases an event and qualifies the contact through a bounded automation", async () => {
		const access = app.get(AccessControlService);
		const automations = app.get(AutomationsService);
		const admin = await access.forUser(userId);
		const contact = await db.contact.create({
			data: {
				firstName: "Automated",
				email: `automated-${suffix}@example.test`,
				unitStates: {
					create: {
						businessUnitId: "business-unit-default",
						teamId: "team-default",
					},
				},
			},
			select: { id: true },
		});
		const automation = await automations.create(
			{
				name: `MQL integration ${suffix}`,
				roleId: "role-marketing-manager",
				businessUnitId: "business-unit-default",
				teamId: null,
				trigger: { eventTypes: [`test.lead.${suffix}`] },
				conditions: [],
				actions: [
					{
						type: "set_lifecycle",
						lifecycleStage: LifecycleStage.MQL,
						marketingScore: 80,
						qualificationReason: "Integration rule",
					},
				],
			},
			admin,
		);
		await db.automation.update({
			where: { id: automation.id },
			data: { status: AutomationStatus.ACTIVE },
		});
		await db.domainEvent.create({
			data: {
				eventKey: `test.lead.${suffix}:${contact.id}`,
				type: `test.lead.${suffix}`,
				resource: "contacts",
				recordId: contact.id,
				businessUnitId: "business-unit-default",
				teamId: "team-default",
				actorType: "SYSTEM",
				payload: {},
			},
		});
		try {
			for (let attempt = 0; attempt < 5; attempt += 1) {
				await automations.processBatch();
				const run = await db.automationRun.findFirst({
					where: { automationId: automation.id, status: "SUCCEEDED" },
				});
				if (run) break;
			}
			const qualified = await db.contact.findUniqueOrThrow({
				where: { id: contact.id },
				include: { unitStates: true },
			});
			expect(qualified.globalLifecycleStage).toBe(LifecycleStage.MQL);
			expect(qualified.unitStates[0]?.lifecycleStage).toBe(LifecycleStage.MQL);
		} finally {
			await db.automationRun.deleteMany({
				where: { automationId: automation.id },
			});
			await db.automation.delete({ where: { id: automation.id } });
			await db.domainEvent.deleteMany({ where: { recordId: contact.id } });
			await db.contact.delete({ where: { id: contact.id } });
		}
	});

	it("accepts one idempotent lead and exposes it inside the credential scope", async () => {
		const body = {
			source: `external-test-${suffix}`,
			idempotencyKey: "lead-1",
			businessUnitId: "business-unit-default",
			teamId: "team-default",
			firstName: "External",
			lastName: "Lead",
			email,
			utmSource: "integration-test",
		};
		const first = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send(body)
			.expect(201);
		expect(first.body.status).toBe("ACCEPTED");
		expect(first.body.contactId).toBeString();

		const repeated = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send(body)
			.expect(201);
		expect(repeated.body.id).toBe(first.body.id);

		const contact = await request(app.getHttpServer())
			.get(`/api/v1/contacts/${first.body.contactId}`)
			.set("authorization", `Bearer ${token}`)
			.expect(200);
		expect(contact.body.email).toBe(email);
		expect(contact.body.unitStates[0]?.businessUnitId).toBe(
			"business-unit-default",
		);
	});

	it("preserves a rejected submission without creating a contact", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send({
				source: `external-test-${suffix}`,
				idempotencyKey: "invalid-1",
				businessUnitId: "business-unit-default",
				teamId: "team-default",
				firstName: "Missing channel",
			})
			.expect(201);
		expect(response.body.status).toBe("REJECTED");
		expect(response.body.reasons).toBeArray();
	});
});

function mcpPayload(response: request.Response) {
	if (response.body?.result) return response.body;
	const data = response.text
		.split("\n")
		.find((line) => line.startsWith("data: "))
		?.slice(6);
	if (!data)
		throw new Error("MCP response did not contain a JSON-RPC payload.");
	return JSON.parse(data) as {
		result: {
			serverInfo: { name: string };
			tools: Array<{ name: string }>;
		};
	};
}
