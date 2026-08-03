"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@crm/ui/components/chart";
import { cn } from "@crm/ui/lib/utils";
import * as React from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Label,
	LabelList,
	Pie,
	PieChart,
	RadialBar,
	RadialBarChart,
	Text,
	XAxis,
} from "recharts";

type Datum = Record<string, number | string | null>;

type CartesianProps = {
	/** Rows to plot, already shaped for the chart. */
	data: Datum[];
	/** Maps each series key to a label + color (use `color: "var(--chart-N)"`). */
	config: ChartConfig;
	/** The category (x-axis) key. */
	xKey: string;
	/** Which keys in `config` to draw as series. Defaults to all config keys. */
	series?: string[];
	className?: string;
	/** Plot height in px. Default 200. */
	height?: number;
	/** Show the x-axis tick labels. Default true. */
	showXAxis?: boolean;
	/** Show a legend (useful for multi-series). Default false. */
	showLegend?: boolean;
	/** Format an x-axis tick (e.g. shorten a date). */
	formatX?: (value: string) => string;
	/**
	 * Format a plotted value in the tooltip. Pass this whenever the series is
	 * money or a rate — a raw `1250000` in the tooltip tells a reader nothing.
	 */
	formatValue?: (value: number | string) => string;
};

function seriesKeys(config: ChartConfig, series?: string[]) {
	return series ?? Object.keys(config);
}

const tooltip = (
	formatX?: (value: string) => string,
	formatValue?: (value: number | string) => string,
) => (
	<ChartTooltip
		cursor={false}
		content={
			<ChartTooltipContent
				indicator="dot"
				labelFormatter={formatX ? (label) => formatX(String(label)) : undefined}
				valueFormatter={formatValue}
			/>
		}
	/>
);

const X_AXIS_PROPS = {
	tickLine: false,
	axisLine: false,
	tickMargin: 12,
} as const;

/**
 * With a full-bleed plot (zero horizontal margin) the first and last category
 * labels sit at the very edges, where a centered label clips against the card.
 * Anchor the edge labels inward (start / end) and center the rest. Recharts
 * clones this element per tick, injecting the computed coordinates + index.
 */
function EdgeTick({
	x,
	y,
	payload,
	index,
	visibleTicksCount,
	formatX,
}: {
	x?: number;
	y?: number;
	payload?: { value: string | number };
	index?: number;
	visibleTicksCount?: number;
	formatX?: (value: string) => string;
}) {
	const isFirst = index === 0;
	const isLast = index === (visibleTicksCount ?? 0) - 1;
	const anchor = isFirst ? "start" : isLast ? "end" : "middle";
	const raw = String(payload?.value ?? "");
	return (
		<Text
			x={x}
			y={y}
			textAnchor={anchor}
			verticalAnchor="start"
			className="fill-muted-foreground text-xs"
		>
			{formatX ? formatX(raw) : raw}
		</Text>
	);
}

function AreaTrend({
	data,
	config,
	xKey,
	series,
	className,
	height = 200,
	showXAxis = true,
	showLegend = false,
	formatX,
	formatValue,
	stacked = false,
}: CartesianProps & {
	stacked?: boolean;
}) {
	const keys = seriesKeys(config, series);
	const gradientId = React.useId().replace(/:/g, "");

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto w-full", className)}
			style={{ height }}
		>
			<AreaChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
				<defs>
					{keys.map((key) => (
						<linearGradient
							key={key}
							id={`${gradientId}-${key}`}
							x1="0"
							y1="0"
							x2="0"
							y2="1"
						>
							<stop
								offset="5%"
								stopColor={`var(--color-${key})`}
								stopOpacity={0.8}
							/>
							<stop
								offset="95%"
								stopColor={`var(--color-${key})`}
								stopOpacity={0.1}
							/>
						</linearGradient>
					))}
				</defs>
				<CartesianGrid vertical={false} stroke="var(--border)" />
				<XAxis
					dataKey={xKey}
					hide={!showXAxis}
					tick={<EdgeTick formatX={formatX} />}
					interval="preserveStartEnd"
					minTickGap={24}
					{...X_AXIS_PROPS}
				/>
				{tooltip(formatX, formatValue)}
				{keys.map((key) => (
					<Area
						key={key}
						dataKey={key}
						type="monotone"
						stroke={`var(--color-${key})`}
						strokeWidth={2}
						fill={`url(#${gradientId}-${key})`}
						stackId={stacked ? "stack" : undefined}
						dot={false}
						activeDot={{ r: 3, strokeWidth: 0 }}
					/>
				))}
				{showLegend ? (
					<ChartLegend
						verticalAlign="bottom"
						content={<ChartLegendContent />}
					/>
				) : null}
			</AreaChart>
		</ChartContainer>
	);
}

/**
 * Grouped/stacked bar chart for discrete buckets (per-month counts, breakdowns).
 * Same prop shape as {@link AreaTrend} for drop-in consistency.
 */
function BarTrend({
	data,
	config,
	xKey,
	series,
	className,
	height = 180,
	showXAxis = true,
	showLegend = false,
	formatX,
	formatValue,
	stacked = false,
}: CartesianProps & { stacked?: boolean }) {
	const keys = seriesKeys(config, series);

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto w-full", className)}
			style={{ height }}
		>
			<BarChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
				<CartesianGrid vertical={false} stroke="var(--border)" />
				<XAxis
					dataKey={xKey}
					hide={!showXAxis}
					tick={<EdgeTick formatX={formatX} />}
					interval="preserveStartEnd"
					minTickGap={24}
					{...X_AXIS_PROPS}
				/>
				{tooltip(formatX, formatValue)}
				{keys.map((key) => (
					<Bar
						key={key}
						dataKey={key}
						fill={`var(--color-${key})`}
						radius={0}
						stackId={stacked ? "stack" : undefined}
						maxBarSize={40}
					/>
				))}
				{showLegend ? (
					<ChartLegend
						verticalAlign="bottom"
						content={<ChartLegendContent />}
					/>
				) : null}
			</BarChart>
		</ChartContainer>
	);
}

type DonutSlice = { key: string; label: string; value: number; color: string };

function BarStat({
	data,
	className,
	height = 200,
	onBarClick,
	formatValue,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	onBarClick?: (key: string) => void;
	formatValue?: (value: number | string) => string;
}) {
	const config: ChartConfig = Object.fromEntries(
		data.map((d) => [d.key, { label: d.label, color: d.color }]),
	);

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto w-full", className)}
			style={{ height }}
		>
			<BarChart data={data} margin={{ left: 0, right: 0, top: 24, bottom: 0 }}>
				<CartesianGrid vertical={false} stroke="var(--border)" />
				<XAxis
					dataKey="label"
					tickLine={false}
					axisLine={false}
					tickMargin={12}
					tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							hideLabel
							nameKey="key"
							valueFormatter={formatValue}
						/>
					}
				/>
				<Bar
					dataKey="value"
					radius={0}
					maxBarSize={40}
					className={onBarClick ? "cursor-pointer" : undefined}
					onClick={
						onBarClick
							? (_, index) => {
									const slice = data[index];
									if (slice) onBarClick(slice.key);
								}
							: undefined
					}
				>
					<LabelList
						dataKey="value"
						position="top"
						className="fill-foreground"
						fontSize={12}
					/>
					{data.map((slice) => (
						<Cell key={slice.key} fill={slice.color} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}

/**
 * Donut chart with an optional bold value in the middle and a faint track
 * behind the data — ideal for a single-metric breakdown (members by role,
 * findings by severity, plan usage).
 */
function DonutStat({
	data,
	className,
	height = 200,
	centerValue,
	centerLabel,
	onSliceClick,
	formatValue,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	centerValue?: React.ReactNode;
	centerLabel?: React.ReactNode;
	onSliceClick?: (key: string) => void;
	formatValue?: (value: number | string) => string;
}) {
	const config: ChartConfig = Object.fromEntries(
		data.map((d) => [d.key, { label: d.label, color: d.color }]),
	);
	const hasCenter = centerValue != null || centerLabel != null;
	const centerText = String(centerValue ?? "");
	const centerFontSize = centerText.length > 12 ? 13 : centerText.length > 9 ? 16 : 22;
	const innerRadius = Math.round(height * 0.34);
	const outerRadius = Math.round(height * 0.46);

	return (
		<ChartContainer
			config={config}
			className={cn("mx-auto aspect-square", className)}
			style={{ height }}
		>
			<PieChart>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							hideLabel
							nameKey="key"
							valueFormatter={formatValue}
						/>
					}
				/>
				{/* Faint track so a partial ring still reads as a full circle. */}
				<Pie
					data={[{ value: 1 }]}
					dataKey="value"
					innerRadius={innerRadius}
					outerRadius={outerRadius}
					fill="var(--muted)"
					fillOpacity={0.45}
					stroke="none"
					isAnimationActive={false}
				/>
				<Pie
					data={data}
					dataKey="value"
					nameKey="key"
					innerRadius={innerRadius}
					outerRadius={outerRadius}
					paddingAngle={data.length > 1 ? 2 : 0}
					className={onSliceClick ? "cursor-pointer" : undefined}
					onClick={
						onSliceClick
							? (_, index) => {
									const slice = data[index];
									if (slice) onSliceClick(slice.key);
								}
							: undefined
					}
				>
					{data.map((slice) => (
						<Cell key={slice.key} fill={slice.color} stroke="none" />
					))}
					{hasCenter ? (
						<Label
							content={({ viewBox }) => {
								if (!viewBox || !("cx" in viewBox)) return null;
								return (
									<text
										x={viewBox.cx}
										y={viewBox.cy}
										textAnchor="middle"
										dominantBaseline="middle"
									>
										<tspan
											x={viewBox.cx}
											y={viewBox.cy}
											className="fill-foreground font-medium tabular-nums"
											fontSize={centerFontSize}
											textLength={centerText.length > 9 ? Math.round(innerRadius * 1.45) : undefined}
											lengthAdjust={centerText.length > 9 ? "spacingAndGlyphs" : undefined}
										>
											{centerText}
										</tspan>
										{centerLabel != null ? (
											<tspan
												x={viewBox.cx}
												y={(viewBox.cy ?? 0) + 20}
												className="fill-muted-foreground text-xs"
											>
												{String(centerLabel)}
											</tspan>
										) : null}
									</text>
								);
							}}
						/>
					) : null}
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}

/**
 * Radial bar chart for the same slice shape as {@link DonutStat} — each slice
 * becomes a ring, longest first, with the shared tooltip.
 */
function RadialStat({
	data,
	className,
	height = 200,
	formatValue,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	formatValue?: (value: number | string) => string;
}) {
	const config: ChartConfig = Object.fromEntries(
		data.map((d) => [d.key, { label: d.label, color: d.color }]),
	);
	const rows = [...data]
		.sort((left, right) => right.value - left.value)
		.map((slice) => ({ ...slice, fill: slice.color }));

	return (
		<ChartContainer
			config={config}
			className={cn("mx-auto aspect-square", className)}
			style={{ height }}
		>
			<RadialBarChart
				data={rows}
				innerRadius={Math.round(height * 0.16)}
				outerRadius={Math.round(height * 0.48)}
			>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							hideLabel
							nameKey="key"
							valueFormatter={formatValue}
						/>
					}
				/>
				<RadialBar dataKey="value" background={{ fill: "var(--muted)" }} />
			</RadialBarChart>
		</ChartContainer>
	);
}

export type { Datum, DonutSlice };
export { AreaTrend, BarStat, BarTrend, DonutStat, RadialStat };
