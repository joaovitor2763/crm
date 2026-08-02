export function printResult(value: unknown, human: boolean): void {
	if (!human) {
		console.log(JSON.stringify(value ?? null));
		return;
	}
	if (value === null || value === undefined) {
		console.log("ok");
		return;
	}
	if (typeof value !== "object") {
		console.log(String(value));
		return;
	}
	for (const [key, item] of Object.entries(value)) {
		console.log(
			`${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`,
		);
	}
}

export function printError(error: unknown, human: boolean): void {
	const message =
		error instanceof Error ? error.message : "CRM CLI request failed.";
	const code =
		error &&
		typeof error === "object" &&
		"code" in error &&
		typeof error.code === "string"
			? error.code
			: "CLI_ERROR";
	if (human) {
		console.error(`error (${code}): ${message}`);
	} else {
		console.error(JSON.stringify({ error: { code, message } }));
	}
}
