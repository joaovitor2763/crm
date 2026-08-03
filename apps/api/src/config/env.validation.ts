import { plainToInstance, Type } from "class-transformer";
import {
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	IsUrl,
	Max,
	Min,
	MinLength,
	validateSync,
} from "class-validator";

/**
 * Every variable the API reads, and nothing else.
 *
 * Five of these are required and the rest have working defaults, which is the
 * whole configuration surface of this repo. The list is short on purpose: a
 * variable that exists but is never read is a question a self-hoster has to
 * answer for no reason, and one that is read but not declared here fails at
 * three in the morning instead of at boot.
 *
 * Values are read from the environment, or from the repo-root `.env` that
 * `@crm/env` loads. See `.env.example`.
 */

export enum NodeEnv {
	Development = "development",
	Production = "production",
	Test = "test",
}

export class EnvironmentVariables {
	@IsEnum(NodeEnv)
	NODE_ENV: NodeEnv = NodeEnv.Development;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(65535)
	PORT = 3001;

	// --- required -----------------------------------------------------------

	@IsString()
	@MinLength(1, {
		message:
			"DATABASE_URL is required. `docker compose up -d` starts one, or set it to any Postgres connection string.",
	})
	DATABASE_URL!: string;

	@IsString()
	@MinLength(32, {
		message:
			"BETTER_AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
	})
	BETTER_AUTH_SECRET!: string;

	/**
	 * Who may sign in — a comma-separated list of email domains and addresses.
	 *
	 * This is the entire authorisation model, so it is required rather than
	 * defaulted. See `@crm/auth`'s `workspace.ts`.
	 */
	@IsString()
	@MinLength(1, {
		message:
			'ALLOWED_SIGN_IN is required — it is the only thing deciding who can sign in. Set it to your email domain, e.g. ALLOWED_SIGN_IN="acme.com", or to a single address for a one-person install.',
	})
	ALLOWED_SIGN_IN!: string;

	/**
	 * Google is the only sign-in method, so unlike `@crm/auth` — which stays
	 * loadable without credentials for `better-auth generate` — the process that
	 * serves the auth routes refuses to start without them.
	 */
	@IsString()
	@MinLength(1, {
		message:
			"GOOGLE_CLIENT_ID is required — Google is the only sign-in method. Create an OAuth client ID (web) in the Google Cloud console.",
	})
	GOOGLE_CLIENT_ID!: string;

	@IsString()
	@MinLength(1, { message: "GOOGLE_CLIENT_SECRET is required." })
	GOOGLE_CLIENT_SECRET!: string;

	// --- defaulted ----------------------------------------------------------

	/** Where this API is reachable. Only needs setting off localhost. */
	@IsOptional()
	@IsUrl({ require_tld: false })
	API_URL?: string;

	/**
	 * Where the browser is. Allowed to call the API with credentials, and the
	 * allow-list Better Auth validates post-sign-in `callbackURL`s against.
	 * Comma-separated if there is genuinely more than one.
	 */
	@IsOptional()
	@IsString()
	APP_URL?: string;

	// --- optional -----------------------------------------------------------

	/** Parent domain for session cookies when the API and app differ, e.g. ".example.com". */
	@IsOptional()
	@IsString()
	AUTH_COOKIE_DOMAIN?: string;

	/** Without it the cache is per-instance and in-memory, which is fine. */
	@IsOptional()
	@IsString()
	REDIS_URL?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	CACHE_TTL_MS?: number;

	/**
	 * Bearer guard on `POST /internal/sync/google`.
	 *
	 * Not a feature flag — Gmail and Calendar sync is simply on, because mailbox
	 * access is a condition of signing in. This is the one thing the cron route
	 * genuinely needs, and the route fails closed without it.
	 */
	@IsOptional()
	@IsString()
	@MinLength(16, {
		message: "CRON_SECRET must be at least 16 characters.",
	})
	CRON_SECRET?: string;

	/** Master key used only to derive per-endpoint webhook signing secrets. */
	@IsOptional()
	@IsString()
	@MinLength(32, {
		message: "WEBHOOK_SIGNING_SECRET must be at least 32 characters.",
	})
	WEBHOOK_SIGNING_SECRET?: string;

	/** Encrypts provider keys saved by a local administrator. */
	@IsOptional()
	@IsString()
	@MinLength(32, {
		message: "AI_CONFIG_ENCRYPTION_KEY must be at least 32 characters.",
	})
	AI_CONFIG_ENCRYPTION_KEY?: string;
}

export function validateEnv(
	config: Record<string, unknown>,
): EnvironmentVariables {
	const validated = plainToInstance(EnvironmentVariables, config, {
		enableImplicitConversion: true,
		exposeDefaultValues: true,
	});

	const errors = validateSync(validated, {
		skipMissingProperties: false,
		whitelist: false,
	});

	if (errors.length > 0) {
		const details = errors
			.map((error) => Object.values(error.constraints ?? {}).join(", "))
			.join("\n  - ");

		throw new Error(
			`Invalid environment configuration:\n  - ${details}\n\nSee .env.example at the root of the repo.`,
		);
	}

	return validated;
}
