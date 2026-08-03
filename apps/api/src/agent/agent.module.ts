import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { AgentAdminRouter } from "./agent-admin.router";
import { AgentAdminService } from "./agent-admin.service";
import { AgentQueueService } from "./agent-queue.service";
import { AgentTriggerService } from "./agent-trigger.service";

/**
 * The API's entire relationship with the research agent.
 *
 * Two services and two verbs: *this happened*, and *is anything outstanding*.
 * What replaced `EnrichmentModule` is smaller than the module docstring it
 * replaced, which is the point — there is no vendor client here, and nothing
 * that knows what a LinkedIn profile is. Writing a row saying a company was
 * created and counting the rows not yet done are both filing.
 */
@Module({
	imports: [TrpcModule],
	providers: [
		AgentTriggerService,
		AgentQueueService,
		AgentAdminService,
		AgentAdminRouter,
	],
	exports: [AgentTriggerService, AgentQueueService],
})
export class AgentModule {}
