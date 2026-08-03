"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
// The shadcn calendar, aliased so it does not collide with the Carbon glyph on
// the button that opens it.
import { Calendar as DayPicker } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { ActivityIcon, activityLabel } from "./activity-icon";
import type { TimelineAnchor } from "./timeline";

/** Only what a person can log. Stage changes and enrichment write themselves,
 * and the API's create input refuses the other two for the same reason. */
const TYPES = [
	"NOTE",
	"CALL",
	"EMAIL",
	"MEETING",
	"TASK",
	"MESSAGE",
	"FORM_CONVERSION",
	"EVENT_ATTENDANCE",
] as const;

type ComposableType = (typeof TYPES)[number];

const dueFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

const PLACEHOLDER: Record<ComposableType, string> = {
	NOTE: "Log a note, call, email, meeting or task…",
	CALL: "What came out of the call?",
	EMAIL: "What was said?",
	MEETING: "What came out of the meeting?",
	TASK: "What needs doing?",
	MESSAGE: "What was sent or received?",
	FORM_CONVERSION: "What did this conversion tell us?",
	EVENT_ATTENDANCE: "What happened at the event?",
};

/**
 * Logging what just happened: one box, and a toolbar inside it.
 *
 * Two rewrites got here, and both of the things it replaced are worth naming.
 *
 * It began as a button that swapped itself for a form — so reading the timeline
 * cost a click, and the state you were left in *after* logging one note was the
 * state that pushed the history off the fold. Then it lost the mode but kept
 * the shape: a bordered textarea, a bordered row of five type buttons, and a
 * bordered row of six filters underneath, three stacked bands of outlined boxes
 * for a panel whose actual job is to be read.
 *
 * This is one bordered element. The type toggles live *inside* the box, under a
 * rule, the way a formatting toolbar does — which is also what stops them
 * reading as a second copy of the filter row directly below, since that one is
 * borderless and outside. The submit button is always there and always in the
 * same place; nothing appears or disappears as you type, so nothing jumps.
 *
 * **There is no subject field.** It was optional on three types, load-bearing
 * on one, and the source of most of the branching in here — the old form asked
 * a different question per type and then disagreed with itself about which
 * answer made the button live. The box you type in is the entry: a task's title
 * or everything else's body. A logged call with no title reads "Call" on the
 * timeline, which is true, and the note under it is the part anyone reads.
 *
 * The draft stays in `useState`, which is the one piece of this panel that
 * belongs there — `record-stack` keeps the rest in the URL, and a half-written
 * note about a customer has no business in browser history.
 */
export function ActivityComposer({ anchor }: { anchor: TimelineAnchor }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [type, setType] = useState<ComposableType>("NOTE");
	const [draft, setDraft] = useState("");
	const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
	const [messageChannel, setMessageChannel] = useState<"SMS" | "WHATSAPP">(
		"WHATSAPP",
	);
	const [marketingFormId, setMarketingFormId] = useState("");
	const [marketingEventId, setMarketingEventId] = useState("");
	const [attribution, setAttribution] = useState({
		source: "",
		medium: "",
		campaign: "",
		term: "",
		content: "",
	});
	const forms = useQuery(
		trpc.marketing.forms.queryOptions({ includeArchived: false }),
	);
	const events = useQuery(
		trpc.marketing.events.queryOptions({ includeArchived: false }),
	);

	const isTask = type === "TASK";
	const isMarketingActivity =
		type === "FORM_CONVERSION" || type === "EVENT_ATTENDANCE";
	const text = draft.trim();
	const hasTypeContext =
		(type !== "FORM_CONVERSION" || marketingFormId !== "") &&
		(type !== "EVENT_ATTENDANCE" || marketingEventId !== "");
	const canSubmit = text !== "" && hasTypeContext;

	const reset = () => {
		setDraft("");
		setDueAt(undefined);
		setMarketingFormId("");
		setMarketingEventId("");
		setAttribution({
			source: "",
			medium: "",
			campaign: "",
			term: "",
			content: "",
		});
	};

	const create = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
				reset();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = () => {
		if (!canSubmit || create.isPending) return;
		create.mutate({
			...anchor,
			type,
			body: isTask ? undefined : text,
			dueAt: isTask ? (dueAt?.toISOString() ?? null) : undefined,
			messageChannel: type === "MESSAGE" ? messageChannel : undefined,
			marketingFormId: type === "FORM_CONVERSION" ? marketingFormId : undefined,
			marketingEventId:
				type === "EVENT_ATTENDANCE" ? marketingEventId : undefined,
			utmSource: isMarketingActivity
				? attribution.source || undefined
				: undefined,
			utmMedium: isMarketingActivity
				? attribution.medium || undefined
				: undefined,
			utmCampaign: isMarketingActivity
				? attribution.campaign || undefined
				: undefined,
			utmTerm: isMarketingActivity ? attribution.term || undefined : undefined,
			utmContent: isMarketingActivity
				? attribution.content || undefined
				: undefined,
			subject:
				type === "FORM_CONVERSION"
					? forms.data?.find((form) => form.id === marketingFormId)?.name
					: type === "EVENT_ATTENDANCE"
						? events.data?.find((item) => item.id === marketingEventId)?.name
						: isTask
							? text
							: type === "MESSAGE"
								? `${messageChannel === "WHATSAPP" ? "WhatsApp" : "SMS"} message`
								: undefined,
		});
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<InputGroup>
				<InputGroupTextarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={PLACEHOLDER[type]}
					aria-label={PLACEHOLDER[type]}
					onKeyDown={(event) => {
						// Plain Enter has to stay a newline — this is where a three
						// paragraph call note goes.
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
						if (event.key === "Escape") reset();
					}}
				/>

				<InputGroupAddon align="block-end" className="gap-2 border-t">
					{/*
					 * Borderless and inside the box. The filter row below is the same
					 * control with the same shape, and the only reason the two do not
					 * read as one confused pair of duplicates is that this one sits
					 * under a rule inside a bordered container and that one does not.
					 */}
					<ToggleGroup
						type="single"
						value={type}
						onValueChange={(next) => next && setType(next as ComposableType)}
						size="sm"
						spacing={0}
						className="no-scrollbar hidden max-w-full overflow-x-auto sm:flex"
					>
						{TYPES.map((option) => (
							<ToggleGroupItem
								key={option}
								value={option}
								aria-label={activityLabel(option)}
							>
								<ActivityIcon type={option} />
								{activityLabel(option)}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<Select
						value={type}
						onValueChange={(next) => setType(next as ComposableType)}
					>
						<SelectTrigger
							size="sm"
							className="sm:hidden"
							aria-label="Activity type"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TYPES.map((option) => (
								<SelectItem key={option} value={option}>
									{activityLabel(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{/*
					 * A task is the one thing here with a future, so it is the one
					 * thing that gets a date — and it gets a real calendar rather than
					 * `<input type="date">`, whose picker is drawn by the browser and
					 * knows nothing about any of these tokens.
					 */}
					{isTask ? (
						<Popover>
							<PopoverTrigger asChild>
								<InputGroupButton variant="ghost" size="xs">
									<Icon icon={Calendar} data-icon="inline-start" />
									{dueAt ? dueFormat.format(dueAt) : "Due date"}
								</InputGroupButton>
							</PopoverTrigger>
							<PopoverContent size="fit" align="start">
								<DayPicker
									mode="single"
									selected={dueAt}
									onSelect={setDueAt}
									autoFocus
								/>
							</PopoverContent>
						</Popover>
					) : null}

					{type === "MESSAGE" ? (
						<Select
							value={messageChannel}
							onValueChange={(value) =>
								setMessageChannel(value as "SMS" | "WHATSAPP")
							}
						>
							<SelectTrigger size="sm" aria-label="Message channel">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="WHATSAPP">WhatsApp</SelectItem>
								<SelectItem value="SMS">SMS</SelectItem>
							</SelectContent>
						</Select>
					) : null}

					{type === "FORM_CONVERSION" ? (
						<Select value={marketingFormId} onValueChange={setMarketingFormId}>
							<SelectTrigger size="sm" aria-label="Marketing form">
								<SelectValue placeholder="Choose form" />
							</SelectTrigger>
							<SelectContent>
								{(forms.data ?? []).map((form) => (
									<SelectItem key={form.id} value={form.id}>
										{form.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}

					{type === "EVENT_ATTENDANCE" ? (
						<Select
							value={marketingEventId}
							onValueChange={setMarketingEventId}
						>
							<SelectTrigger size="sm" aria-label="Marketing event">
								<SelectValue placeholder="Choose event" />
							</SelectTrigger>
							<SelectContent>
								{(events.data ?? []).map((item) => (
									<SelectItem key={item.id} value={item.id}>
										{item.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}

					<InputGroupButton
						type="submit"
						variant={canSubmit ? "default" : "ghost"}
						size="xs"
						className="ml-auto"
						disabled={create.isPending || !canSubmit}
					>
						{create.isPending ? <Spinner /> : null}
						{isTask ? "Add task" : `Log ${activityLabel(type).toLowerCase()}`}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			{isMarketingActivity ? (
				<div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
					{(
						[
							["source", "UTM source"],
							["medium", "UTM medium"],
							["campaign", "UTM campaign"],
							["term", "UTM term"],
							["content", "UTM content"],
						] as const
					).map(([field, placeholder]) => (
						<Input
							key={field}
							value={attribution[field]}
							onChange={(event) =>
								setAttribution((current) => ({
									...current,
									[field]: event.target.value,
								}))
							}
							placeholder={placeholder}
							aria-label={placeholder}
						/>
					))}
				</div>
			) : null}
		</form>
	);
}
