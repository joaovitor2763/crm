import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { RevenueAccountsRouter } from "./revenue-accounts.router";
import { RevenueAccountsService } from "./revenue-accounts.service";

@Module({
	imports: [TrpcModule],
	providers: [RevenueAccountsService, RevenueAccountsRouter],
	exports: [RevenueAccountsService],
})
export class RevenueAccountsModule {}
