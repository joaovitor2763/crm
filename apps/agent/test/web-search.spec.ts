import { describe, expect, it } from "bun:test";
import webSearch from "../agent/tools/web_search";

describe("web_search", () => {
	it("removes the provider-managed tool from OpenRouter requests", () => {
		expect(webSearch).toEqual({ kind: "eve:disabled-tool" });
	});
});
