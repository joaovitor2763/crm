import { auth } from "@crm/auth";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { AccessControlModule } from "./access-control/access-control.module";
import { ActivitiesModule } from "./activities/activities.module";
import { ApiCredentialsModule } from "./api-credentials/api-credentials.module";
import { AttributionModule } from "./attribution/attribution.module";
import { AuthModule } from "./auth/auth.module";
import { AutomationsModule } from "./automations/automations.module";
import { AppCacheModule } from "./cache/cache.module";
import { CompaniesModule } from "./companies/companies.module";
import { validateEnv } from "./config/env.validation";
import { ContactsModule } from "./contacts/contacts.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { CrmModule } from "./crm/crm.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { DealsModule } from "./deals/deals.module";
import { FieldsModule } from "./fields/fields.module";
import { GoogleModule } from "./google/google.module";
import { GovernanceModule } from "./governance/governance.module";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./logging/logging.module";
import { logAuthRoute } from "./logging/request-logger.middleware";
import { MarketingModule } from "./marketing/marketing.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { ProductsModule } from "./products/products.module";
import { PublicApiModule } from "./public-api/public-api.module";
import { RevenueAccountsModule } from "./revenue-accounts/revenue-accounts.module";
import { SearchModule } from "./search/search.module";
import { TrpcModule } from "./trpc/trpc.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [
		LoggingModule,
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validate: validateEnv,
		}),
		AppCacheModule,
		DatabaseModule,
		AccessControlModule,
		ApiCredentialsModule,
		AutomationsModule,
		CrmModule,
		BetterAuthModule.forRoot({ auth, middleware: logAuthRoute }),
		AuthModule,
		HealthModule,
		TrpcModule,
		UsersModule,
		GovernanceModule,
		FieldsModule,
		CompaniesModule,
		ContactsModule,
		ConversationsModule,
		DealsModule,
		PipelinesModule,
		ProductsModule,
		RevenueAccountsModule,
		PublicApiModule,
		ActivitiesModule,
		AttributionModule,
		MarketingModule,
		DashboardModule,
		SearchModule,
		GoogleModule,
	],
})
export class AppModule {}
