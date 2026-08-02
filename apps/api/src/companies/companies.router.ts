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
import {
	companyCreateInput,
	companyIdInput,
	companyListInput,
	companyOptionsInput,
	companyUpdateArgs,
	setPrimaryContactInput,
} from "./companies.contracts";
import { CompaniesService } from "./companies.service";

@Router({ alias: "companies" })
@UseMiddlewares(AuthMiddleware)
export class CompaniesRouter {
	constructor(
		@Inject(CompaniesService) private readonly companies: CompaniesService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: companyListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof companyListInput>,
	) {
		return this.companies.list(
			input,
			this.readScope(ctx),
			this.relatedContactScope(ctx),
			this.relatedDealScope(ctx),
		);
	}

	@Query({ input: companyIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.byId(
			id,
			this.readScope(ctx),
			this.relatedContactScope(ctx),
			this.relatedDealScope(ctx),
		);
	}

	@Query()
	async archived(@Ctx() ctx: AuthedTrpcContext) {
		return this.companies.archived(this.readScope(ctx));
	}

	/** Company pickers and facet labels. */
	@Query({ input: companyOptionsInput })
	async options(@Ctx() ctx: AuthedTrpcContext, @Input("q") q: string) {
		return this.companies.options(q, this.readScope(ctx));
	}

	@Mutation({ input: companyCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof companyCreateInput>,
	) {
		this.accessControl.assertAssignment(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.CREATE,
			{
				businessUnitId:
					input.businessUnitId ?? ctx.principal.primaryBusinessUnitId,
				teamId: input.teamId ?? ctx.principal.primaryTeamId,
				ownerId: input.ownerId ?? ctx.user.id,
			},
		);
		return this.companies.create(input, ctx.principal);
	}

	@Mutation({ input: companyUpdateArgs })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof companyUpdateArgs>,
	) {
		const scope = this.writeScope(ctx);
		if (input.data.ownerId !== undefined) {
			const current = await this.companies.assignments(input.id, scope);
			const assignment =
				current.unitStates.find(
					(state) =>
						(state.teamId && ctx.principal.teamIds.includes(state.teamId)) ||
						ctx.principal.businessUnitTreeIds.includes(state.businessUnitId),
				) ?? current.unitStates[0];
			this.accessControl.assertAssignment(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.UPDATE,
				{ ...assignment, ownerId: input.data.ownerId },
			);
		}
		return this.companies.update(input.id, input.data, scope);
	}

	@Mutation({ input: companyIdInput })
	async archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.archive(
			id,
			this.accessControl.companyWhere(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.ARCHIVE,
			),
		);
	}

	@Mutation({ input: companyIdInput })
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.restore(
			id,
			this.accessControl.companyWhere(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.RESTORE,
			),
		);
	}

	/** Re-runs the brand lookup, ignoring Context.dev's cache. */
	@Mutation({ input: companyIdInput })
	async enrich(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.enrich(id, this.writeScope(ctx));
	}

	/** Reads the company's site and posts a brief to its timeline. */
	@Mutation({ input: companyIdInput })
	async research(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.research(id, ctx.user.id, this.writeScope(ctx));
	}

	@Mutation({ input: setPrimaryContactInput })
	async setPrimaryContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setPrimaryContactInput>,
	) {
		await this.accessControl.assertRecord(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.UPDATE,
			input.companyId,
		);
		if (input.contactId) {
			await this.accessControl.assertRecord(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
				input.contactId,
			);
		}
		return this.companies.setPrimaryContact(input.companyId, input.contactId);
	}

	private readScope(ctx: AuthedTrpcContext) {
		return this.accessControl.companyWhere(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
		);
	}

	private writeScope(ctx: AuthedTrpcContext) {
		return this.accessControl.companyWhere(
			ctx.principal,
			CRM_RESOURCE.companies,
			PermissionAction.UPDATE,
		);
	}

	private relatedContactScope(
		ctx: AuthedTrpcContext,
	): Prisma.ContactWhereInput {
		if (
			this.accessControl.permission(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			) === AccessScope.NONE
		) {
			return { id: { in: [] } };
		}
		return this.accessControl.contactWhere(
			ctx.principal,
			CRM_RESOURCE.contacts,
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
