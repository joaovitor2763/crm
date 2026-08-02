import { AccessScope, PermissionAction } from "@crm/db";
import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import { dashboardAnalyticsInput } from "../dashboard/analytics.contracts";
import { DashboardService } from "../dashboard/dashboard.service";
import { publicPrincipal } from "./public-principal";

@Controller("api/v1/analytics")
@AllowAnonymous()
export class AnalyticsPublicController {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(DashboardService) private readonly dashboard: DashboardService,
	) {}

	@Post("revenue")
	async revenue(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		const principal = await publicPrincipal(
			authorization,
			this.credentials,
			this.accessControl,
		);
		const input = dashboardAnalyticsInput.parse({
			...(body && typeof body === "object" ? body : {}),
			scope: "everyone",
		});
		const contactPermission = this.accessControl.permission(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
		return this.dashboard.analytics(
			principal,
			"",
			input,
			this.accessControl.dealWhere(
				principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			),
			this.accessControl.activityWhere(
				principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
			this.accessControl.configurationWhere(
				principal,
				CRM_RESOURCE.pipelines,
				PermissionAction.READ,
				true,
			),
			contactPermission === AccessScope.NONE
				? { id: { in: [] } }
				: this.accessControl.contactWhere(
						principal,
						CRM_RESOURCE.contacts,
						PermissionAction.READ,
					),
		);
	}
}
