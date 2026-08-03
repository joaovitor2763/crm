import { type Db, PermissionAction, type Prisma } from "@crm/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import type { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import {
	activityCreateInput,
	completeInput,
	myTasksInput,
	timelineInput,
} from "../activities/activities.contracts";
import type { ActivitiesService } from "../activities/activities.service";
import { companyCreateInput } from "../companies/companies.contracts";
import type { CompaniesService } from "../companies/companies.service";
import { contactUpdateArgs } from "../contacts/contacts.contracts";
import type { ContactsService } from "../contacts/contacts.service";
import {
	dealLineItemCreateInput,
	dealListInput,
	setStageInput,
} from "../deals/deals.contracts";
import type { DealsService } from "../deals/deals.service";
import type { PipelinesService } from "../pipelines/pipelines.service";
import type { ProductsService } from "../products/products.service";
import { toolResult } from "./mcp-result";

const createDealInput = z.object({
	name: z.string().trim().min(1),
	companyId: z.string().optional(),
	contactId: z.string().optional(),
	ownerId: z.string().optional(),
	businessUnitId: z.string().optional(),
	teamId: z.string().nullable().optional(),
	pipelineId: z.string().optional(),
	stageId: z.string().optional(),
	amountCents: z.number().int().min(0).nullable().optional(),
	currency: z.string().length(3).optional(),
	expectedCloseDate: z.string().nullable().optional(),
});

type Dependencies = {
	accessControl: AccessControlService;
	activities: ActivitiesService;
	companies: CompaniesService;
	contacts: ContactsService;
	deals: DealsService;
	pipelines: PipelinesService;
	products: ProductsService;
	db: Db;
	principal: EffectivePrincipal;
};

export function registerCrmOperationTools(
	server: McpServer,
	dependencies: Dependencies,
) {
	const {
		accessControl,
		activities,
		companies,
		contacts,
		deals,
		pipelines,
		products,
		db,
		principal,
	} = dependencies;
	const contactScope = (action: PermissionAction) =>
		accessControl.contactWhere(principal, CRM_RESOURCE.contacts, action);
	const companyScope = (action: PermissionAction) =>
		accessControl.companyWhere(principal, CRM_RESOURCE.companies, action);
	const dealScope = (action: PermissionAction) =>
		accessControl.dealWhere(principal, CRM_RESOURCE.deals, action);
	const activityScope = (action: PermissionAction) =>
		accessControl.activityWhere(principal, CRM_RESOURCE.activities, action);
	const requireDelegatedUser = () => {
		if (!principal.userId) {
			throw new ForbiddenException(
				"This action needs a 'Clone my access' credential because it records the acting user.",
			);
		}
		return principal.userId;
	};

	server.registerTool(
		"update_contact",
		{
			description:
				"Edit an existing contact. Use this after search_contacts; submit_lead is idempotent ingestion and does not edit an existing submission.",
			inputSchema: contactUpdateArgs,
		},
		async (input) => {
			const scope = contactScope(PermissionAction.UPDATE);
			if (input.data.companyId) {
				await accessControl.assertRecord(
					principal,
					CRM_RESOURCE.companies,
					PermissionAction.READ,
					input.data.companyId,
				);
			}
			if (input.data.ownerId !== undefined) {
				const current = await contacts.assignments(input.id, scope);
				const assignment =
					current.unitStates.find(
						(state) =>
							Boolean(
								state.teamId && principal.teamIds.includes(state.teamId),
							) || principal.businessUnitTreeIds.includes(state.businessUnitId),
					) ?? current.unitStates[0];
				await accessControl.assertAssignment(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.UPDATE,
					{ ...assignment, ownerId: input.data.ownerId },
				);
			}
			return toolResult(await contacts.update(input.id, input.data, scope));
		},
	);

	server.registerTool(
		"search_companies",
		{
			description:
				"Find visible companies by name or domain before linking a contact or creating a deal.",
			inputSchema: { query: z.string().trim().default("") },
		},
		async ({ query }) =>
			toolResult(
				await companies.options(query, companyScope(PermissionAction.READ)),
			),
	);

	server.registerTool(
		"create_company",
		{
			description:
				"Create a company so contacts and deals can be linked to it.",
			inputSchema: companyCreateInput,
		},
		async (input) => {
			const userId = requireDelegatedUser();
			await accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.companies,
				PermissionAction.CREATE,
				{
					businessUnitId:
						input.businessUnitId ?? principal.primaryBusinessUnitId,
					teamId: input.teamId ?? principal.primaryTeamId,
					ownerId: input.ownerId ?? userId,
				},
			);
			return toolResult(
				await companies.create(
					{ ...input, ownerId: input.ownerId ?? userId },
					principal,
				),
			);
		},
	);

	server.registerTool(
		"list_pipelines",
		{
			description:
				"List visible pipelines and ordered stage IDs. Use this before creating or moving a deal.",
			inputSchema: {},
		},
		async () =>
			toolResult(
				await pipelines.list(
					false,
					accessControl.configurationWhere(
						principal,
						CRM_RESOURCE.pipelines,
						PermissionAction.READ,
						true,
					) as Prisma.PipelineWhereInput,
				),
			),
	);

	server.registerTool(
		"list_products",
		{
			description:
				"List visible product IDs, prices and currencies for deal line items.",
			inputSchema: {},
		},
		async () =>
			toolResult(
				await products.list(
					false,
					accessControl.configurationWhere(
						principal,
						CRM_RESOURCE.products,
						PermissionAction.READ,
						true,
					) as Prisma.ProductWhereInput,
				),
			),
	);

	server.registerTool(
		"search_deals",
		{
			description:
				"Search visible deals by name and optional pipeline, stage, owner or status filters.",
			inputSchema: dealListInput,
		},
		async (input) =>
			toolResult(await deals.list(input, dealScope(PermissionAction.READ))),
	);

	server.registerTool(
		"get_deal",
		{
			description:
				"Read one visible deal including its company, contacts, products and stage.",
			inputSchema: { id: z.string() },
		},
		async ({ id }) =>
			toolResult(
				await deals.byId(
					id,
					dealScope(PermissionAction.READ),
					companyScope(PermissionAction.READ),
					contactScope(PermissionAction.READ),
				),
			),
	);

	server.registerTool(
		"create_deal",
		{
			description:
				"Create a deal and optionally link a contact. Provide companyId, or a contactId whose contact is already linked to a company. Owner defaults to the cloned user.",
			inputSchema: createDealInput,
		},
		async (input) => {
			const userId = requireDelegatedUser();
			let companyId = input.companyId;
			if (input.contactId) {
				await accessControl.assertRecord(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
					input.contactId,
				);
				const contact = await db.contact.findUnique({
					where: { id: input.contactId },
					select: { companyId: true },
				});
				if (!companyId) companyId = contact?.companyId ?? undefined;
				if (contact?.companyId && companyId !== contact.companyId) {
					throw new BadRequestException(
						"The contact belongs to a different company. Update the contact first.",
					);
				}
			}
			if (!companyId) {
				throw new BadRequestException(
					"A deal needs a company. Create or find a company, then link the contact with update_contact.",
				);
			}
			await accessControl.assertRecord(
				principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
				companyId,
			);
			const ownerId = input.ownerId ?? userId;
			await accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					businessUnitId:
						input.businessUnitId ?? principal.primaryBusinessUnitId,
					teamId: input.teamId ?? principal.primaryTeamId,
					ownerId,
				},
			);
			const { contactId, ...dealInput } = input;
			const deal = await deals.create({ ...dealInput, companyId, ownerId });
			if (contactId) {
				await db.dealContact.create({ data: { dealId: deal.id, contactId } });
			}
			return toolResult(deal);
		},
	);

	server.registerTool(
		"move_deal",
		{
			description:
				"Move a deal to a pipeline stage and record the stage change in its timeline.",
			inputSchema: setStageInput,
		},
		async (input) => {
			const userId = requireDelegatedUser();
			await deals.byId(input.id, dealScope(PermissionAction.UPDATE));
			return toolResult(await deals.setStage(input, userId, principal.roleKey));
		},
	);

	server.registerTool(
		"add_deal_product",
		{
			description:
				"Add a visible product to a deal. Use list_products first to obtain the product ID.",
			inputSchema: dealLineItemCreateInput,
		},
		async (input) =>
			toolResult(
				await deals.addLineItem(input, dealScope(PermissionAction.UPDATE)),
			),
	);

	server.registerTool(
		"read_timeline",
		{
			description:
				"Read the activity timeline for one company, contact or deal.",
			inputSchema: timelineInput,
		},
		async (input) => {
			await assertAnchor(
				accessControl,
				principal,
				input,
				PermissionAction.READ,
			);
			return toolResult(
				await activities.timeline(input, activityScope(PermissionAction.READ)),
			);
		},
	);

	server.registerTool(
		"create_activity",
		{
			description:
				"Add a task, note, call, email, meeting or message to a contact, company or deal. For a task use type TASK and provide subject and optional dueAt.",
			inputSchema: activityCreateInput,
		},
		async (input) => {
			const userId = requireDelegatedUser();
			await assertAnchor(
				accessControl,
				principal,
				input,
				PermissionAction.READ,
			);
			const placement = await activities.resolvePlacement(
				input,
				principal.businessUnitTreeIds,
				principal.primaryBusinessUnitId,
				principal.primaryTeamId,
			);
			await accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.activities,
				PermissionAction.CREATE,
				{ ...placement, ownerId: userId },
			);
			return toolResult(await activities.create(input, userId, placement));
		},
	);

	server.registerTool(
		"list_my_tasks",
		{
			description: "List open tasks assigned to the cloned user.",
			inputSchema: myTasksInput,
		},
		async (input) =>
			toolResult(
				await activities.myTasks(
					input,
					requireDelegatedUser(),
					activityScope(PermissionAction.READ),
				),
			),
	);

	server.registerTool(
		"complete_task",
		{
			description: "Complete or reopen a visible task.",
			inputSchema: completeInput,
		},
		async (input) =>
			toolResult(
				await activities.complete(
					input.id,
					input.completed,
					activityScope(PermissionAction.UPDATE),
				),
			),
	);
}

function assertAnchor(
	accessControl: AccessControlService,
	principal: EffectivePrincipal,
	input: { companyId?: string; contactId?: string; dealId?: string },
	action: PermissionAction,
) {
	if (input.dealId) {
		return accessControl.assertRecord(
			principal,
			CRM_RESOURCE.deals,
			action,
			input.dealId,
		);
	}
	if (input.contactId) {
		return accessControl.assertRecord(
			principal,
			CRM_RESOURCE.contacts,
			action,
			input.contactId,
		);
	}
	if (input.companyId) {
		return accessControl.assertRecord(
			principal,
			CRM_RESOURCE.companies,
			action,
			input.companyId,
		);
	}
	return Promise.resolve();
}
