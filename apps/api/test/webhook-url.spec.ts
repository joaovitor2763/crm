import { describe, expect, it } from "bun:test";
import {
	assertPublicWebhookUrl,
	isPublicIpAddress,
} from "../src/automations/webhook-url";

const resolvesTo =
	(...addresses: string[]) =>
	async () =>
		addresses;

describe("webhook URL safety", () => {
	it("accepts a public HTTPS endpoint", async () => {
		await expect(
			assertPublicWebhookUrl(
				"https://hooks.example.test/crm",
				resolvesTo("93.184.216.34"),
			),
		).resolves.toBeUndefined();
	});

	it("rejects local and private destinations", async () => {
		for (const [url, address] of [
			["https://localhost/hook", "127.0.0.1"],
			["https://hooks.example.test", "10.0.0.10"],
			["https://hooks.example.test", "169.254.169.254"],
			["https://hooks.example.test", "::1"],
			["https://hooks.example.test", "fd00::1"],
		] as const) {
			await expect(
				assertPublicWebhookUrl(url, resolvesTo(address)),
			).rejects.toThrow("public");
		}
	});

	it("rejects credentials and non-HTTPS URLs", async () => {
		const credentialed = new URL("https://hooks.example.test/crm");
		credentialed.username = "alice";
		credentialed.password = "opaque";
		await expect(
			assertPublicWebhookUrl(
				credentialed.toString(),
				resolvesTo("93.184.216.34"),
			),
		).rejects.toThrow("public HTTPS");
		await expect(
			assertPublicWebhookUrl(
				"http://hooks.example.test/crm",
				resolvesTo("93.184.216.34"),
			),
		).rejects.toThrow("public HTTPS");
	});

	it("rejects a hostname with any private answer", async () => {
		await expect(
			assertPublicWebhookUrl(
				"https://hooks.example.test/crm",
				resolvesTo("93.184.216.34", "192.168.1.10"),
			),
		).rejects.toThrow("public addresses");
	});

	it("rejects IPv4 special-purpose ranges", () => {
		for (const address of [
			"0.1.2.3",
			"10.0.0.1",
			"100.64.0.1",
			"127.0.0.1",
			"169.254.1.1",
			"172.16.0.1",
			"192.0.0.9",
			"192.0.2.1",
			"192.31.196.1",
			"192.52.193.1",
			"192.88.99.1",
			"192.168.1.1",
			"192.175.48.1",
			"198.18.0.1",
			"198.51.100.1",
			"203.0.113.1",
			"224.0.0.1",
			"240.0.0.1",
		]) {
			expect(isPublicIpAddress(address)).toBe(false);
		}
		expect(isPublicIpAddress("93.184.216.34")).toBe(true);
	});

	it("rejects IPv6 special-purpose ranges and IPv4-mapped forms", () => {
		for (const address of [
			"::",
			"::1",
			"::ffff:192.0.2.1",
			"::ffff:c000:0201",
			"64:ff9b::c000:201",
			"100::1",
			"100:0:0:1::1",
			"2001::1",
			"2001:2::1",
			"2001:3::1",
			"2001:4:112::1",
			"2001:10::1",
			"2001:20::1",
			"2001:30::1",
			"2001:db8::1",
			"2002::1",
			"2620:4f:8000::1",
			"3fff::1",
			"5f00::1",
			"fc00::1",
			"fe80::1",
			"fec0::1",
			"ff02::1",
		]) {
			expect(isPublicIpAddress(address)).toBe(false);
		}
		expect(isPublicIpAddress("2001:4860:4860::8888")).toBe(true);
	});
});
