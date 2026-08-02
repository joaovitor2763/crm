import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type TurboConfig = {
	tasks?: {
		build?: {
			env?: string[];
		};
	};
};

describe("the app build environment", () => {
	it("keeps deployment origins available and in the cache key", () => {
		const config = JSON.parse(
			readFileSync(resolve(import.meta.dir, "..", "turbo.json"), "utf8"),
		) as TurboConfig;
		const buildEnv = config.tasks?.build?.env ?? [];

		expect(buildEnv).toContain("API_URL");
		expect(buildEnv).toContain("APP_URL");
		expect(buildEnv).toContain("NEXT_PUBLIC_API_URL");
		expect(buildEnv).toContain("NEXT_PUBLIC_AUTH_URL");
	});
});
