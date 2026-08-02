import { AccessScope, PermissionAction, type Prisma } from "@crm/db";
import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { ContactLifecycleService } from "./contact-lifecycle.service";
import {
	contactCreateInput,
	contactIdInput,
	contactLifecycleInput,
	contactListInput,
	contactUpdateArgs,
	factDecisionInput,
} from "./contacts.contracts";
import { ContactsService } from "./contacts.service";

@Router({ alias: "contacts" })
@UseMiddlewares(AuthMiddleware)
export class ContactsRouter {
	constructor(
		@Inject(ContactsService) private readonly contacts: ContactsService,
		@Inject(ContactLifecycleService)
		private readonly lifecycle: ContactLifecycleService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: contactListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactListInput>,
	) {
		return this.contacts.list(
			input,
			this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			),
			this.relatedCompanyScope(ctx),
		);
	}

	@Query({ input: contactIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.contacts.byId(
			id,
			this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			),
			this.relatedCompanyScope(ctx),
			this.relatedDealScope(ctx),
		);
	}

	@Query()
	async archived(@Ctx() ctx: AuthedTrpcContext) {
		return this.contacts.archived(
			this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			),
		);
	}

	@Mutation({ input: contactCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactCreateInput>,
	) {
		if (input.companyId) {
			await this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
				input.companyId,
			);
		}
		this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.contacts,
			PermissionAction.CREATE,
			{
				businessUnitId:
					input.businessUnitId ?? ctx.principal.primaryBusinessUnitId,
				teamId: input.teamId ?? ctx.principal.primaryTeamId,
				ownerId: input.ownerId ?? ctx.user.id,
			},
		);
		return this.contacts.create(input, ctx.principal);
	}

	@Mutation({ input: contactLifecycleInput })
	async setLifecycle(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactLifecycleInput>,
	) {
		this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.contacts,
			PermissionAction.UPDATE,
			{
				businessUnitId: input.businessUnitId,
				teamId: input.teamId,
				ownerId: input.ownerId,
			},
		);
		return this.lifecycle.setLifecycle(input, ctx.principal);
	}

	@Mutation({ input: contactUpdateArgs })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof contactUpdateArgs>,
	) {
		const scope = this.accessControl.contactWhere(
			ctx.principal,
			CRM_RESOURCE.contacts,
			PermissionAction.UPDATE,
		);
		if (input.data.companyId) {
			await this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
				input.data.companyId,
			);
		}
		if (input.data.ownerId !== undefined) {
			const current = await this.contacts.assignments(input.id, scope);
			const assignment =
				current.unitStates.find(
					(state) =>
						(state.teamId && ctx.principal.teamIds.includes(state.teamId)) ||
						ctx.principal.businessUnitTreeIds.includes(state.businessUnitId),
				) ?? current.unitStates[0];
			this.accessControl.assertAssignment(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.UPDATE,
				{
					...assignment,
					ownerId: input.data.ownerId,
				},
			);
		}
		return this.contacts.update(input.id, input.data, scope);
	}

	@Mutation({ input: contactIdInput })
	async archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.contacts.archive(
			id,
			this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.ARCHIVE,
			),
		);
	}

	@Mutation({ input: contactIdInput })
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.contacts.restore(
			id,
			this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.RESTORE,
			),
		);
	}

	/** A rep accepting or dismissing something the agent suggested. */
	@Mutation({ input: factDecisionInput })
	async decideFact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof factDecisionInput>,
	) {
		return this.contacts.decideFact(
			input,
			ctx.user.id,
			this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.UPDATE,
			),
		);
	}

	private relatedCompanyScope(
		ctx: AuthedTrpcContext,
	): Prisma.CompanyWhereInput {
		if (
			this.accessControl.permission(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
			) === AccessScope.NONE
		) {
			return { id: { in: [] } };
		}
		return this.accessControl.companyWhere(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
		);
	}

	private relatedDealScope(ctx: AuthedTrpcContext): Prisma.DealWhereInput {
		if (
			this.accessControl.permission(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			) === AccessScope.NONE
		) {
			return { id: { in: [] } };
		}
		return this.accessControl.dealWhere(
			ctx.principal,
			CRM_RESOURCE.deals,
			PermissionAction.READ,
		);
	}
}
