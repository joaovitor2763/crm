export type CliOptions = {
	apiUrl?: string;
	apiKey?: string;
	timeoutMs?: number;
	json: boolean;
};

export type CliInvocation = {
	command: string[];
	data?: unknown;
	options: CliOptions;
};

const VALUE_OPTIONS = new Set([
	"--api-url",
	"--api-key",
	"--timeout",
	"--data",
]);

export function parseArguments(argv: string[]): CliInvocation {
	const options: CliOptions = { json: false };
	const command: string[] = [];
	let data: unknown;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument) continue;
		if (argument === "--json") {
			options.json = true;
			continue;
		}
		if (!VALUE_OPTIONS.has(argument)) {
			command.push(argument);
			continue;
		}
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`${argument} requires a value.`);
		}
		index += 1;
		switch (argument) {
			case "--api-url":
				options.apiUrl = value;
				break;
			case "--api-key":
				options.apiKey = value;
				break;
			case "--timeout": {
				const timeoutMs = Number(value);
				if (!Number.isInteger(timeoutMs) || timeoutMs < 100) {
					throw new Error("--timeout must be an integer of at least 100ms.");
				}
				options.timeoutMs = timeoutMs;
				break;
			}
			case "--data":
				try {
					data = JSON.parse(value);
				} catch {
					throw new Error("--data must contain valid JSON.");
				}
				break;
		}
	}
	return { command, data, options };
}
