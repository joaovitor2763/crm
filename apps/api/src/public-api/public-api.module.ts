import { Module } from "@nestjs/common";
import { ApiCredentialsModule } from "../api-credentials/api-credentials.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { FieldsModule } from "../fields/fields.module";
import { RevenueAccountsModule } from "../revenue-accounts/revenue-accounts.module";
import { AnalyticsPublicController } from "./analytics-public.controller";
import { LeadIngestionService } from "./lead-ingestion.service";
import { McpController } from "./mcp.controller";
import { PublicApiController } from "./public-api.controller";
import { RevenueAccountsPublicController } from "./revenue-accounts-public.controller";

@Module({
	imports: [
		ApiCredentialsModule,
		DashboardModule,
		FieldsModule,
		RevenueAccountsModule,
	],
	controllers: [
		PublicApiController,
		RevenueAccountsPublicController,
		AnalyticsPublicController,
		McpController,
	],
	providers: [LeadIngestionService],
	exports: [LeadIngestionService],
})
export class PublicApiModule {}
