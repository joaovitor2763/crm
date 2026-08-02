import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { GovernanceRouter } from "./governance.router";
import { GovernanceService } from "./governance.service";

@Module({
	imports: [TrpcModule],
	providers: [GovernanceService, GovernanceRouter],
	exports: [GovernanceService],
})
export class GovernanceModule {}
