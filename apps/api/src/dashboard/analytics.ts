import { PipelineStageType } from "@crm/db";
import type {
	AnalyticsDimension,
	AnalyticsView,
	AnalyticsXyInput,
	ChartCdnDefinition,
} from "./analytics.contracts";

export type AnalyticsDate = Date | string;

export type AnalyticsPipeline = {
	id: string;
	name: string;
	stages: Array<{
		id: string;
		name: string;
		position: number;
		type: PipelineStageType;
	}>;
};

export type AnalyticsDeal = {
	id: string;
	pipelineId: string;
	stage: AnalyticsPipeline["stages"][number];
	owner: { id: string; name: string };
	createdAt: AnalyticsDate;
	closedAt: AnalyticsDate | null;
	amountCents: number | null;
	customValues: unknown;
	contacts?: Array<{
		utmSource: string | null;
		utmMedium: string | null;
		utmCampaign: string | null;
		utmTerm: string | null;
		utmContent: string | null;
	}>;
};

export type AnalyticsActivity = {
	dealId: string | null;
	type: string;
	occurredAt: AnalyticsDate | null;
	createdAt: AnalyticsDate;
	meta: unknown;
};

export type RevenueAnalyticsInput = {
	dimensions: AnalyticsDimension[];
	attributeKey?: string;
	limit: number;
	from: AnalyticsDate;
	to: AnalyticsDate;
	now?: AnalyticsDate;
	grain?: "hour" | "day" | "week" | "month" | "quarter";
	comparison?: "none" | "previousPeriod" | "previousYear";
	xy?: AnalyticsXyInput;
};

type StageVisit = {
	stageId: string;
	enteredAt: Date;
};

type Attribution = {
	channel: string | null;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	utmTerm: string | null;
	utmContent: string | null;
};

type Transition = {
	dealId: string;
	fromStageId: string;
	toStageId: string;
	at: Date;
};

const CONVERSION_TYPES = new Set(["FORM_CONVERSION", "EVENT_ATTENDANCE"]);
const UNKNOWN = "Unattributed";

/**
 * Builds all standard revenue views from already-authorized rows. Keeping this
 * function free of Prisma makes the metric definitions deterministic and easy
 * to use from tests, exports, jobs and future CLI consumers.
 */
export function buildRevenueAnalytics(
	pipelines: AnalyticsPipeline[],
	deals: AnalyticsDeal[],
	activities: AnalyticsActivity[],
	input: RevenueAnalyticsInput,
) {
	const now = toDate(input.now ?? input.to);
	const stageById = new Map(
		pipelines.flatMap((pipeline) =>
			pipeline.stages.map((stage) => [stage.id, stage] as const),
		),
	);
	const dealById = new Map(deals.map((deal) => [deal.id, deal]));
	const activityByDeal = groupActivities(activities, dealById);
	const transitions = activities
		.map((activity) => stageTransition(activity))
		.filter((transition): transition is Transition => transition !== null)
		.filter((transition) => dealById.has(transition.dealId));

	const stageVisits = new Map<string, Set<string>>();
	const stageDurations = new Map<string, number[]>();
	const transitionDurations = new Map<string, number[]>();
	const conversionRows = new Map<PipelineStageType, number[]>();

	for (const deal of deals) {
		const dealTransitions = transitions
			.filter((transition) => transition.dealId === deal.id)
			.sort((left, right) => left.at.getTime() - right.at.getTime());
		const visits = deriveStageVisits(deal, dealTransitions, stageById, now);
		for (const visit of visits) {
			const ids = stageVisits.get(visit.stageId) ?? new Set<string>();
			ids.add(deal.id);
			stageVisits.set(visit.stageId, ids);
		}
		for (const transition of dealTransitions) {
			const key = `${transition.fromStageId}:${transition.toStageId}`;
			const fromVisit = visits.find(
				(visit) => visit.stageId === transition.fromStageId,
			);
			if (fromVisit) {
				const days = elapsedDays(fromVisit.enteredAt, transition.at);
				addNumber(stageDurations, transition.fromStageId, days);
				addNumber(transitionDurations, key, days);
			}
		}
		if (deal.closedAt) {
			const outcome = stageById.get(deal.stage.id)?.type;
			if (outcome) {
				addNumber(
					conversionRows,
					outcome,
					elapsedDays(toDate(deal.createdAt), toDate(deal.closedAt)),
				);
			}
		}
	}

	const funnelRows = pipelines.flatMap((pipeline) =>
		pipeline.stages.map((stage, index) => {
			const count = stageVisits.get(stage.id)?.size ?? 0;
			const previous =
				stage.type === PipelineStageType.OPEN
					? pipeline.stages[index - 1]
					: pipeline.stages
							.filter((candidate) => candidate.type === PipelineStageType.OPEN)
							.at(-1);
			const previousCount = previous
				? (stageVisits.get(previous.id)?.size ?? 0)
				: 0;
			return {
				pipelineId: pipeline.id,
				pipeline: pipeline.name,
				stageId: stage.id,
				stage: stage.name,
				deals: count,
				conversionRate: previous
					? ratio(count, previousCount)
					: count > 0
						? 1
						: null,
				avgTimeDays: average(stageDurations.get(stage.id)),
			};
		}),
	);

	const conversionTimeRows = [...conversionRows.entries()].map(
		([outcome, values]) => ({
			outcome,
			deals: values.length,
			avgDays: average(values),
			medianDays: median(values),
		}),
	);

	const stagePerformanceRows = [...transitionDurations.entries()]
		.map(([key, values]) => {
			const parts = key.split(":");
			const fromStageId = parts[0] ?? key;
			const toStageId = parts[1] ?? key;
			const fromCount = stageVisits.get(fromStageId)?.size ?? 0;
			const toCount = stageVisits.get(toStageId)?.size ?? 0;
			return {
				fromStageId,
				fromStage: stageById.get(fromStageId)?.name ?? fromStageId,
				toStageId,
				toStage: stageById.get(toStageId)?.name ?? toStageId,
				transitions: values.length,
				conversionRate: ratio(toCount, fromCount),
				avgDays: average(values),
			};
		})
		.sort((left, right) => left.fromStage.localeCompare(right.fromStage));

	const views: AnalyticsView[] = [
		...(input.grain
			? [buildTimeSeriesView(deals, input.from, input.to, input.grain)]
			: []),
		view(
			"conversionFunnel",
			"Conversion funnel",
			"Deals reaching each stage and the rate from the preceding stage.",
			"bar",
			funnelRows.map((row) => ({
				label: `${row.pipeline} · ${row.stage}`,
				value: row.deals,
			})),
			funnelRows,
		),
		view(
			"conversionTime",
			"Time to conversion",
			"Average and median days from deal creation to a terminal outcome.",
			"bar",
			conversionTimeRows.map((row) => ({
				label: row.outcome,
				value: row.avgDays ?? 0,
			})),
			conversionTimeRows,
		),
		view(
			"stagePerformance",
			"Stage performance",
			"Conversion rates and elapsed time between adjacent stages.",
			"bar",
			stagePerformanceRows.map((row) => ({
				label: `${row.fromStage} → ${row.toStage}`,
				value: row.conversionRate ?? 0,
			})),
			stagePerformanceRows,
		),
	];

	if (input.xy) {
		views.push(
			buildXyView(
				pipelines,
				deals,
				activityByDeal,
				input.xy,
				toDate(input.from),
				toDate(input.to),
				input.grain ?? "month",
				input.attributeKey,
			),
		);
	}

	for (const dimension of input.dimensions) {
		if (dimension === "dealAttribute" && !input.attributeKey) continue;
		const rows = breakdown(
			deals,
			activityByDeal,
			dimension,
			input.attributeKey,
		);
		views.push(
			view(
				"breakdown",
				breakdownTitle(dimension, input.attributeKey),
				"Deal count, value and won conversion rate for the selected cut.",
				"bar",
				rows.map((row) => ({ label: row.label, value: row.deals })),
				rows.slice(0, input.limit),
			),
		);
	}

	return {
		window: {
			from: toDate(input.from).toISOString(),
			to: toDate(input.to).toISOString(),
		},
		dealCount: deals.length,
		comparison:
			input.comparison && input.comparison !== "none"
				? {
						requested: input.comparison,
						supported: false,
						reason: "Comparison windows are not materialized yet.",
					}
				: { requested: "none", supported: true },
		views,
		attribution: deals.map((deal) => ({
			dealId: deal.id,
			firstTouch: firstTouch(deal),
			currentConversion: currentConversion(activityByDeal.get(deal.id) ?? []),
			pipelineEntryCount: conversionHistory(activityByDeal.get(deal.id) ?? [])
				.length,
			firstPipelineEntryAt: firstConversionAt(
				activityByDeal.get(deal.id) ?? [],
			),
			lastPipelineEntryAt: lastConversionAt(activityByDeal.get(deal.id) ?? []),
		})),
	};
}

function buildTimeSeriesView(
	deals: AnalyticsDeal[],
	fromValue: AnalyticsDate,
	toValue: AnalyticsDate,
	grain: NonNullable<RevenueAnalyticsInput["grain"]>,
): AnalyticsView {
	const from = toDate(fromValue);
	const to = toDate(toValue);
	const buckets = timeBuckets(from, to, grain);
	const rows = buckets.map((bucket) => {
		let created = 0;
		let won = 0;
		for (const deal of deals) {
			if (
				inRange(toDate(deal.createdAt), from, to) &&
				inBucket(toDate(deal.createdAt), bucket)
			)
				created += 1;
			if (
				deal.closedAt &&
				deal.stage.type === PipelineStageType.WON &&
				inRange(toDate(deal.closedAt), from, to) &&
				inBucket(toDate(deal.closedAt), bucket)
			)
				won += 1;
		}
		return {
			period: bucket.label,
			created,
			won,
			conversionRate: ratio(won, created),
		};
	});
	const result = view(
		"timeSeries",
		"Conversion over time",
		`Deals created, won and conversion rate by ${grain}.`,
		"line",
		rows.map((row) => ({ label: row.period, value: row.conversionRate ?? 0 })),
		rows,
	);
	result.chart.data.datasets = [
		{ label: "Deals created", data: rows.map((row) => row.created) },
		{ label: "Deals won", data: rows.map((row) => row.won) },
		{
			label: "Conversion rate",
			data: rows.map((row) => row.conversionRate ?? 0),
		},
	];
	return result;
}

const XY_Y_LABELS: Record<AnalyticsXyInput["y"], string> = {
	deals: "Deal count",
	won: "Deals won",
	valueCents: "Deal value",
	winRate: "Win rate",
	avgCycleDays: "Avg cycle (days)",
};

/**
 * The generic view behind the custom builder: any X (a time bucket, a stage,
 * or an attribution dimension), any Y aggregate, and an optional second
 * dimension that fans the result into one dataset per series — the only view
 * that emits more than one dataset per request besides the time series.
 *
 * Time cells cohort by `createdAt`: "won" on a time axis reads as "deals
 * created in this bucket that went on to win", which keeps every Y consistent
 * within a bucket instead of mixing created-based and closed-based counts.
 */
function buildXyView(
	pipelines: AnalyticsPipeline[],
	deals: AnalyticsDeal[],
	activityByDeal: Map<string, AnalyticsActivity[]>,
	xy: AnalyticsXyInput,
	from: Date,
	to: Date,
	grain: NonNullable<RevenueAnalyticsInput["grain"]>,
	attributeKey?: string,
): AnalyticsView {
	const label = (deal: AnalyticsDeal, dimension: AnalyticsDimension) =>
		dimensionValue(
			deal,
			activityByDeal.get(deal.id) ?? [],
			dimension,
			attributeKey,
		);

	type Cell = { label: string; match: (deal: AnalyticsDeal) => boolean };
	let cells: Cell[];
	if (xy.x === "time") {
		cells = timeBuckets(from, to, grain).map((bucket) => ({
			label: bucket.label,
			match: (deal) => inBucket(toDate(deal.createdAt), bucket),
		}));
	} else if (xy.x === "stage") {
		cells = pipelines.flatMap((pipeline) =>
			pipeline.stages.map((stage) => ({
				label:
					pipelines.length > 1
						? `${pipeline.name} · ${stage.name}`
						: stage.name,
				match: (deal: AnalyticsDeal) => deal.stage.id === stage.id,
			})),
		);
	} else {
		const dimension = xy.x;
		const totals = new Map<string, number>();
		for (const deal of deals) {
			const value = label(deal, dimension);
			totals.set(value, (totals.get(value) ?? 0) + 1);
		}
		cells = [...totals.entries()]
			.sort((left, right) => right[1] - left[1])
			.slice(0, 12)
			.map(([value]) => ({
				label: value,
				match: (deal: AnalyticsDeal) => label(deal, dimension) === value,
			}));
	}

	let seriesLabels: Array<string | null> = [null];
	if (xy.seriesBy) {
		const dimension = xy.seriesBy;
		const totals = new Map<string, number>();
		for (const deal of deals) {
			const value = label(deal, dimension);
			totals.set(value, (totals.get(value) ?? 0) + 1);
		}
		seriesLabels = [...totals.entries()]
			.sort((left, right) => right[1] - left[1])
			.slice(0, 8)
			.map(([value]) => value);
	}

	const aggregate = (list: AnalyticsDeal[]) => {
		if (xy.y === "deals") return list.length;
		const wonDeals = list.filter(
			(deal) => deal.stage.type === PipelineStageType.WON,
		);
		if (xy.y === "won") return wonDeals.length;
		if (xy.y === "valueCents")
			return list.reduce((sum, deal) => sum + (deal.amountCents ?? 0), 0);
		if (xy.y === "winRate")
			return list.length ? wonDeals.length / list.length : 0;
		const cycles = wonDeals
			.filter((deal) => deal.closedAt)
			.map((deal) =>
				elapsedDays(
					toDate(deal.createdAt),
					toDate(deal.closedAt as AnalyticsDate),
				),
			);
		return average(cycles) ?? 0;
	};

	const datasets = seriesLabels.map((series) => ({
		label: series ?? XY_Y_LABELS[xy.y],
		data: cells.map((cell) =>
			aggregate(
				deals.filter(
					(deal) =>
						cell.match(deal) &&
						(series === null ||
							(xy.seriesBy && label(deal, xy.seriesBy) === series)),
				),
			),
		),
	}));

	const rows = cells.map((cell, index) => {
		const row: Record<string, string | number | null> = { label: cell.label };
		for (const [seriesIndex, series] of seriesLabels.entries()) {
			row[series ?? "value"] = datasets[seriesIndex]?.data[index] ?? 0;
		}
		return row;
	});

	return {
		key: "xy",
		title: "Custom view",
		description: "The builder-defined axes over the selected window.",
		chart: {
			type: "bar",
			data: { labels: cells.map((cell) => cell.label), datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				...(xy.seriesBy ? { stacked: true } : {}),
			},
		},
		rows,
	};
}

type TimeBucket = { start: Date; end: Date; label: string };

function timeBuckets(
	from: Date,
	to: Date,
	grain: NonNullable<RevenueAnalyticsInput["grain"]>,
) {
	const buckets: TimeBucket[] = [];
	let start = bucketStart(from, grain);
	while (start < to) {
		const end = bucketEnd(start, grain);
		buckets.push({ start, end, label: periodLabel(start, grain) });
		start = end;
	}
	return buckets;
}

function bucketStart(
	date: Date,
	grain: NonNullable<RevenueAnalyticsInput["grain"]>,
) {
	const value = new Date(date);
	if (grain === "hour") {
		value.setUTCMinutes(0, 0, 0);
		return value;
	}
	value.setUTCHours(0, 0, 0, 0);
	if (grain === "day") return value;
	if (grain === "week") {
		const day = value.getUTCDay();
		value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
		return value;
	}
	if (grain === "quarter") {
		value.setUTCMonth(Math.floor(value.getUTCMonth() / 3) * 3, 1);
		return value;
	}
	value.setUTCDate(1);
	return value;
}

function bucketEnd(
	start: Date,
	grain: NonNullable<RevenueAnalyticsInput["grain"]>,
) {
	const end = new Date(start);
	if (grain === "hour") end.setUTCHours(end.getUTCHours() + 1);
	else if (grain === "day") end.setUTCDate(end.getUTCDate() + 1);
	else if (grain === "week") end.setUTCDate(end.getUTCDate() + 7);
	else if (grain === "quarter") end.setUTCMonth(end.getUTCMonth() + 3);
	else end.setUTCMonth(end.getUTCMonth() + 1);
	return end;
}

function periodLabel(
	date: Date,
	grain: NonNullable<RevenueAnalyticsInput["grain"]>,
) {
	if (grain === "hour")
		return `${date.toISOString().slice(0, 13).replace("T", " ")}:00`;
	if (grain === "day") return date.toISOString().slice(0, 10);
	if (grain === "week") return `Week of ${date.toISOString().slice(0, 10)}`;
	if (grain === "quarter")
		return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
	return date.toISOString().slice(0, 7);
}

function inBucket(date: Date, bucket: TimeBucket) {
	return date >= bucket.start && date < bucket.end;
}

function inRange(date: Date, from: Date, to: Date) {
	return date >= from && date < to;
}

function view(
	key: AnalyticsView["key"],
	title: string,
	description: string,
	type: ChartCdnDefinition["type"],
	chartRows: Array<{ label: string; value: number }>,
	rows: Array<Record<string, string | number | null>>,
): AnalyticsView {
	return {
		key,
		title,
		description,
		chart: {
			type,
			data: {
				labels: chartRows.map((row) => row.label),
				datasets: [{ label: title, data: chartRows.map((row) => row.value) }],
			},
			options: { responsive: true, maintainAspectRatio: false },
		},
		rows,
	};
}

function breakdown(
	deals: AnalyticsDeal[],
	activityByDeal: Map<string, AnalyticsActivity[]>,
	dimension: AnalyticsDimension,
	attributeKey?: string,
) {
	const buckets = new Map<
		string,
		{ deals: number; won: number; valueCents: number }
	>();
	for (const deal of deals) {
		const label = dimensionValue(
			deal,
			activityByDeal.get(deal.id) ?? [],
			dimension,
			attributeKey,
		);
		const row = buckets.get(label) ?? { deals: 0, won: 0, valueCents: 0 };
		row.deals += 1;
		if (deal.stage.type === PipelineStageType.WON) row.won += 1;
		row.valueCents += deal.amountCents ?? 0;
		buckets.set(label, row);
	}
	return [...buckets.entries()]
		.map(([label, row]) => ({
			label,
			...row,
			conversionRate: ratio(row.won, row.deals),
		}))
		.sort(
			(left, right) =>
				right.deals - left.deals || left.label.localeCompare(right.label),
		);
}

function dimensionValue(
	deal: AnalyticsDeal,
	activities: AnalyticsActivity[],
	dimension: AnalyticsDimension,
	attributeKey?: string,
) {
	const current = currentConversion(activities);
	const first = firstTouch(deal);
	if (dimension === "owner") return deal.owner.name || deal.owner.id;
	if (dimension === "channel") {
		return current.channel ?? first.channel ?? UNKNOWN;
	}
	if (dimension === "dealAttribute") {
		return scalarValue(readJson(deal.customValues, attributeKey ?? ""));
	}
	const key = dimension as keyof Omit<Attribution, "channel">;
	return current[key] ?? first[key] ?? UNKNOWN;
}

function firstTouch(deal: AnalyticsDeal): Attribution {
	const contact = deal.contacts?.find((candidate) =>
		Object.values(candidate).some(Boolean),
	);
	if (!contact) return emptyAttribution();
	return {
		...contact,
		channel: contact.utmMedium ?? contact.utmSource,
	};
}

function currentConversion(activities: AnalyticsActivity[]): Attribution {
	const conversions = conversionHistory(activities);
	const latest = conversions.at(-1);
	if (!latest) return emptyAttribution();
	const meta = record(latest.meta);
	return {
		channel:
			stringValue(meta.channel) ??
			stringValue(meta.utmMedium) ??
			stringValue(meta.utmSource),
		utmSource: stringValue(meta.utmSource),
		utmMedium: stringValue(meta.utmMedium),
		utmCampaign: stringValue(meta.utmCampaign),
		utmTerm: stringValue(meta.utmTerm),
		utmContent: stringValue(meta.utmContent),
	};
}

function conversionHistory(activities: AnalyticsActivity[]) {
	return activities
		.filter((activity) => CONVERSION_TYPES.has(activity.type))
		.sort(
			(left, right) =>
				activityDate(left).getTime() - activityDate(right).getTime(),
		);
}

function firstConversionAt(activities: AnalyticsActivity[]) {
	const first = conversionHistory(activities)[0];
	return first ? activityDate(first).toISOString() : null;
}

function lastConversionAt(activities: AnalyticsActivity[]) {
	const conversions = conversionHistory(activities);
	const last = conversions.at(-1);
	return last ? activityDate(last).toISOString() : null;
}

function deriveStageVisits(
	deal: AnalyticsDeal,
	transitions: Transition[],
	stageById: Map<string, AnalyticsPipeline["stages"][number]>,
	now: Date,
): StageVisit[] {
	const entry = new Map<string, Date>();
	const first = transitions[0];
	if (first) entry.set(first.fromStageId, toDate(deal.createdAt));
	for (const transition of transitions)
		entry.set(transition.toStageId, transition.at);
	if (!entry.has(deal.stage.id)) {
		entry.set(deal.stage.id, toDate(deal.closedAt ?? now));
	}
	return [...entry.entries()]
		.filter(([stageId]) => stageById.has(stageId))
		.map(([stageId, enteredAt]) => ({ stageId, enteredAt }));
}

function groupActivities(
	activities: AnalyticsActivity[],
	deals: Map<string, AnalyticsDeal>,
) {
	const grouped = new Map<string, AnalyticsActivity[]>();
	for (const activity of activities) {
		if (!activity.dealId || !deals.has(activity.dealId)) continue;
		const rows = grouped.get(activity.dealId) ?? [];
		rows.push(activity);
		grouped.set(activity.dealId, rows);
	}
	return grouped;
}

function stageTransition(activity: AnalyticsActivity): Transition | null {
	if (activity.type !== "STAGE_CHANGE" || !activity.dealId) return null;
	const meta = record(activity.meta);
	const fromStageId = stringValue(meta.fromId);
	const toStageId = stringValue(meta.toId);
	if (!fromStageId || !toStageId) return null;
	return {
		dealId: activity.dealId,
		fromStageId,
		toStageId,
		at: activityDate(activity),
	};
}

function addNumber(map: Map<string, number[]>, key: string, value: number) {
	const values = map.get(key) ?? [];
	values.push(value);
	map.set(key, values);
}

function average(values: number[] | undefined) {
	if (!values || values.length === 0) return null;
	return (
		Math.round(
			(values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
		) / 100
	);
}

function median(values: number[] | undefined) {
	if (!values || values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? Math.round(
				(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2) * 100,
			) / 100
		: Math.round((sorted[middle] ?? 0) * 100) / 100;
}

function ratio(numerator: number, denominator: number) {
	return denominator === 0
		? null
		: Math.round((numerator / denominator) * 10_000) / 10_000;
}

function elapsedDays(from: Date, to: Date) {
	return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}

function activityDate(activity: AnalyticsActivity) {
	return toDate(activity.occurredAt ?? activity.createdAt);
}

function toDate(value: AnalyticsDate) {
	return value instanceof Date ? value : new Date(value);
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readJson(value: unknown, key: string): unknown {
	return record(value)[key];
}

function scalarValue(value: unknown): string {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (Array.isArray(value))
		return value.map((item) => scalarValue(item)).join(", ") || UNKNOWN;
	return UNKNOWN;
}

function emptyAttribution(): Attribution {
	return {
		channel: null,
		utmSource: null,
		utmMedium: null,
		utmCampaign: null,
		utmTerm: null,
		utmContent: null,
	};
}

function breakdownTitle(dimension: AnalyticsDimension, attributeKey?: string) {
	if (dimension === "dealAttribute")
		return `By deal attribute · ${attributeKey}`;
	return `By ${dimension}`;
}
