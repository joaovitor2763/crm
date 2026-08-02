import { Module } from "@nestjs/common";
import { ApiCredentialsModule } from "../api-credentials/api-credentials.module";
import { AttributionModule } from "../attribution/attribution.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { FieldsModule } from "../fields/fields.module";
import { RevenueAccountsModule } from "../revenue-accounts/revenue-accounts.module";
import { AnalyticsPublicController } from "./analytics-public.controller";
import { AttributionPublicController } from "./attribution-public.controller";
import { DashboardDefinitionsPublicController } from "./dashboard-definitions-public.controller";
import { LeadIngestionService } from "./lead-ingestion.service";
import { McpController } from "./mcp.controller";
import { PublicApiController } from "./public-api.controller";
import { RevenueAccountsPublicController } from "./revenue-accounts-public.controller";

@Module({
	imports: [
		ApiCredentialsModule,
		AttributionModule,
		DashboardModule,
		FieldsModule,
		RevenueAccountsModule,
	],
	controllers: [
		PublicApiController,
		RevenueAccountsPublicController,
		DashboardDefinitionsPublicController,
		AnalyticsPublicController,
		AttributionPublicController,
		McpController,
	],
	providers: [LeadIngestionService],
	exports: [LeadIngestionService],
})
export class PublicApiModule {}
