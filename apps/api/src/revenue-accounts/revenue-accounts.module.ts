import { Module } from "@nestjs/common";
import { FieldsModule } from "../fields/fields.module";
import { TrpcModule } from "../trpc/trpc.module";
import { RevenueAccountsRouter } from "./revenue-accounts.router";
import { RevenueAccountsService } from "./revenue-accounts.service";

@Module({
	imports: [TrpcModule, FieldsModule],
	providers: [RevenueAccountsService, RevenueAccountsRouter],
	exports: [RevenueAccountsService],
})
export class RevenueAccountsModule {}
