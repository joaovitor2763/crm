import { AuditActorType, type Db, PermissionAction } from "@crm/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Controller, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import { leadIngestionInput } from "./lead-ingestion.contracts";
import { LeadIngestionService } from "./lead-ingestion.service";

@Controller("mcp")
@AllowAnonymous()
export class McpController {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(LeadIngestionService)
		private readonly leads: LeadIngestionService,
		@Inject(FieldsService)
		private readonly fields: FieldsService,
		@InjectDatabase() private readonly db: Db,
	) {}

	@Post()
	async handle(
		@Headers("authorization") authorization: string | undefined,
		@Req() request: Request,
		@Res() response: Response,
	) {
		const credentialId = await this.credentials.authenticate(authorization);
		const credentialPrincipal =
			await this.accessControl.forApiCredential(credentialId);
		const principal = {
			...credentialPrincipal,
			actorType: AuditActorType.AGENT,
		};
		const server = new McpServer({ name: "crm-oss", version: "1.0.0" });

		server.registerTool(
			"submit_lead",
			{
				description:
					"Submit a contact lead to the CRM with idempotency and preserved validation outcomes.",
				inputSchema: leadIngestionInput,
			},
			async (input) => {
				this.accessControl.assertAssignment(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.CREATE,
					input,
				);
				return toolResult(await this.leads.ingest(input, principal));
			},
		);

		server.registerTool(
			"get_contact",
			{
				description: "Read one contact visible to this credential.",
				inputSchema: { id: z.string() },
			},
			async ({ id }) => {
				const scope = this.accessControl.contactWhere(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
				);
				const contact = await this.db.contact.findFirst({
					where: { AND: [{ id, archivedAt: null }, scope] },
					select: mcpContactSelect(principal.businessUnitTreeIds),
				});
				return contact
					? toolResult({
							...contact,
							customValues: await this.fields.projectChannelValues(
								"contacts",
								contact.customValues,
								principal,
								"agent",
							),
						})
					: toolError("Contact not found or outside this credential's scope.");
			},
		);

		server.registerTool(
			"search_contacts",
			{
				description:
					"Search visible contacts by exact email or a name fragment. Returns at most 100 records.",
				inputSchema: {
					email: z.email().optional(),
					name: z.string().trim().min(1).optional(),
					limit: z.number().int().min(1).max(100).default(25),
				},
			},
			async ({ email, name, limit }) => {
				const scope = this.accessControl.contactWhere(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
				);
				const contacts = await this.db.contact.findMany({
					where: {
						AND: [
							{ archivedAt: null },
							email ? { email: email.toLowerCase() } : {},
							name
								? {
										OR: [
											{ firstName: { contains: name, mode: "insensitive" } },
											{ lastName: { contains: name, mode: "insensitive" } },
										],
									}
								: {},
							scope,
						],
					},
					take: limit,
					orderBy: { createdAt: "desc" },
					select: mcpContactSelect(principal.businessUnitTreeIds),
				});
				return toolResult(
					await Promise.all(
						contacts.map(async (contact) => ({
							...contact,
							customValues: await this.fields.projectChannelValues(
								"contacts",
								contact.customValues,
								principal,
								"agent",
							),
						})),
					),
				);
			},
		);

		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
		try {
			await server.connect(transport);
			await transport.handleRequest(request, response, request.body);
		} finally {
			response.on("close", () => {
				void transport.close();
				void server.close();
			});
		}
	}
}

function mcpContactSelect(businessUnitIds: string[]) {
	return {
		id: true,
		firstName: true,
		lastName: true,
		email: true,
		phone: true,
		title: true,
		globalLifecycleStage: true,
		globalMarketingScore: true,
		customValues: true,
		unitStates: {
			where: { businessUnitId: { in: businessUnitIds } },
			select: {
				businessUnitId: true,
				teamId: true,
				lifecycleStage: true,
				marketingScore: true,
				marketingQualifiedAt: true,
			},
		},
		createdAt: true,
		updatedAt: true,
	} as const;
}

function toolResult(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
		structuredContent: { result: toStructuredValue(value) },
	};
}

function toolError(message: string) {
	return {
		isError: true,
		content: [{ type: "text" as const, text: message }],
	};
}

function toStructuredValue(value: unknown): object {
	const serialized = JSON.parse(JSON.stringify(value));
	return Array.isArray(serialized) ? { items: serialized } : serialized;
}
