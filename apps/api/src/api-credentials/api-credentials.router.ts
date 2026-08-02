import { PermissionAction } from "@crm/db";
import { ForbiddenException, Inject } from "@nestjs/common";
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
	apiCredentialCreateInput,
	apiCredentialIdInput,
} from "./api-credentials.contracts";
import type { ApiCredentialRow } from "./api-credentials.service";
import { ApiCredentialsService } from "./api-credentials.service";

@Router({ alias: "apiCredentials" })
@UseMiddlewares(AuthMiddleware)
export class ApiCredentialsRouter {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query()
	list(@Ctx() ctx: AuthedTrpcContext): Promise<ApiCredentialRow[]> {
		this.manage(ctx);
		return this.credentials.list();
	}

	@Mutation({ input: apiCredentialCreateInput })
	create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof apiCredentialCreateInput>,
	) {
		this.manage(ctx);
		return this.credentials.create(input, ctx.principal);
	}

	@Mutation({ input: apiCredentialIdInput })
	revoke(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof apiCredentialIdInput>,
	) {
		this.manage(ctx);
		return this.credentials.revoke(input.id);
	}

	private manage(ctx: AuthedTrpcContext) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.apiCredentials,
			PermissionAction.MANAGE,
		);
		if (!ctx.principal.isAdmin) {
			throw new ForbiddenException(
				"Only a global administrator can issue or revoke external credentials.",
			);
		}
	}
}
