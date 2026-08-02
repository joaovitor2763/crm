import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Inject,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { GoogleSyncService } from "./google-sync.service";

/**
 * The cron entrypoint.
 *
 * One of the few non-tRPC surfaces, alongside `/health` and Better Auth: no
 * user makes this request, so there is no session to authenticate and the tRPC
 * auth middleware has nothing to check. `CRON_SECRET` is the guard instead.
 */
@Controller("internal/sync")
export class SyncController {
	private readonly logger = new Logger(SyncController.name);
	private readonly secret: string | undefined;

	constructor(
		@Inject(GoogleSyncService)
		private readonly sync: GoogleSyncService,
		@Inject(ConfigService)
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	/**
	 * `GET`, because Vercel Cron only issues `GET`.
	 *
	 * This route was `POST`-only, and the scheduler dutifully called it every
	 * five minutes and got a 404 every time — a sync that looked configured,
	 * logged nothing alarming, and never ran.
	 *
	 * Two handlers rather than two decorators on one: Nest keeps only the last
	 * HTTP-method decorator applied to a method, so stacking them silently
	 * registers one verb and drops the other. That is how this was broken in
	 * the first place, and it would have been broken the same way again.
	 *
	 * A `GET` that performs work is not REST, but the method is not the guard
	 * here — `CRON_SECRET` is, and both paths run the identical check.
	 */
	@Get("google")
	@AllowAnonymous()
	async googleViaGet(@Headers("authorization") authorization?: string) {
		return this.google(authorization);
	}

	/** The same thing, for anything calling it by hand. */
	@Post("google")
	@AllowAnonymous()
	async googleViaPost(@Headers("authorization") authorization?: string) {
		return this.google(authorization);
	}

	private async google(authorization?: string) {
		// No secret configured means the route is open, which is worse than it
		// being unavailable. Fail closed. This is the only thing gating the sync —
		// there is no feature flag, because mailbox access is a condition of
		// signing in and a switch that can disable a mandatory feature is a switch
		// that is only ever wrong.
		if (!this.secret) {
			this.logger.error({
				message: "CRON_SECRET is not set — refusing to run the sync route.",
			});
			throw new ServiceUnavailableException("Sync is not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		return this.sync.runDue();
	}
}

/**
 * Constant-time string comparison.
 *
 * A `===` on a shared secret leaks its prefix through response timing. The
 * length check up front is fine to leak — it is the content that matters.
 */
function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
