import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { BadRequestException } from "@nestjs/common";
import { Agent, fetch } from "undici";

type AddressResolver = (hostname: string) => Promise<readonly string[]>;
type ResolvedAddress = { address: string; family: 4 | 6 };

export async function assertPublicWebhookUrl(
	rawUrl: string,
	resolveAddresses: AddressResolver = publicAddresses,
): Promise<void> {
	const url = parsePublicHttpsUrl(rawUrl);
	let addresses: readonly string[];
	try {
		addresses = await resolveAddresses(unbracket(url.hostname));
	} catch {
		throw new BadRequestException("Webhook hostname could not be resolved.");
	}
	assertPublicAddresses(addresses);
}

export async function postPublicWebhook(
	rawUrl: string,
	request: {
		headers: Record<string, string>;
		body: string;
		signal: AbortSignal;
	},
) {
	const url = parsePublicHttpsUrl(rawUrl);
	const records = await resolveAddressRecords(url.hostname);
	assertPublicAddresses(records.map((record) => record.address));
	const dispatcher = new Agent({
		connect: { lookup: pinnedLookup(url.hostname, records) },
	});
	try {
		const response = await fetch(url, {
			method: "POST",
			redirect: "error",
			headers: request.headers,
			body: request.body,
			signal: request.signal,
			dispatcher,
		});
		await response.body?.cancel();
		return { ok: response.ok, status: response.status };
	} finally {
		await dispatcher.close();
	}
}

async function publicAddresses(hostname: string): Promise<string[]> {
	return (await resolveAddressRecords(hostname)).map(
		(record) => record.address,
	);
}

async function resolveAddressRecords(
	hostname: string,
): Promise<ResolvedAddress[]> {
	try {
		return (
			await lookup(unbracket(hostname), { all: true, verbatim: true })
		).map((record) => ({
			address: record.address,
			family: record.family === 6 ? 6 : 4,
		}));
	} catch {
		throw new BadRequestException("Webhook hostname could not be resolved.");
	}
}

function parsePublicHttpsUrl(rawUrl: string): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new BadRequestException("Webhook URL is invalid.");
	}
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.hostname.toLowerCase() === "localhost"
	) {
		throw new BadRequestException(
			"Webhook URL must be a public HTTPS endpoint.",
		);
	}
	return url;
}

function assertPublicAddresses(addresses: readonly string[]): void {
	if (
		addresses.length === 0 ||
		addresses.some((address) => !isPublicIpAddress(address))
	) {
		throw new BadRequestException(
			"Webhook URL must resolve only to public addresses.",
		);
	}
}

function pinnedLookup(
	expectedHostname: string,
	records: ResolvedAddress[],
): LookupFunction {
	let cursor = 0;
	return (hostname, options, callback) => {
		if (unbracket(hostname) !== unbracket(expectedHostname)) {
			callback(new Error("Unexpected webhook hostname."), "", 0);
			return;
		}
		const eligible = options.family
			? records.filter((record) => record.family === options.family)
			: records;
		if (eligible.length === 0) {
			callback(new Error("No address for the requested family."), "", 0);
			return;
		}
		if (options.all) {
			callback(null, eligible);
			return;
		}
		const record = eligible[cursor % eligible.length] as ResolvedAddress;
		cursor += 1;
		callback(null, record.address, record.family);
	};
}

type CidrRange = readonly [network: bigint, prefixLength: number];

const NON_PUBLIC_IPV4_RANGES: readonly CidrRange[] = [
	ipv4Range("0.0.0.0", 8),
	ipv4Range("10.0.0.0", 8),
	ipv4Range("100.64.0.0", 10),
	ipv4Range("127.0.0.0", 8),
	ipv4Range("169.254.0.0", 16),
	ipv4Range("172.16.0.0", 12),
	ipv4Range("192.0.0.0", 24),
	ipv4Range("192.0.2.0", 24),
	ipv4Range("192.31.196.0", 24),
	ipv4Range("192.52.193.0", 24),
	ipv4Range("192.88.99.0", 24),
	ipv4Range("192.168.0.0", 16),
	ipv4Range("192.175.48.0", 24),
	ipv4Range("198.18.0.0", 15),
	ipv4Range("198.51.100.0", 24),
	ipv4Range("203.0.113.0", 24),
	ipv4Range("224.0.0.0", 4),
	ipv4Range("240.0.0.0", 4),
];

const NON_PUBLIC_IPV6_RANGES: readonly CidrRange[] = [
	ipv6Range("::", 128),
	ipv6Range("::1", 128),
	ipv6Range("::ffff:0:0", 96),
	ipv6Range("64:ff9b::", 96),
	ipv6Range("64:ff9b:1::", 48),
	ipv6Range("100::", 64),
	ipv6Range("100:0:0:1::", 64),
	ipv6Range("2001::", 23),
	ipv6Range("2001:2::", 48),
	ipv6Range("2001:3::", 32),
	ipv6Range("2001:4:112::", 48),
	ipv6Range("2001:10::", 28),
	ipv6Range("2001:20::", 28),
	ipv6Range("2001:30::", 28),
	ipv6Range("2001:db8::", 32),
	ipv6Range("2002::", 16),
	ipv6Range("2620:4f:8000::", 48),
	ipv6Range("3fff::", 20),
	ipv6Range("5f00::", 16),
	ipv6Range("fc00::", 7),
	ipv6Range("fe80::", 10),
	ipv6Range("fec0::", 10),
	ipv6Range("ff00::", 8),
];

export function isPublicIpAddress(address: string): boolean {
	const normalized = unbracket(address).toLowerCase();
	const family = isIP(normalized);
	if (family === 4) {
		const value = parseIpv4(normalized);
		return (
			value !== undefined &&
			!NON_PUBLIC_IPV4_RANGES.some((range) => isInCidr(value, range, 32))
		);
	}
	if (family === 6) {
		const value = parseIpv6(normalized);
		return (
			value !== undefined &&
			value >> BigInt(125) === BigInt(1) &&
			!NON_PUBLIC_IPV6_RANGES.some((range) => isInCidr(value, range, 128))
		);
	}
	return false;
}

function isInCidr(
	value: bigint,
	[network, prefixLength]: CidrRange,
	bits: number,
): boolean {
	return (
		value >> BigInt(bits - prefixLength) ===
		network >> BigInt(bits - prefixLength)
	);
}

function ipv4Range(prefix: string, prefixLength: number): CidrRange {
	const network = parseIpv4(prefix);
	if (network === undefined) {
		throw new Error(`Invalid IPv4 CIDR prefix: ${prefix}`);
	}
	return [network, prefixLength];
}

function ipv6Range(prefix: string, prefixLength: number): CidrRange {
	const network = parseIpv6(prefix);
	if (network === undefined) {
		throw new Error(`Invalid IPv6 CIDR prefix: ${prefix}`);
	}
	return [network, prefixLength];
}

function parseIpv4(address: string): bigint | undefined {
	const octets = address.split(".");
	if (
		octets.length !== 4 ||
		octets.some((octet) => !/^\d+$/.test(octet) || Number(octet) > 255)
	) {
		return undefined;
	}
	return octets.reduce(
		(value, octet) => value * BigInt(256) + BigInt(octet),
		BigInt(0),
	);
}

function parseIpv6(address: string): bigint | undefined {
	const sections = address.split("::");
	if (sections.length > 2) {
		return undefined;
	}
	const left = parseIpv6Section(sections[0] ?? "");
	const right = parseIpv6Section(sections[1] ?? "");
	if (left === undefined || right === undefined) {
		return undefined;
	}
	const missing = 8 - left.length - right.length;
	if (
		(sections.length === 1 && missing !== 0) ||
		(sections.length === 2 && missing < 1)
	) {
		return undefined;
	}
	return [
		...left,
		...Array.from({ length: missing }, () => 0),
		...right,
	].reduce(
		(value, hextet) => value * BigInt(0x10000) + BigInt(hextet),
		BigInt(0),
	);
}

function parseIpv6Section(section: string): number[] | undefined {
	if (!section) {
		return [];
	}
	const groups = section.split(":");
	const hextets: number[] = [];
	for (const [index, group] of groups.entries()) {
		if (group.includes(".")) {
			if (index !== groups.length - 1) {
				return undefined;
			}
			const ipv4 = parseIpv4(group);
			if (ipv4 === undefined) {
				return undefined;
			}
			hextets.push(Number(ipv4 >> BigInt(16)), Number(ipv4 & BigInt(0xffff)));
			continue;
		}
		if (!/^[\da-f]{1,4}$/.test(group)) {
			return undefined;
		}
		hextets.push(Number.parseInt(group, 16));
	}
	return hextets;
}

function unbracket(value: string): string {
	return value.startsWith("[") && value.endsWith("]")
		? value.slice(1, -1)
		: value;
}
