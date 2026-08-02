"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useTRPC } from "@/lib/trpc/client";
import { studioParsers } from "./studio-search-params";

export type AttributionEntityType =
	| "CONTACT"
	| "COMPANY"
	| "DEAL"
	| "REVENUE_ACCOUNT";

const ENTITY_TYPES: Array<[AttributionEntityType, string]> = [
	["CONTACT", "Contact"],
	["COMPANY", "Company"],
	["DEAL", "Deal"],
	["REVENUE_ACCOUNT", "Revenue account"],
];

type Touch = {
	id: string;
	origin: string;
	channel: string | null;
	source: string | null;
	conversionType: string;
	pipelineId: string | null;
	occurredAt: string;
};
type Projection = {
	firstTouch: Touch | null;
	firstConversion: Touch | null;
	currentTouch: Touch | null;
	currentConversion?: Touch | null;
	conversionCount: number;
	touchCount: number;
	pipelineEntryCount: number;
	sourceHistory: string[];
	channelHistory: string[];
	events: Touch[];
};

export function StudioAttribution() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Attribution inspector</CardTitle>
				<CardDescription>
					Inspect first touch, current conversion, recurring entries and the
					complete explainable history for any governed element.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<AttributionInspector />
			</CardContent>
		</Card>
	);
}

export function AttributionInspector({
	entityType,
	entityId,
	compact = false,
}: {
	entityType?: AttributionEntityType;
	entityId?: string;
	compact?: boolean;
}) {
	const trpc = useTRPC();
	const [urlType, setUrlType] = useQueryState(
		"attributionType",
		studioParsers.attributionType,
	);
	const [urlId, setUrlId] = useQueryState(
		"attributionId",
		studioParsers.attributionId,
	);
	const selectedType = entityType ?? urlType;
	const selectedId = entityId ?? urlId;
	const projection = useQuery({
		...trpc.attribution.projection.queryOptions({
			entityType: selectedType,
			entityId: selectedId,
			includeEvents: true,
			limit: 200,
		}),
		enabled: Boolean(selectedId.trim()),
	});

	return (
		<div className="flex flex-col gap-4">
			{!compact ? (
				<div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)] md:items-end">
					<Field>
						<FieldLabel>Element</FieldLabel>
						<Select
							value={selectedType}
							onValueChange={(value) =>
								void setUrlType(value as AttributionEntityType)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ENTITY_TYPES.map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="attribution-record-id">Record ID</FieldLabel>
						<Input
							id="attribution-record-id"
							value={selectedId}
							onChange={(event) => void setUrlId(event.target.value)}
							placeholder="Paste a governed record ID"
						/>
					</Field>
				</div>
			) : null}
			{!selectedId.trim() ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyTitle>Choose an element</EmptyTitle>
						<EmptyDescription>
							Enter a record ID to inspect its attribution lineage.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : projection.isLoading ? (
				<div className="flex justify-center border py-10">
					<Spinner />
				</div>
			) : projection.error ? (
				<p
					className="border border-destructive/40 p-3 text-destructive text-xs"
					role="alert"
				>
					{projection.error.message}
				</p>
			) : projection.data ? (
				<ProjectionView projection={projection.data as unknown as Projection} />
			) : null}
		</div>
	);
}

function ProjectionView({ projection }: { projection: Projection }) {
	const currentConversion =
		projection.currentConversion ?? projection.currentTouch;
	const cards = [
		["First touch", touchLabel(projection.firstTouch)],
		["First conversion", touchLabel(projection.firstConversion)],
		["Current conversion", touchLabel(currentConversion)],
		["Pipeline entries", String(projection.pipelineEntryCount)],
	];
	return (
		<div className="flex flex-col gap-5">
			<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
				{cards.map(([label, value]) => (
					<div key={label} className="border p-3">
						<p className="text-muted-foreground text-xs">{label}</p>
						<p className="mt-1 font-medium text-sm">{value}</p>
					</div>
				))}
			</div>
			<div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
				<span>Conversions: {projection.conversionCount}</span>
				<span>Touches: {projection.touchCount}</span>
				<span>Sources: {projection.sourceHistory.join(", ") || "—"}</span>
				<span>Channels: {projection.channelHistory.join(", ") || "—"}</span>
			</div>
			<HistoryTable events={projection.events} />
		</div>
	);
}

function HistoryTable({ events }: { events: Projection["events"] }) {
	if (events.length === 0) {
		return (
			<Empty className="border">
				<EmptyHeader>
					<EmptyTitle>No attribution events</EmptyTitle>
					<EmptyDescription>
						The element has no recorded touch, conversion or pipeline entry yet.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Occurred</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Source</TableHead>
					<TableHead>Channel</TableHead>
					<TableHead>Pipeline</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{events.map((event) => (
					<TableRow key={`${event.origin}:${event.id}`}>
						<TableCell>{formatDate(event.occurredAt)}</TableCell>
						<TableCell>{event.conversionType}</TableCell>
						<TableCell>{event.source || "—"}</TableCell>
						<TableCell>{event.channel || "—"}</TableCell>
						<TableCell>{event.pipelineId || "—"}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function touchLabel(touch: Projection["firstTouch"]): string {
	if (!touch) return "—";
	return [touch.source || "Direct", touch.conversionType]
		.filter(Boolean)
		.join(" · ");
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}
