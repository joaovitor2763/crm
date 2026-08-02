import {
	Controller,
	ForbiddenException,
	Headers,
	Inject,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { AutomationsService } from "./automations.service";

@Controller("internal/workers")
export class AutomationWorkerController {
	private readonly secret?: string;

	constructor(
		@Inject(AutomationsService)
		private readonly automations: AutomationsService,
		@Inject(ConfigService)
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Post("events")
	@AllowAnonymous()
	process(@Headers("authorization") authorization?: string) {
		if (!this.secret) {
			throw new ServiceUnavailableException("Worker is not configured.");
		}
		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}
		return this.automations.processBatch();
	}
}

function timingSafeEquals(left: string, right: string) {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}
