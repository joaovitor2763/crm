import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ApiCredentialsRouter } from "./api-credentials.router";
import { ApiCredentialsService } from "./api-credentials.service";

@Module({
	imports: [TrpcModule],
	providers: [ApiCredentialsService, ApiCredentialsRouter],
	exports: [ApiCredentialsService],
})
export class ApiCredentialsModule {}
