export function toolResult(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
		structuredContent: { result: toStructuredValue(value) },
	};
}

export function toolError(message: string) {
	return {
		isError: true,
		content: [{ type: "text" as const, text: message }],
	};
}

function toStructuredValue(value: unknown): object {
	const serialized = JSON.parse(JSON.stringify(value));
	return Array.isArray(serialized) ? { items: serialized } : serialized;
}
