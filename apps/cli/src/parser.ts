export type ParsedArgs = {
	command: string[];
	options: Record<string, string | true>;
};

export class CliUsageError extends Error {
	readonly code = "USAGE_ERROR";
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
	const command: string[] = [];
	const options: Record<string, string | true> = {};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) continue;
		if (!token.startsWith("-")) {
			command.push(token);
			continue;
		}

		const normalized = token.replace(/^-+/, "");
		if (!normalized) throw new CliUsageError("Option name is missing.");
		const equals = normalized.indexOf("=");
		if (equals >= 0) {
			const key = normalized.slice(0, equals);
			const value = normalized.slice(equals + 1);
			if (!value) throw new CliUsageError(`Option --${key} needs a value.`);
			options[key] = value;
			continue;
		}

		const next = argv[index + 1];
		if (next && !next.startsWith("-")) {
			options[normalized] = next;
			index += 1;
		} else {
			options[normalized] = true;
		}
	}

	return { command, options };
}

export function option(
	options: ParsedArgs["options"],
	name: string,
	defaultValue?: string,
): string | undefined {
	const value = options[name];
	if (value === true)
		throw new CliUsageError(`Option --${name} needs a value.`);
	return value ?? defaultValue;
}

export function requiredOption(
	options: ParsedArgs["options"],
	name: string,
): string {
	const value = option(options, name);
	if (!value) throw new CliUsageError(`Option --${name} is required.`);
	return value;
}

export function booleanOption(
	options: ParsedArgs["options"],
	name: string,
): boolean {
	const value = options[name];
	if (value === undefined || value === true) return value === true;
	if (value === "true") return true;
	if (value === "false") return false;
	throw new CliUsageError(`Option --${name} expects true or false.`);
}

export function jsonOption<T>(
	options: ParsedArgs["options"],
	name: string,
	defaultValue: T,
): T {
	const raw = option(options, name);
	if (raw === undefined) return defaultValue;
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new CliUsageError(`Option --${name} must contain valid JSON.`);
	}
}
