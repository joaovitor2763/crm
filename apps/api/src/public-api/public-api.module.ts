import { Module } from "@nestjs/common";
import { ApiCredentialsModule } from "../api-credentials/api-credentials.module";
import { FieldsModule } from "../fields/fields.module";
import { LeadIngestionService } from "./lead-ingestion.service";
import { McpController } from "./mcp.controller";
import { PublicApiController } from "./public-api.controller";

@Module({
	imports: [ApiCredentialsModule, FieldsModule],
	controllers: [PublicApiController, McpController],
	providers: [LeadIngestionService],
	exports: [LeadIngestionService],
})
export class PublicApiModule {}
