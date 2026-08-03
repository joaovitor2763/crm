"use client";

import { Spinner } from "@crm/ui/components/spinner";
import dynamic from "next/dynamic";

/**
 * Recharts measures the DOM to lay a chart out, so there is nothing useful to
 * render on the server — an SSR pass emits a zero-width plot that the browser
 * immediately throws away. Loading the charts on the client only also keeps
 * recharts out of the shell bundle every other page pays for.
 */
const load = () => import("@crm/ui/components/dashboard-chart");

const loading = () => (
	<div className="flex h-[200px] items-center justify-center">
		<Spinner />
	</div>
);

export const AreaTrend = dynamic(() => load().then((m) => m.AreaTrend), {
	ssr: false,
	loading,
});

export const DonutStat = dynamic(() => load().then((m) => m.DonutStat), {
	ssr: false,
	loading,
});

export const BarTrend = dynamic(() => load().then((m) => m.BarTrend), {
	ssr: false,
	loading,
});

export const RadialStat = dynamic(() => load().then((m) => m.RadialStat), {
	ssr: false,
	loading,
});

/**
 * Not recharts, but the same deal: it measures the DOM (ResizeObserver) and
 * carries the motion runtime, neither of which belongs in the shell bundle.
 */
export const FunnelChart = dynamic(
	() => import("@crm/ui/components/funnel-chart").then((m) => m.FunnelChart),
	{ ssr: false, loading },
);
