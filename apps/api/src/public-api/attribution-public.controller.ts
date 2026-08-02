import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import {
	attributionProjectionInput,
	externalAttributionEventInput,
} from "../attribution/attribution.contracts";
import { AttributionService } from "../attribution/attribution.service";
import { publicPrincipal } from "./public-principal";

@Controller("api/v1/attribution")
@AllowAnonymous()
export class AttributionPublicController {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(AttributionService)
		private readonly attribution: AttributionService,
	) {}

	@Post("events")
	async record(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.attribution.record(
			externalAttributionEventInput.parse(body),
			await this.principal(authorization),
		);
	}

	@Post("projection")
	async projection(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		return this.attribution.projection(
			attributionProjectionInput.parse(body),
			await this.principal(authorization),
		);
	}

	@Post(":entityType/:entityId/history")
	async history(
		@Headers("authorization") authorization: string | undefined,
		@Param("entityType") entityType: string,
		@Param("entityId") entityId: string,
	) {
		return this.attribution.history(
			attributionProjectionInput.parse({
				entityType,
				entityId,
				includeEvents: true,
			}),
			await this.principal(authorization),
		);
	}

	private async principal(authorization?: string) {
		return publicPrincipal(authorization, this.credentials, this.accessControl);
	}
}
