import { AccessScope, type Db, PermissionAction, type Prisma } from "@crm/db";
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
import {
	companyCreateInput,
	companyIdInput,
	companyUpdateArgs,
	setPrimaryContactInput,
} from "../companies/companies.contracts";
import type { CompaniesService } from "../companies/companies.service";
import type { ContactLifecycleService } from "../contacts/contact-lifecycle.service";
import {
	contactCreateInput,
	contactIdInput,
	contactLifecycleInput,
	contactUpdateArgs,
} from "../contacts/contacts.contracts";
import type { ContactsService } from "../contacts/contacts.service";
import {
	dealIdInput,
	dealLineItemCreateInput,
	dealLineItemIdInput,
	dealLineItemUpdateInput,
	dealListInput,
	dealUpdateArgs,
	setStageInput,
} from "../deals/deals.contracts";
import type { DealsService } from "../deals/deals.service";
import type { PipelinesService } from "../pipelines/pipelines.service";
import {
	productCreateInput,
	productIdInput,
	productListInput,
	productUpdateInput,
} from "../products/products.contracts";
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
	lifecycle: ContactLifecycleService;
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
		lifecycle,
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
	const productScope = (
		action: PermissionAction,
		includeGlobal: boolean,
	): Prisma.ProductWhereInput =>
		accessControl.configurationWhere(
			principal,
			CRM_RESOURCE.products,
			action,
			includeGlobal,
		) as Prisma.ProductWhereInput;
	const relatedContactScope = (): Prisma.ContactWhereInput =>
		accessControl.permission(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		) === AccessScope.NONE
			? { id: { in: [] } }
			: contactScope(PermissionAction.READ);
	const relatedDealScope = (): Prisma.DealWhereInput =>
		accessControl.permission(
			principal,
			CRM_RESOURCE.deals,
			PermissionAction.READ,
		) === AccessScope.NONE
			? { id: { in: [] } }
			: dealScope(PermissionAction.READ);
	const requireDelegatedUser = () => {
		if (!principal.userId) {
			throw new ForbiddenException(
				"This action needs a 'Clone my access' credential because it records the acting user.",
			);
		}
		return principal.userId;
	};

	server.registerTool(
		"create_contact",
		{
			description:
				"Create a contact directly in the CRM. Unlike submit_lead, this returns the canonical contact and is intended for a cloned user acting interactively.",
			inputSchema: contactCreateInput,
		},
		async (input) => {
			const userId = requireDelegatedUser();
			if (input.companyId) {
				await accessControl.assertRecord(
					principal,
					CRM_RESOURCE.companies,
					PermissionAction.READ,
					input.companyId,
				);
			}
			const ownerId = input.ownerId ?? userId;
			await accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.CREATE,
				{
					businessUnitId:
						input.businessUnitId ?? principal.primaryBusinessUnitId,
					teamId: input.teamId ?? principal.primaryTeamId,
					ownerId,
				},
			);
			return toolResult(
				await contacts.create({ ...input, ownerId }, principal),
			);
		},
	);

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
		"set_contact_lifecycle",
		{
			description:
				"Move a visible contact to a lifecycle stage inside one business unit, optionally updating its score, owner and qualification reason.",
			inputSchema: contactLifecycleInput,
		},
		async (input) => {
			await accessControl.assertRecord(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.UPDATE,
				input.contactId,
			);
			await accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.UPDATE,
				{
					businessUnitId: input.businessUnitId,
					teamId: input.teamId,
					ownerId: input.ownerId,
				},
			);
			return toolResult(await lifecycle.setLifecycle(input, principal));
		},
	);

	server.registerTool(
		"list_archived_contacts",
		{
			description:
				"List archived contacts visible to this credential so they can be inspected or restored.",
			inputSchema: {},
		},
		async () =>
			toolResult(await contacts.archived(contactScope(PermissionAction.READ))),
	);

	server.registerTool(
		"archive_contact",
		{
			description: "Archive a visible contact without deleting its history.",
			inputSchema: contactIdInput,
		},
		async ({ id }) =>
			toolResult(
				await contacts.archive(id, contactScope(PermissionAction.ARCHIVE)),
			),
	);

	server.registerTool(
		"restore_contact",
		{
			description: "Restore an archived contact visible to this credential.",
			inputSchema: contactIdInput,
		},
		async ({ id }) =>
			toolResult(
				await contacts.restore(id, contactScope(PermissionAction.RESTORE)),
			),
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
		"get_company",
		{
			description:
				"Read one visible company including the contacts and deals this credential may see.",
			inputSchema: companyIdInput,
		},
		async ({ id }) =>
			toolResult(
				await companies.byId(
					id,
					companyScope(PermissionAction.READ),
					relatedContactScope(),
					relatedDealScope(),
				),
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
		"update_company",
		{
			description:
				"Edit an existing company, including ownership and standard profile fields.",
			inputSchema: companyUpdateArgs,
		},
		async (input) => {
			const scope = companyScope(PermissionAction.UPDATE);
			if (input.data.ownerId !== undefined) {
				const current = await companies.assignments(input.id, scope);
				const assignment =
					current.unitStates.find(
						(state) =>
							Boolean(
								state.teamId && principal.teamIds.includes(state.teamId),
							) || principal.businessUnitTreeIds.includes(state.businessUnitId),
					) ?? current.unitStates[0];
				await accessControl.assertAssignment(
					principal,
					CRM_RESOURCE.companies,
					PermissionAction.UPDATE,
					{ ...assignment, ownerId: input.data.ownerId },
				);
			}
			return toolResult(await companies.update(input.id, input.data, scope));
		},
	);

	server.registerTool(
		"set_company_primary_contact",
		{
			description:
				"Set or clear a company's primary contact. Both records must be visible to the credential.",
			inputSchema: setPrimaryContactInput,
		},
		async (input) => {
			await accessControl.assertRecord(
				principal,
				CRM_RESOURCE.companies,
				PermissionAction.UPDATE,
				input.companyId,
			);
			if (input.contactId) {
				await accessControl.assertRecord(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
					input.contactId,
				);
			}
			return toolResult(
				await companies.setPrimaryContact(input.companyId, input.contactId),
			);
		},
	);

	server.registerTool(
		"list_archived_companies",
		{
			description:
				"List archived companies visible to this credential so they can be inspected or restored.",
			inputSchema: {},
		},
		async () =>
			toolResult(await companies.archived(companyScope(PermissionAction.READ))),
	);

	server.registerTool(
		"archive_company",
		{
			description: "Archive a visible company without deleting its history.",
			inputSchema: companyIdInput,
		},
		async ({ id }) =>
			toolResult(
				await companies.archive(id, companyScope(PermissionAction.ARCHIVE)),
			),
	);

	server.registerTool(
		"restore_company",
		{
			description: "Restore an archived company visible to this credential.",
			inputSchema: companyIdInput,
		},
		async ({ id }) =>
			toolResult(
				await companies.restore(id, companyScope(PermissionAction.RESTORE)),
			),
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
				"List visible product IDs, prices and currencies for deal line items. Set includeArchived to find products that can be restored.",
			inputSchema: productListInput,
		},
		async ({ includeArchived }) =>
			toolResult(
				await products.list(
					includeArchived,
					productScope(PermissionAction.READ, true),
				),
			),
	);

	server.registerTool(
		"create_product",
		{
			description:
				"Create a product in the CRM catalogue. Prices are integer cents and currency is a three-letter code.",
			inputSchema: productCreateInput,
		},
		async (input) => {
			const businessUnitId =
				input.businessUnitId ?? principal.primaryBusinessUnitId;
			await accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.products,
				PermissionAction.MANAGE,
				{ businessUnitId },
			);
			return toolResult(await products.create({ ...input, businessUnitId }));
		},
	);

	server.registerTool(
		"update_product",
		{
			description:
				"Update a visible product's SKU, name, price or currency without changing existing deal snapshots.",
			inputSchema: productUpdateInput,
		},
		async (input) =>
			toolResult(
				await products.update(
					input,
					productScope(PermissionAction.MANAGE, false),
				),
			),
	);

	server.registerTool(
		"archive_product",
		{
			description:
				"Archive a visible product so it cannot be added to new deals; historical line items remain intact.",
			inputSchema: productIdInput,
		},
		async ({ id }) =>
			toolResult(
				await products.archive(
					id,
					productScope(PermissionAction.MANAGE, false),
				),
			),
	);

	server.registerTool(
		"restore_product",
		{
			description: "Restore an archived product to the active catalogue.",
			inputSchema: productIdInput,
		},
		async ({ id }) =>
			toolResult(
				await products.restore(
					id,
					productScope(PermissionAction.MANAGE, false),
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
			const deal = await deals.create(
				{ ...dealInput, companyId, ownerId },
				{
					actorType: principal.actorType,
					actorId: principal.actorId,
				},
			);
			if (contactId) {
				await db.dealContact.create({ data: { dealId: deal.id, contactId } });
			}
			return toolResult(deal);
		},
	);

	server.registerTool(
		"update_deal",
		{
			description:
				"Edit a visible deal's name, company, owner, value, currency or expected close date. Use move_deal for pipeline stage changes.",
			inputSchema: dealUpdateArgs,
		},
		async (input) => {
			const scope = dealScope(PermissionAction.UPDATE);
			const assignment = await deals.assignment(input.id, scope);
			if (input.data.ownerId !== undefined) {
				await accessControl.assertAssignment(
					principal,
					CRM_RESOURCE.deals,
					PermissionAction.UPDATE,
					{ ...assignment, ownerId: input.data.ownerId },
				);
			}
			if (input.data.companyId !== undefined) {
				await accessControl.assertRecord(
					principal,
					CRM_RESOURCE.companies,
					PermissionAction.READ,
					input.data.companyId,
				);
			}
			return toolResult(await deals.update(input.id, input.data, scope));
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
			return toolResult(
				await deals.setStage(input, userId, principal.roleKey, {
					actorType: principal.actorType,
					actorId: principal.actorId,
				}),
			);
		},
	);

	server.registerTool(
		"list_archived_deals",
		{
			description:
				"List archived deals visible to this credential so they can be inspected or restored.",
			inputSchema: {},
		},
		async () =>
			toolResult(await deals.archived(dealScope(PermissionAction.READ))),
	);

	server.registerTool(
		"archive_deal",
		{
			description: "Archive a visible deal without deleting its history.",
			inputSchema: dealIdInput,
		},
		async ({ id }) =>
			toolResult(await deals.archive(id, dealScope(PermissionAction.ARCHIVE))),
	);

	server.registerTool(
		"restore_deal",
		{
			description: "Restore an archived deal visible to this credential.",
			inputSchema: dealIdInput,
		},
		async ({ id }) =>
			toolResult(await deals.restore(id, dealScope(PermissionAction.RESTORE))),
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
		"update_deal_product",
		{
			description:
				"Change the quantity of a product line already attached to a visible deal.",
			inputSchema: dealLineItemUpdateInput,
		},
		async (input) =>
			toolResult(
				await deals.updateLineItem(input, dealScope(PermissionAction.UPDATE)),
			),
	);

	server.registerTool(
		"remove_deal_product",
		{
			description: "Remove a product line from a visible deal.",
			inputSchema: dealLineItemIdInput,
		},
		async ({ id }) =>
			toolResult(
				await deals.removeLineItem(id, dealScope(PermissionAction.UPDATE)),
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
