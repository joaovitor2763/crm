import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { PipelinesRouter } from "./pipelines.router";
import { PipelinesService } from "./pipelines.service";

@Module({
	imports: [TrpcModule],
	providers: [PipelinesService, PipelinesRouter],
	exports: [PipelinesService],
})
export class PipelinesModule {}
