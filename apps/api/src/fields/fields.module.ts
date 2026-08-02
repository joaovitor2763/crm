import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { FieldsRouter } from "./fields.router";
import { FieldsService } from "./fields.service";

@Module({
	imports: [TrpcModule],
	providers: [FieldsService, FieldsRouter],
	exports: [FieldsService],
})
export class FieldsModule {}
