import {
	Body,
	Controller,
	Get,
	Headers,
	Inject,
	Param,
	Post,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import {
	revenueAccountAssociationInput,
	revenueAccountCreateInput,
	revenueAccountListInput,
	revenueAccountMergeInput,
	revenueAccountMergePreviewInput,
} from "../revenue-accounts/revenue-accounts.contracts";
import { RevenueAccountsService } from "../revenue-accounts/revenue-accounts.service";
import { publicPrincipal } from "./public-principal";

@Controller("api/v1/revenue-accounts")
@AllowAnonymous()
export class RevenueAccountsPublicController {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(RevenueAccountsService)
		private readonly accounts: RevenueAccountsService,
	) {}

	@Post("search")
	async search(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.accounts.list(
			revenueAccountListInput.parse(body),
			await this.principal(authorization),
		);
	}

	@Post()
	async create(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.accounts.create(
			revenueAccountCreateInput.parse(body),
			await this.principal(authorization),
		);
	}

	@Get(":id")
	async byId(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
	) {
		return this.accounts.byId(id, await this.principal(authorization));
	}

	@Get(":id/history")
	async history(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
	) {
		return this.accounts.history(id, await this.principal(authorization));
	}

	@Post(":id/associations")
	async associate(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		return this.accounts.associate(
			revenueAccountAssociationInput.parse({
				...(objectBody(body) ?? {}),
				revenueAccountId: id,
			}),
			await this.principal(authorization),
		);
	}

	@Post("merge/preview")
	async mergePreview(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.accounts.mergePreview(
			revenueAccountMergePreviewInput.parse(body),
			await this.principal(authorization),
		);
	}

	@Post("merge")
	async merge(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.accounts.merge(
			revenueAccountMergeInput.parse(body),
			await this.principal(authorization),
		);
	}

	private principal(authorization?: string) {
		return publicPrincipal(authorization, this.credentials, this.accessControl);
	}
}

function objectBody(body: unknown): Record<string, unknown> | null {
	return body && typeof body === "object" && !Array.isArray(body)
		? (body as Record<string, unknown>)
		: null;
}
