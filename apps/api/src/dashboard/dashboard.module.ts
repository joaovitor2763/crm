import { Module } from "@nestjs/common";
import { FieldsModule } from "../fields/fields.module";
import { TrpcModule } from "../trpc/trpc.module";
import { DashboardRouter } from "./dashboard.router";
import { DashboardService } from "./dashboard.service";
import { DashboardDefinitionService } from "./dashboard-definition.service";

@Module({
	imports: [TrpcModule, FieldsModule],
	providers: [DashboardService, DashboardDefinitionService, DashboardRouter],
	exports: [DashboardService, DashboardDefinitionService],
})
export class DashboardModule {}
