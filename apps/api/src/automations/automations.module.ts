import { Module } from "@nestjs/common";
import { ContactsModule } from "../contacts/contacts.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AutomationWorkerController } from "./automation-worker.controller";
import { AutomationsRouter } from "./automations.router";
import { AutomationsService } from "./automations.service";

@Module({
	imports: [TrpcModule, ContactsModule],
	controllers: [AutomationWorkerController],
	providers: [AutomationsService, AutomationsRouter],
	exports: [AutomationsService],
})
export class AutomationsModule {}
