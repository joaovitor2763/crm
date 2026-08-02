import { Module } from "@nestjs/common";
import { RevenueAccountsModule } from "../revenue-accounts/revenue-accounts.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AttributionRouter } from "./attribution.router";
import { AttributionService } from "./attribution.service";

@Module({
	imports: [TrpcModule, RevenueAccountsModule],
	providers: [AttributionService, AttributionRouter],
	exports: [AttributionService],
})
export class AttributionModule {}
