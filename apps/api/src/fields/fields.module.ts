import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { FieldsRouter } from "./fields.router";
import { FieldsService } from "./fields.service";
import { OntologyRouter } from "./ontology.router";
import { OntologyService } from "./ontology.service";

@Module({
	imports: [TrpcModule],
	providers: [FieldsService, FieldsRouter, OntologyService, OntologyRouter],
	exports: [FieldsService, OntologyService],
})
export class FieldsModule {}
