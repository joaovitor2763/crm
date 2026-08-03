import { db, UserAccessStatus } from "@crm/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { env } from "./env";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password";
import { SYNC_SCOPES } from "./scopes";
import {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
} from "./workspace";

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};

if (env.google) {
	socialProviders.google = {
		...env.google,

		// Gmail and Calendar are asked for at sign-in, not behind a Connect
		// button. This is an internal, single-tenant tool: reading the mailbox is
		// what the CRM is for, so it is a condition of having an account rather
		// than an optional extra.
		//
		// Requesting them here is necessary but not sufficient — Google's granular
		// consent lets someone untick a scope and still finish signing in, so the
		// app also gates on what was actually granted. See
		// `requireGoogleAccess()` in the Next.js app.
		scope: [...SYNC_SCOPES],

		// Offline access, so Google issues a refresh token. Without it the
		// connection dies silently one hour after sign-in, with nothing to
		// refresh from.
		//
		// Deliberately not `prompt: "consent"`: it would show the consent screen
		// on every single sign-in. It is not needed, because a first sign-in — and
		// any sign-in that asks for a scope the user has not yet granted — makes
		// Google prompt anyway, and it is that prompt which mints the refresh
		// token. The missing-refresh-token case is detected and repaired rather
		// than pre-empted.
		accessType: "offline",

		// Google only offers accounts on our domain in the chooser. This is a
		// convenience, not the control — `hd` is a hint the client sends and a
		// determined caller can omit it, so the real check is the database hook
		// below, which sees the verified email.
		//
		// Omitted when the allow-list names no domain (a one-person install on a
		// consumer mailbox): `hd` has to be a real domain, and sending an empty
		// one hides every account in the chooser.
		...(primaryWorkspaceDomain() ? { hd: primaryWorkspaceDomain() } : {}),
	};
}

export const auth = betterAuth({
	appName: "Sales Ontology",

	database: prismaAdapter(db, {
		provider: "postgresql",
	}),

	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		minPasswordLength: MIN_PASSWORD_LENGTH,
		maxPasswordLength: MAX_PASSWORD_LENGTH,
	},

	socialProviders,

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
	},

	advanced: {
		useSecureCookies: env.isProduction,
		...(env.cookieDomain && {
			crossSubDomainCookies: {
				enabled: true,
				domain: env.cookieDomain,
			},
		}),
	},

	trustedOrigins: [...env.trustedOrigins],
	hooks: {},

	databaseHooks: {
		user: {
			create: {
				/**
				 * The actual door.
				 *
				 * Runs before a row exists for both Google and direct email/password
				 * accounts. This is a single-tenant internal tool: an account outside
				 * the allow-list has nothing legitimate to do here, and every
				 * record is visible to every signed-in person.
				 *
				 * An unset allow-list is refused rather than waved through. The
				 * failure mode of the other choice is a CRM full of real customer
				 * data that anyone with a Google account can read, and it would
				 * look like it was working.
				 */
				before: async (user) => {
					if (!hasSignInAllowList()) {
						throw new APIError("FORBIDDEN", {
							message:
								'No one can sign in yet: set ALLOWED_SIGN_IN in .env to your email domain (for example ALLOWED_SIGN_IN="acme.com") and restart.',
						});
					}

					if (!isWorkspaceEmail(user.email)) {
						const domain = primaryWorkspaceDomain();
						throw new APIError("FORBIDDEN", {
							message: domain
								? `Sales Ontology is private. Sign in with your @${domain} account.`
								: "Sales Ontology is private. That address is not on the allow-list.",
						});
					}

					return { data: user };
				},
			},
		},
		session: {
			create: {
				before: async (session) => {
					const access = await db.userAccess.findUnique({
						where: { userId: session.userId },
						select: { status: true },
					});
					if (access?.status === UserAccessStatus.SUSPENDED) {
						throw new APIError("FORBIDDEN", {
							message: "Your CRM access is suspended. Contact a Global Admin.",
						});
					}
					return { data: session };
				},
			},
		},
	},
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
