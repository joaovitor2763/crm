import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AccessScope,
	ApiCredentialAccessMode,
	AuditActorType,
	AutomationStatus,
	CustomFieldIndexMode,
	CustomFieldType,
	db,
	LeadSubmissionStatus,
	LifecycleStage,
	PermissionAction,
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
const crossScopeEmail = `external-api-cross-scope-${suffix}@example.test`;
const mcpOutOfScopeEmail = `external-api-mcp-out-of-scope-${suffix}@example.test`;
const createOnlyEmail = `external-api-create-only-${suffix}@example.test`;
const oracleFreshEmail = `external-api-oracle-fresh-${suffix}@example.test`;
const teamDefaultEmail = `external-api-team-default-${suffix}@example.test`;
const otherTeamEmail = `external-api-team-other-${suffix}@example.test`;
const noTeamEmail = `external-api-no-team-${suffix}@example.test`;
const otherTeamId = `external-api-other-team-${suffix}`;
const mcpOutOfScopeCompanyId = `external-api-mcp-out-of-scope-company-${suffix}`;
const createOnlyRoleId = `external-api-create-only-role-${suffix}`;
let app: Awaited<ReturnType<typeof createApp>>;
let token: string;
let credentialId: string;
let otherTeamBearer: string;
let otherTeamCredentialId: string;
let noTeamBearer: string;
let noTeamCredentialId: string;
let updateBearer: string;
let updateCredentialId: string;
let createOnlyBearer: string;
let createOnlyCredentialId: string;
let cloneBearer: string;
let cloneCredentialId: string;

async function cleanup() {
	await db.domainEvent.deleteMany({
		where: { recordId: { in: await contactIds() } },
	});
	await db.leadSubmission.deleteMany({
		where: { source: `external-test-${suffix}` },
	});
	await db.contact.deleteMany({
		where: {
			email: {
				in: [
					email,
					crossScopeEmail,
					mcpOutOfScopeEmail,
					createOnlyEmail,
					oracleFreshEmail,
					teamDefaultEmail,
					otherTeamEmail,
					noTeamEmail,
				],
			},
		},
	});
	if (
		credentialId ||
		otherTeamCredentialId ||
		noTeamCredentialId ||
		updateCredentialId ||
		createOnlyCredentialId ||
		cloneCredentialId
	) {
		await db.apiCredential.deleteMany({
			where: {
				id: {
					in: [
						credentialId,
						otherTeamCredentialId,
						noTeamCredentialId,
						updateCredentialId,
						createOnlyCredentialId,
						cloneCredentialId,
					].filter(Boolean),
				},
			},
		});
	}
	await db.role.deleteMany({ where: { id: createOnlyRoleId } });
	await db.user.deleteMany({ where: { id: userId } });
	await db.company.deleteMany({ where: { id: mcpOutOfScopeCompanyId } });
	await db.team.deleteMany({ where: { id: otherTeamId } });
}

async function contactIds() {
	const contacts = await db.contact.findMany({
		where: {
			email: {
				in: [
					email,
					crossScopeEmail,
					createOnlyEmail,
					oracleFreshEmail,
					teamDefaultEmail,
					otherTeamEmail,
					noTeamEmail,
				],
			},
		},
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
	await db.team.create({
		data: {
			id: otherTeamId,
			key: otherTeamId,
			name: "External API Other Team",
			businessUnitId: "business-unit-default",
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
	const clone = await credentials.create(
		{
			name: `External API Clone ${suffix}`,
			accessMode: ApiCredentialAccessMode.USER_DELEGATE,
		},
		principal,
	);
	cloneBearer = clone.token;
	cloneCredentialId = clone.id;
});

beforeAll(async () => {
	const access = app.get(AccessControlService);
	const credentials = app.get(ApiCredentialsService);
	const principal = await access.forUser(userId);
	await db.role.create({
		data: {
			id: createOnlyRoleId,
			key: createOnlyRoleId,
			name: `External API Create Only ${suffix}`,
			permissions: {
				create: {
					resource: "contacts",
					action: PermissionAction.CREATE,
					scope: AccessScope.TEAM,
				},
			},
		},
	});
	const createOnly = await credentials.create(
		{
			name: `External API Create Only ${suffix}`,
			roleId: createOnlyRoleId,
			businessUnitIds: ["business-unit-default"],
			teamIds: ["team-default"],
		},
		principal,
	);
	createOnlyBearer = createOnly.token;
	createOnlyCredentialId = createOnly.id;
});

afterAll(async () => {
	await cleanup();
	await app?.close();
});

beforeAll(async () => {
	const access = app.get(AccessControlService);
	const credentials = app.get(ApiCredentialsService);
	const principal = await access.forUser(userId);
	const otherTeam = await credentials.create(
		{
			name: `External API Other Team ${suffix}`,
			roleId: "role-sales-representative",
			businessUnitIds: ["business-unit-default"],
			teamIds: [otherTeamId],
		},
		principal,
	);
	otherTeamBearer = otherTeam.token;
	otherTeamCredentialId = otherTeam.id;

	const noTeam = await credentials.create(
		{
			name: `External API Business Unit ${suffix}`,
			roleId: "role-sales-manager",
			businessUnitIds: ["business-unit-default"],
			teamIds: [],
		},
		principal,
	);
	noTeamBearer = noTeam.token;
	noTeamCredentialId = noTeam.id;

	const updater = await credentials.create(
		{
			name: `External API Contact Updater ${suffix}`,
			roleId: "role-business-unit-admin",
			businessUnitIds: ["business-unit-default"],
			teamIds: [],
		},
		principal,
	);
	updateBearer = updater.token;
	updateCredentialId = updater.id;
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
		).toEqual(
			expect.arrayContaining([
				"submit_lead",
				"get_contact",
				"search_contacts",
				"update_contact",
				"search_companies",
				"create_company",
				"list_pipelines",
				"list_products",
				"search_deals",
				"get_deal",
				"create_deal",
				"move_deal",
				"add_deal_product",
				"read_timeline",
				"create_activity",
				"list_my_tasks",
				"complete_task",
				"search_revenue_accounts",
				"list_dashboard_definitions",
				"get_dashboard_definition",
				"create_dashboard_definition",
				"update_dashboard_definition",
				"publish_dashboard_definition",
				"export_dashboard_definition",
				"create_revenue_account",
				"get_revenue_account",
				"preview_revenue_account_merge",
				"merge_revenue_accounts",
				"read_revenue_analytics",
			]),
		);
	});

	it("lets a clone credential edit records and create tasks as its user", async () => {
		const access = app.get(AccessControlService);
		const delegated = await access.forApiCredential(cloneCredentialId);
		expect(delegated).toEqual(
			expect.objectContaining({
				actorType: AuditActorType.API_KEY,
				actorId: cloneCredentialId,
				userId,
				isAdmin: true,
			}),
		);

		const company = await db.company.create({
			data: {
				name: `Clone company ${suffix}`,
				unitStates: {
					create: {
						businessUnitId: "business-unit-default",
						teamId: "team-default",
						ownerId: userId,
					},
				},
			},
		});
		const contact = await db.contact.create({
			data: {
				firstName: "Clone tool",
				email: `clone-tool-${suffix}@example.test`,
				unitStates: {
					create: {
						businessUnitId: "business-unit-default",
						teamId: "team-default",
						ownerId: userId,
					},
				},
			},
		});
		try {
			const updated = await request(app.getHttpServer())
				.post("/mcp")
				.set("authorization", `Bearer ${cloneBearer}`)
				.set("accept", "application/json, text/event-stream")
				.send({
					jsonrpc: "2.0",
					id: 20,
					method: "tools/call",
					params: {
						name: "update_contact",
						arguments: {
							id: contact.id,
							data: {
								title: "Updated by clone",
								companyId: company.id,
							},
						},
					},
				})
				.expect(200);
			expect(mcpPayload(updated).result.isError).not.toBe(true);
			expect(
				await db.contact.findUnique({
					where: { id: contact.id },
					select: { title: true },
				}),
			).toEqual({ title: "Updated by clone" });

			const task = await request(app.getHttpServer())
				.post("/mcp")
				.set("authorization", `Bearer ${cloneBearer}`)
				.set("accept", "application/json, text/event-stream")
				.send({
					jsonrpc: "2.0",
					id: 21,
					method: "tools/call",
					params: {
						name: "create_activity",
						arguments: {
							type: "TASK",
							subject: "Follow up",
							contactId: contact.id,
						},
					},
				})
				.expect(200);
			if (mcpPayload(task).result.isError) {
				throw new Error(JSON.stringify(mcpPayload(task).result));
			}
			expect(
				await db.activity.count({
					where: { contactId: contact.id, createdById: userId, type: "TASK" },
				}),
			).toBe(1);

			const createdDeal = await request(app.getHttpServer())
				.post("/mcp")
				.set("authorization", `Bearer ${cloneBearer}`)
				.set("accept", "application/json, text/event-stream")
				.send({
					jsonrpc: "2.0",
					id: 22,
					method: "tools/call",
					params: {
						name: "create_deal",
						arguments: {
							name: `Clone deal ${suffix}`,
							contactId: contact.id,
						},
					},
				})
				.expect(200);
			if (mcpPayload(createdDeal).result.isError) {
				throw new Error(JSON.stringify(mcpPayload(createdDeal).result));
			}
			const deal = await db.deal.findFirstOrThrow({
				where: { name: `Clone deal ${suffix}` },
				select: { id: true, companyId: true, pipelineId: true, stageId: true },
			});
			expect(deal.companyId).toBe(company.id);
			expect(
				await db.dealContact.count({
					where: { dealId: deal.id, contactId: contact.id },
				}),
			).toBe(1);
			const targetStage = await db.pipelineStage.findFirst({
				where: {
					pipelineId: deal.pipelineId,
					id: { not: deal.stageId },
					type: "OPEN",
				},
				orderBy: { position: "asc" },
				select: { id: true },
			});
			if (!targetStage)
				throw new Error("Expected another open pipeline stage.");
			const moved = await request(app.getHttpServer())
				.post("/mcp")
				.set("authorization", `Bearer ${cloneBearer}`)
				.set("accept", "application/json, text/event-stream")
				.send({
					jsonrpc: "2.0",
					id: 23,
					method: "tools/call",
					params: {
						name: "move_deal",
						arguments: { id: deal.id, stageId: targetStage.id },
					},
				})
				.expect(200);
			if (mcpPayload(moved).result.isError) {
				throw new Error(JSON.stringify(mcpPayload(moved).result));
			}
			expect(
				await db.deal.findUnique({
					where: { id: deal.id },
					select: { stageId: true },
				}),
			).toEqual({ stageId: targetStage.id });
		} finally {
			await db.activity.deleteMany({
				where: {
					OR: [
						{ contactId: contact.id },
						{ deal: { name: `Clone deal ${suffix}` } },
					],
				},
			});
			await db.deal.deleteMany({ where: { name: `Clone deal ${suffix}` } });
			await db.contact.delete({ where: { id: contact.id } });
			await db.company.delete({ where: { id: company.id } });
		}
	});

	it("exposes scoped Account search and revenue analytics over REST", async () => {
		const accounts = await request(app.getHttpServer())
			.post("/api/v1/revenue-accounts/search")
			.set("authorization", `Bearer ${token}`)
			.send({ q: "", page: 1, pageSize: 10 })
			.expect(201);
		expect(accounts.body).toEqual(
			expect.objectContaining({
				rows: expect.any(Array),
				total: expect.any(Number),
			}),
		);

		const analytics = await request(app.getHttpServer())
			.post("/api/v1/analytics/revenue")
			.set("authorization", `Bearer ${token}`)
			.send({ dimensions: ["owner"] })
			.expect(201);
		expect(analytics.body.views).toEqual(expect.any(Array));
	});

	it("rejects an MCP lead that references an unreadable company", async () => {
		await db.company.create({
			data: {
				id: mcpOutOfScopeCompanyId,
				name: "MCP out-of-scope company",
				unitStates: {
					create: {
						businessUnitId: "business-unit-default",
						teamId: null,
					},
				},
			},
		});
		try {
			const response = await request(app.getHttpServer())
				.post("/mcp")
				.set("authorization", `Bearer ${token}`)
				.set("accept", "application/json, text/event-stream")
				.send({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: "submit_lead",
						arguments: {
							source: `external-test-${suffix}`,
							idempotencyKey: "mcp-out-of-scope-company-1",
							businessUnitId: "business-unit-default",
							teamId: "team-default",
							firstName: "MCP company scope",
							email: mcpOutOfScopeEmail,
							companyId: mcpOutOfScopeCompanyId,
						},
					},
				});
			expect(response.status).toBe(200);
			expect(mcpPayload(response).result.isError).toBe(true);
			expect(
				await db.contact.findUnique({
					where: { email: mcpOutOfScopeEmail },
					select: { id: true },
				}),
			).toBeNull();
		} finally {
			await db.company.delete({ where: { id: mcpOutOfScopeCompanyId } });
		}
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
		expect(first.body.contactId).toBeNull();
		expect(first.body.reasons).toBeUndefined();

		const repeated = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send(body)
			.expect(201);
		expect(repeated.body.id).toBe(first.body.id);
		expect(repeated.body.contactId).toBeNull();

		const duplicate = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send({ ...body, idempotencyKey: "lead-duplicate-1" })
			.expect(201);
		expect(duplicate.body.status).toBe("DUPLICATE");
		expect(duplicate.body.contactId).toBeNull();
		expect(duplicate.body.reasons).toContainEqual({
			code: "EMAIL_ALREADY_EXISTS",
		});

		const contacts = await request(app.getHttpServer())
			.get("/api/v1/contacts")
			.set("authorization", `Bearer ${token}`)
			.query({ email })
			.expect(200);
		expect(contacts.body).toHaveLength(1);
		const contact = await request(app.getHttpServer())
			.get(`/api/v1/contacts/${contacts.body[0].id}`)
			.set("authorization", `Bearer ${token}`)
			.expect(200);
		expect(contact.body.email).toBe(email);
		expect(contact.body.unitStates[0]?.businessUnitId).toBe(
			"business-unit-default",
		);

		const updated = await request(app.getHttpServer())
			.patch(`/api/v1/contacts/${contacts.body[0].id}`)
			.set("authorization", `Bearer ${updateBearer}`)
			.send({ title: "External Systems Manager" })
			.expect(200);
		expect(updated.body).toEqual(
			expect.objectContaining({
				id: contacts.body[0].id,
				firstName: "External",
			}),
		);
		expect(
			await db.contact.findUnique({
				where: { id: contacts.body[0].id },
				select: { title: true },
			}),
		).toEqual({ title: "External Systems Manager" });
	});

	it("allows a create-only credential to submit a lead", async () => {
		const body = {
			source: `external-test-${suffix}`,
			idempotencyKey: "create-only-1",
			businessUnitId: "business-unit-default",
			teamId: "team-default",
			firstName: "Create only",
			email: createOnlyEmail,
		};
		const first = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${createOnlyBearer}`)
			.send(body)
			.expect(201);
		expect(first.body.status).toBe("ACCEPTED");
		expect(first.body.contactId).toBeNull();
		expect(first.body.reasons).toBeUndefined();

		const contact = await db.contact.findUnique({
			where: { email: createOnlyEmail },
			select: { id: true },
		});
		expect(contact).not.toBeNull();

		const repeated = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${createOnlyBearer}`)
			.send(body)
			.expect(201);
		expect(repeated.body).toEqual(first.body);

		await request(app.getHttpServer())
			.patch(`/api/v1/contacts/${contact?.id}`)
			.set("authorization", `Bearer ${createOnlyBearer}`)
			.send({ title: "Not permitted" })
			.expect(403);
	});

	it("isolates idempotency by team and by the unassigned namespace", async () => {
		const common = {
			source: `external-test-${suffix}`,
			idempotencyKey: "team-isolation-1",
			businessUnitId: "business-unit-default",
			firstName: "Team isolated",
		};
		const defaultTeam = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send({ ...common, teamId: "team-default", email: teamDefaultEmail })
			.expect(201);
		const otherTeam = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${otherTeamBearer}`)
			.send({ ...common, teamId: otherTeamId, email: otherTeamEmail })
			.expect(201);
		const unassigned = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${noTeamBearer}`)
			.send({ ...common, email: noTeamEmail })
			.expect(201);

		expect(
			new Set([defaultTeam.body.id, otherTeam.body.id, unassigned.body.id])
				.size,
		).toBe(3);
		const stored = await db.leadSubmission.findMany({
			where: {
				source: common.source,
				idempotencyKey: common.idempotencyKey,
			},
			select: { id: true, teamId: true, idempotencyScopeKey: true },
			orderBy: { id: "asc" },
		});
		expect(stored).toHaveLength(3);
		expect(stored).toEqual(
			expect.arrayContaining([
				{
					id: defaultTeam.body.id,
					teamId: "team-default",
					idempotencyScopeKey: "team:team-default",
				},
				{
					id: otherTeam.body.id,
					teamId: otherTeamId,
					idempotencyScopeKey: `team:${otherTeamId}`,
				},
				{ id: unassigned.body.id, teamId: null, idempotencyScopeKey: "none" },
			]),
		);

		const replay = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${otherTeamBearer}`)
			.send({ ...common, teamId: otherTeamId, email: otherTeamEmail })
			.expect(201);
		expect(replay.body.id).toBe(otherTeam.body.id);
	});

	it("preserves team namespaces when teams are deleted", async () => {
		const source = `external-team-tombstone-${suffix}`;
		const idempotencyKey = "same-key";
		const tombstoneTeamIds = [
			`${otherTeamId}-tombstone-a`,
			`${otherTeamId}-tombstone-b`,
		];
		try {
			await db.team.createMany({
				data: tombstoneTeamIds.map((id) => ({
					id,
					key: id,
					name: id,
					businessUnitId: "business-unit-default",
				})),
			});
			await Promise.all(
				[...tombstoneTeamIds, null].map((teamId) =>
					db.leadSubmission.create({
						data: {
							source,
							idempotencyKey,
							status: LeadSubmissionStatus.REJECTED,
							payload: { source },
							businessUnitId: "business-unit-default",
							teamId,
							receivedByType: AuditActorType.SYSTEM,
						},
					}),
				),
			);
			const reassigned = await db.leadSubmission.create({
				data: {
					source,
					idempotencyKey: "reassigned-key",
					status: LeadSubmissionStatus.REJECTED,
					payload: { source },
					businessUnitId: "business-unit-default",
					receivedByType: AuditActorType.SYSTEM,
				},
			});
			const reassignedWithTeam = await db.leadSubmission.update({
				where: { id: reassigned.id },
				data: { teamId: tombstoneTeamIds[0] },
				select: { idempotencyScopeKey: true },
			});
			expect(reassignedWithTeam.idempotencyScopeKey).toBe(
				`team:${tombstoneTeamIds[0]}`,
			);

			await db.team.deleteMany({ where: { id: { in: tombstoneTeamIds } } });
			const stored = await db.leadSubmission.findMany({
				where: { source, idempotencyKey },
				select: { teamId: true, idempotencyScopeKey: true },
			});
			expect(stored).toHaveLength(3);
			expect(stored).toEqual(
				expect.arrayContaining([
					{ teamId: null, idempotencyScopeKey: `team:${tombstoneTeamIds[0]}` },
					{ teamId: null, idempotencyScopeKey: `team:${tombstoneTeamIds[1]}` },
					{ teamId: null, idempotencyScopeKey: "none" },
				]),
			);
		} finally {
			await db.leadSubmission.deleteMany({ where: { source } });
			await db.team.deleteMany({ where: { id: { in: tombstoneTeamIds } } });
		}
	});

	it("recovers the primary team scope for malformed routing hints", async () => {
		const body = {
			source: `external-test-${suffix}`,
			idempotencyKey: "malformed-team-scope-1",
			teamId: otherTeamId,
			firstName: "Missing channel",
		};
		const response = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send(body)
			.expect(201);
		const stored = await db.leadSubmission.findUniqueOrThrow({
			where: { id: response.body.id },
			select: { businessUnitId: true, teamId: true, idempotencyScopeKey: true },
		});
		expect(stored).toEqual({
			businessUnitId: "business-unit-default",
			teamId: "team-default",
			idempotencyScopeKey: "team:team-default",
		});

		const replay = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send({ ...body, teamId: undefined })
			.expect(201);
		expect(replay.body.id).toBe(response.body.id);
	});

	it("returns one durable receipt for concurrent invalid submissions", async () => {
		const body = {
			source: `external-test-${suffix}`,
			idempotencyKey: "invalid-race-1",
			businessUnitId: "business-unit-default",
			teamId: "team-default",
			firstName: "Missing channel",
		};
		const responses = await Promise.all(
			Array.from({ length: 4 }, () =>
				request(app.getHttpServer())
					.post("/api/v1/leads")
					.set("authorization", `Bearer ${token}`)
					.send(body),
			),
		);
		expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
		expect(responses.every((response) => response.status === 201)).toBe(true);
		expect(
			await db.leadSubmission.count({
				where: {
					source: body.source,
					idempotencyKey: body.idempotencyKey,
					idempotencyScopeKey: "team:team-default",
				},
			}),
		).toBe(1);
	});

	it("returns one durable receipt for concurrent custom-field rejections", async () => {
		const body = {
			source: `external-test-${suffix}`,
			idempotencyKey: "custom-field-race-1",
			businessUnitId: "business-unit-default",
			teamId: "team-default",
			firstName: "Invalid custom field",
			email: `external-api-custom-race-${suffix}@example.test`,
			customValues: { unknownField: true },
		};
		const responses = await Promise.all(
			Array.from({ length: 4 }, () =>
				request(app.getHttpServer())
					.post("/api/v1/leads")
					.set("authorization", `Bearer ${token}`)
					.send(body),
			),
		);
		expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
		expect(responses.every((response) => response.status === 201)).toBe(true);
		expect(
			await db.leadSubmission.count({
				where: {
					source: body.source,
					idempotencyKey: body.idempotencyKey,
					idempotencyScopeKey: "team:team-default",
				},
			}),
		).toBe(1);
	});

	it("preserves a rejected submission without creating a contact", async () => {
		const body = {
			source: `external-test-${suffix}`,
			idempotencyKey: "invalid-1",
			businessUnitId: "business-unit-default",
			teamId: "team-default",
			firstName: "Missing channel",
		};
		const response = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send(body)
			.expect(201);
		expect(response.body.status).toBe("REJECTED");
		expect(response.body.reasons).toBeArray();

		const repeated = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send(body)
			.expect(201);
		expect(repeated.body.id).toBe(response.body.id);
	});

	it("does not associate a duplicate that exists outside the credential scope", async () => {
		await db.contact.create({
			data: {
				firstName: "Scoped elsewhere",
				email: crossScopeEmail,
				unitStates: {
					create: {
						businessUnitId: "business-unit-default",
						teamId: otherTeamId,
					},
				},
			},
		});

		const response = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send({
				source: `external-test-${suffix}`,
				idempotencyKey: "cross-scope-1",
				businessUnitId: "business-unit-default",
				teamId: "team-default",
				firstName: "Cross scope",
				email: crossScopeEmail,
			})
			.expect(201);

		expect(response.body.status).toBe("ACCEPTED");
		expect(response.body.contactId).toBeNull();
		expect(response.body.reasons).toBeUndefined();

		const fresh = await request(app.getHttpServer())
			.post("/api/v1/leads")
			.set("authorization", `Bearer ${token}`)
			.send({
				source: `external-test-${suffix}`,
				idempotencyKey: "cross-scope-fresh-1",
				businessUnitId: "business-unit-default",
				teamId: "team-default",
				firstName: "Fresh lead",
				email: oracleFreshEmail,
			})
			.expect(201);
		expect({
			status: response.body.status,
			contactId: response.body.contactId,
			reasons: response.body.reasons,
		}).toEqual({
			status: fresh.body.status,
			contactId: fresh.body.contactId,
			reasons: fresh.body.reasons,
		});

		const hiddenContacts = await db.contact.findMany({
			where: { email: crossScopeEmail },
			select: { id: true },
		});
		expect(hiddenContacts).toHaveLength(1);
		const unresolved = await db.leadSubmission.findUnique({
			where: { id: response.body.id },
			select: { status: true, contactId: true, normalizedPayload: true },
		});
		expect(unresolved).toEqual({
			status: "NEEDS_REVIEW",
			contactId: null,
			normalizedPayload: expect.objectContaining({
				firstName: "Cross scope",
				email: crossScopeEmail,
			}),
		});
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
			isError?: boolean;
		};
	};
}
