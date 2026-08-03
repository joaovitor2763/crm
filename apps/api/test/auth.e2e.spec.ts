import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { hashCredentialPassword } from "@crm/auth/password";
import { db } from "@crm/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

/** Only fills a variable that is missing or blank — `.env` ships empty OAuth
 * placeholders, and an empty string still fails validation. */
const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

// `ConfigModule.forRoot()` validates the environment while `AppModule` is being
// evaluated, so these have to land before that module is imported — hence the
// dynamic import below. Real values win; these only keep the suite runnable
// somewhere without credentials, such as CI.
fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
process.env.ALLOWED_SIGN_IN = "example.com";

describe("Auth (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { AppModule } = await import("../src/app.module");

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication({ bodyParser: false });
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("rejects an unauthenticated request to a guarded route", async () => {
		await request(app.getHttpServer()).get("/auth/me").expect(401);
	});

	it("allows an unauthenticated request to an optional-auth route", async () => {
		const response = await request(app.getHttpServer())
			.get("/auth/session")
			.expect(200);

		expect(response.body).toEqual({ authenticated: false, user: null });
	});

	// Asserting the route is mounted rather than that it succeeds: Better Auth
	// stores rate limits in the database, so a 200 here needs a live Postgres.
	it("mounts the Better Auth handler", async () => {
		const response = await request(app.getHttpServer()).get("/api/auth/ok");

		expect(response.status).not.toBe(404);
	});

	it("rejects session creation for a suspended CRM user", async () => {
		const email = `suspended-${crypto.randomUUID()}@example.com`;
		const password = "Suspended-password-123!";
		const userId = crypto.randomUUID();
		try {
			await db.user.create({
				data: {
					id: userId,
					email,
					name: "Suspended Auth Test",
					accounts: {
						create: {
							id: crypto.randomUUID(),
							accountId: userId,
							providerId: "credential",
							password: await hashCredentialPassword(password),
						},
					},
					access: {
						create: {
							roleId: "role-read-only",
							status: "SUSPENDED",
						},
					},
				},
			});

			const response = await request(app.getHttpServer())
				.post("/api/auth/sign-in/email")
				.send({ email, password });
			expect(response.status).toBe(403);
			expect(response.body.message).toContain("access is suspended");
		} finally {
			await db.user.deleteMany({ where: { email } });
		}
	});

	it("keeps public email/password sign-up disabled", async () => {
		await request(app.getHttpServer())
			.post("/api/auth/sign-up/email")
			.send({
				email: `public-signup-${crypto.randomUUID()}@example.com`,
				password: "Public-signup-password-123!",
				name: "Public Signup Attempt",
			})
			.expect(400);
	});
});
