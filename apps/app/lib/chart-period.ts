export type ChartTimeGrain = "hour" | "day" | "week" | "month" | "quarter";

const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

const HOUR_LABEL = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	timeZone: "UTC",
});

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, {
	month: "short",
	year: "2-digit",
	timeZone: "UTC",
});

function utcDate(value: string): Date | undefined {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Converts the API's stable bucket keys into short, locale-aware chart labels.
 * An axis label only needs to distinguish neighbouring buckets without
 * colliding on a narrow card.
 */
export function formatChartPeriod(
	value: string,
	grain: ChartTimeGrain,
): string {
	if (grain === "quarter") {
		const match = /^(\d{4}) Q([1-4])$/.exec(value);
		return match ? `Q${match[2]} ’${match[1]?.slice(2)}` : value;
	}

	if (grain === "month") {
		const date = utcDate(`${value}-01T00:00:00Z`);
		return date ? MONTH_LABEL.format(date) : value;
	}

	if (grain === "hour") {
		const date = utcDate(`${value.replace(" ", "T")}:00Z`);
		return date ? HOUR_LABEL.format(date) : value;
	}

	const day = grain === "week" ? value.replace(/^Week of /, "") : value;
	const date = utcDate(`${day}T00:00:00Z`);
	return date ? DAY_LABEL.format(date) : value;
}
