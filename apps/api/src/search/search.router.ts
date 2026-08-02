import { PermissionAction } from "@crm/db";
import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { SearchService } from "./search.service";

const quickInput = z.object({ q: z.string().default("") });

@Router({ alias: "search" })
@UseMiddlewares(AuthMiddleware)
export class SearchRouter {
	constructor(
		@Inject(SearchService) private readonly search: SearchService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	/** Backs the ⌘K switcher. */
	@Query({ input: quickInput })
	async quick(@Ctx() ctx: AuthedTrpcContext, @Input("q") q: string) {
		return this.search.quick(q, {
			companies: this.accessControl.companyWhere(
				ctx.principal,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
			),
			contacts: this.accessControl.contactWhere(
				ctx.principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			),
			deals: this.accessControl.dealWhere(
				ctx.principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			),
		});
	}
}
