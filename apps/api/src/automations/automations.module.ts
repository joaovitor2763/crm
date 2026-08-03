import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DealsModule } from "../deals/deals.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AutomationWorkerController } from "./automation-worker.controller";
import { AutomationsRouter } from "./automations.router";
import { AutomationsService } from "./automations.service";

@Module({
	imports: [TrpcModule, ContactsModule, ActivitiesModule, DealsModule],
	controllers: [AutomationWorkerController],
	providers: [AutomationsService, AutomationsRouter],
	exports: [AutomationsService],
})
export class AutomationsModule {}
