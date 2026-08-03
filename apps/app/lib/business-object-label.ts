const SYSTEM_OBJECT_LABELS: Record<
	string,
	{ singular: string; plural: string }
> = {
	"revenue-accounts": {
		singular: "Revenue account",
		plural: "Revenue accounts",
	},
};

/**
 * System objects use the product language even when an older stored definition
 * has a localized label. Custom objects keep the workspace-authored wording.
 */
export function businessObjectLabel(
	object: { key: string; name?: string; pluralName?: string },
	form: "singular" | "plural" = "plural",
): string {
	const systemLabel = SYSTEM_OBJECT_LABELS[object.key]?.[form];
	if (systemLabel) return systemLabel;
	return form === "plural"
		? (object.pluralName ?? object.name ?? object.key)
		: (object.name ?? object.pluralName ?? object.key);
}
