import {
	Body,
	Controller,
	Get,
	Headers,
	Inject,
	Param,
	Patch,
	Post,
	Query,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import {
	dashboardDefinitionCreateInput,
	dashboardDefinitionDuplicateInput,
	dashboardDefinitionListInput,
	dashboardDefinitionPublishInput,
	dashboardDefinitionUpdateInput,
} from "../dashboard/dashboard-definition.contracts";
import { DashboardDefinitionService } from "../dashboard/dashboard-definition.service";
import { publicPrincipal } from "./public-principal";

@Controller("api/v1/dashboards")
@AllowAnonymous()
export class DashboardDefinitionsPublicController {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(DashboardDefinitionService)
		private readonly definitions: DashboardDefinitionService,
	) {}

	@Get()
	async list(
		@Headers("authorization") authorization: string | undefined,
		@Query() query: Record<string, string | undefined>,
	) {
		return this.definitions.list(
			dashboardDefinitionListInput.parse({
				status: query.status,
				key: query.key,
				includeVersions: query.includeVersions === "true",
			}),
			await this.principal(authorization),
		);
	}

	@Get(":id/export")
	async export(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
	) {
		const principal = await this.principal(authorization);
		return {
			definition: await this.definitions.byId(id, principal),
			render: await this.definitions.render(id, principal),
		};
	}

	@Get(":id")
	async byId(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
	) {
		return this.definitions.byId(id, await this.principal(authorization));
	}

	@Post()
	async create(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.definitions.create(
			dashboardDefinitionCreateInput.parse(body),
			await this.principal(authorization),
		);
	}

	@Patch(":id")
	async update(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		return this.definitions.update(
			dashboardDefinitionUpdateInput.parse({
				...(objectBody(body) ?? {}),
				id,
			}),
			await this.principal(authorization),
		);
	}

	@Post(":id/duplicate")
	async duplicate(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		return this.definitions.duplicate(
			dashboardDefinitionDuplicateInput.parse({
				...(objectBody(body) ?? {}),
				id,
			}),
			await this.principal(authorization),
		);
	}

	@Post(":id/publish")
	async publish(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
		@Body() body: unknown,
	) {
		const input = dashboardDefinitionPublishInput.parse({
			...(objectBody(body) ?? {}),
			id,
		});
		return this.definitions.publish(
			input.id,
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
