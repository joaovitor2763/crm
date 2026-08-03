import { type Db, PermissionAction } from "@crm/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Controller, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import { ActivitiesService } from "../activities/activities.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import { AttributionService } from "../attribution/attribution.service";
import { CompaniesService } from "../companies/companies.service";
import { ContactsService } from "../contacts/contacts.service";
import { DashboardService } from "../dashboard/dashboard.service";
import { DashboardDefinitionService } from "../dashboard/dashboard-definition.service";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "../deals/deals.service";
import { FieldsService } from "../fields/fields.service";
import { PipelinesService } from "../pipelines/pipelines.service";
import { ProductsService } from "../products/products.service";
import { RevenueAccountsService } from "../revenue-accounts/revenue-accounts.service";
import { leadIngestionInput } from "./lead-ingestion.contracts";
import { LeadIngestionService } from "./lead-ingestion.service";
import { registerCrmOperationTools } from "./mcp-crm-tools";
import { toolError, toolResult } from "./mcp-result";
import { registerRevenueArchitectureTools } from "./mcp-revenue-tools";
import { scopedContactUnitStateWhere } from "./scoped-unit-state";

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
		@Inject(ActivitiesService)
		private readonly activities: ActivitiesService,
		@Inject(CompaniesService)
		private readonly companies: CompaniesService,
		@Inject(ContactsService)
		private readonly contacts: ContactsService,
		@Inject(DealsService)
		private readonly deals: DealsService,
		@Inject(PipelinesService)
		private readonly pipelines: PipelinesService,
		@Inject(ProductsService)
		private readonly products: ProductsService,
		@Inject(FieldsService)
		private readonly fields: FieldsService,
		@Inject(RevenueAccountsService)
		private readonly revenueAccounts: RevenueAccountsService,
		@Inject(DashboardService) private readonly dashboard: DashboardService,
		@Inject(AttributionService)
		private readonly attribution: AttributionService,
		@Inject(DashboardDefinitionService)
		private readonly dashboardDefinitions: DashboardDefinitionService,
		@InjectDatabase() private readonly db: Db,
	) {}

	@Post()
	async handle(
		@Headers("authorization") authorization: string | undefined,
		@Req() request: Request,
		@Res() response: Response,
	) {
		const credentialId = await this.credentials.authenticate(authorization);
		const principal = await this.accessControl.forApiCredential(credentialId);
		const server = new McpServer({ name: "crm-oss", version: "1.0.0" });

		server.registerTool(
			"submit_lead",
			{
				description:
					"Ingest a new lead idempotently. Reusing an idempotencyKey returns the original submission and does not edit the contact; use update_contact for changes.",
				inputSchema: leadIngestionInput,
			},
			async (input) => {
				await this.accessControl.assertAssignment(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.CREATE,
					input,
				);
				return toolResult(await this.leads.ingest(input, principal));
			},
		);

		registerRevenueArchitectureTools(server, {
			accounts: this.revenueAccounts,
			attribution: this.attribution,
			dashboard: this.dashboard,
			definitions: this.dashboardDefinitions,
			accessControl: this.accessControl,
			principal,
		});

		registerCrmOperationTools(server, {
			accessControl: this.accessControl,
			activities: this.activities,
			companies: this.companies,
			contacts: this.contacts,
			deals: this.deals,
			pipelines: this.pipelines,
			products: this.products,
			db: this.db,
			principal,
		});

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
					select: mcpContactSelect(
						principal,
						this.accessControl.permission(
							principal,
							CRM_RESOURCE.contacts,
							PermissionAction.READ,
						),
					),
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
					select: mcpContactSelect(
						principal,
						this.accessControl.permission(
							principal,
							CRM_RESOURCE.contacts,
							PermissionAction.READ,
						),
					),
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

function mcpContactSelect(
	principal: Awaited<ReturnType<AccessControlService["forApiCredential"]>>,
	scope: ReturnType<AccessControlService["permission"]>,
) {
	return {
		id: true,
		firstName: true,
		lastName: true,
		email: true,
		phone: true,
		title: true,
		globalLifecycleStage: true,
		globalMarketingScore: true,
		company: { select: { id: true, name: true, domain: true } },
		owner: { select: { id: true, name: true, email: true } },
		customValues: true,
		unitStates: {
			where: scopedContactUnitStateWhere(principal, scope),
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
