import { describe, expect, it } from "bun:test";
import { jsonOption, parseArgs, requiredOption } from "../src/parser";

describe("CLI parser", () => {
	it("keeps positional commands and supports equals and separated values", () => {
		expect(
			parseArgs([
				"lead",
				"upsert",
				"--source=site",
				"--email",
				"a@example.test",
				"--human",
			]),
		).toEqual({
			command: ["lead", "upsert"],
			options: { source: "site", email: "a@example.test", human: true },
		});
	});

	it("parses structured values without a dependency", () => {
		const parsed = parseArgs([
			"mcp",
			"call",
			"search_contacts",
			"--args",
			'{"limit":5}',
		]);
		expect(requiredOption(parsed.options, "args")).toBe('{"limit":5}');
		expect(jsonOption(parsed.options, "args", {})).toEqual({ limit: 5 });
	});
});
