import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { ApiCredentialsModule } from "../api-credentials/api-credentials.module";
import { AttributionModule } from "../attribution/attribution.module";
import { CompaniesModule } from "../companies/companies.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { DealsModule } from "../deals/deals.module";
import { FieldsModule } from "../fields/fields.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProductsModule } from "../products/products.module";
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
		ActivitiesModule,
		AttributionModule,
		CompaniesModule,
		DashboardModule,
		ContactsModule,
		DealsModule,
		FieldsModule,
		PipelinesModule,
		ProductsModule,
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
