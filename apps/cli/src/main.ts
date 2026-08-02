#!/usr/bin/env bun
import "@crm/env/load";

import { parseArguments } from "./arguments";
import { helpText, run } from "./run";

const invocation = parseArguments(process.argv.slice(2));
try {
	if (invocation.command.length === 0 || invocation.command[0] === "help") {
		console.log(helpText());
		process.exit(0);
	}
	const result = await run(invocation);
	console.log(
		invocation.options.json
			? JSON.stringify(result)
			: JSON.stringify(result, null, 2),
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
