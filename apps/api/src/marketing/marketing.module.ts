import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { MarketingRouter } from "./marketing.router";
import { MarketingService } from "./marketing.service";

@Module({
	imports: [TrpcModule],
	providers: [MarketingService, MarketingRouter],
})
export class MarketingModule {}
