import { ActivityType } from "@crm/db";
import { z } from "zod";

/** Types a human can log. `STAGE_CHANGE` and `ENRICHMENT` are written by the
 * system and the agent, and are not offered in the composer. */
const COMPOSABLE_TYPES = [
	ActivityType.NOTE,
	ActivityType.CALL,
	ActivityType.EMAIL,
	ActivityType.MEETING,
	ActivityType.TASK,
	ActivityType.MESSAGE,
	ActivityType.FORM_CONVERSION,
	ActivityType.EVENT_ATTENDANCE,
] as const;

const composableEnum = z.enum(COMPOSABLE_TYPES);

/**
 * Which slice of a timeline to show.
 *
 * `history` is `all` minus the tasks that are still outstanding: the timeline
 * pins those at the top, and an entry that appears both pinned and in the
 * history below it reads as two different things having happened.
 */
const TIMELINE_FILTERS = [
	"all",
	"history",
	"notes",
	"upcoming",
	"done",
	/** Synced Gmail threads and logged emails. */
	"email",
	/** Synced calendar events and logged meetings. */
	"meetings",
] as const;

export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

/**
 * Exactly one anchor. A timeline is always "everything about this thing", and
 * a company's timeline picks up its deals' and contacts' entries for free
 * because `companyId` is stamped on write.
 */
export const timelineInput = z.object({
	companyId: z.string().optional(),
	contactId: z.string().optional(),
	dealId: z.string().optional(),
	filter: z.enum(TIMELINE_FILTERS).default("all"),
	/** Activity id to continue after — timelines page by cursor, not by offset,
	 * because new entries arrive at the top while you are reading. */
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(30),
});

export type TimelineInput = z.infer<typeof timelineInput>;

/** The same anchor, without the paging — for the filter tab counts. */
export const timelineCountsInput = z.object({
	companyId: z.string().optional(),
	contactId: z.string().optional(),
	dealId: z.string().optional(),
});

export const activityCreateInput = z
	.object({
		type: composableEnum,
		subject: z.string().trim().optional(),
		body: z.string().trim().optional(),
		/** ISO-8601. When it happened, for something being logged after the fact. */
		occurredAt: z.string().optional(),
		/** ISO-8601. When it is due, for a task. */
		dueAt: z.string().nullable().optional(),
		companyId: z.string().optional(),
		contactId: z.string().optional(),
		dealId: z.string().optional(),
		messageChannel: z.enum(["SMS", "WHATSAPP"]).optional(),
		marketingFormId: z.string().optional(),
		marketingEventId: z.string().optional(),
		utmSource: z.string().trim().optional(),
		utmMedium: z.string().trim().optional(),
		utmCampaign: z.string().trim().optional(),
		utmTerm: z.string().trim().optional(),
		utmContent: z.string().trim().optional(),
	})
	.refine((input) => input.companyId || input.contactId || input.dealId, {
		message: "An activity has to be about a company, a contact or a deal.",
	})
	.refine(
		(input) => input.type !== ActivityType.TASK || Boolean(input.subject),
		{
			message: "A task needs a subject — it is the thing to do.",
			path: ["subject"],
		},
	)
	.refine(
		(input) =>
			input.type !== ActivityType.MESSAGE || Boolean(input.messageChannel),
		{
			message: "Choose SMS or WhatsApp for a message.",
			path: ["messageChannel"],
		},
	)
	.refine(
		(input) =>
			input.type !== ActivityType.FORM_CONVERSION ||
			Boolean(input.marketingFormId),
		{
			message: "Choose the form that converted.",
			path: ["marketingFormId"],
		},
	)
	.refine(
		(input) =>
			input.type !== ActivityType.EVENT_ATTENDANCE ||
			Boolean(input.marketingEventId),
		{
			message: "Choose the event that was attended.",
			path: ["marketingEventId"],
		},
	)
	.refine(
		(input) =>
			!input.marketingFormId || input.type === ActivityType.FORM_CONVERSION,
		{
			message: "A form can only be linked to a form conversion.",
			path: ["marketingFormId"],
		},
	)
	.refine(
		(input) =>
			!input.marketingEventId || input.type === ActivityType.EVENT_ATTENDANCE,
		{
			message: "An event can only be linked to event attendance.",
			path: ["marketingEventId"],
		},
	)
	.refine(
		(input) =>
			!hasAttribution(input) ||
			input.type === ActivityType.FORM_CONVERSION ||
			input.type === ActivityType.EVENT_ATTENDANCE,
		{
			message:
				"UTM attribution is only available for form conversions and event attendance.",
			path: ["utmSource"],
		},
	);

export type ActivityCreateInput = z.infer<typeof activityCreateInput>;

function hasAttribution(input: {
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	utmTerm?: string;
	utmContent?: string;
}) {
	return Boolean(
		input.utmSource ||
			input.utmMedium ||
			input.utmCampaign ||
			input.utmTerm ||
			input.utmContent,
	);
}

export const completeInput = z.object({
	id: z.string(),
	/** `false` reopens a task that was ticked off by mistake. */
	completed: z.boolean().default(true),
});

export const myTasksInput = z.object({
	/** `"overdue"`, `"upcoming"`, or `"all"` open tasks. */
	window: z.enum(["overdue", "upcoming", "all"]).default("all"),
	limit: z.number().int().min(1).max(100).default(25),
});

export type MyTasksInput = z.infer<typeof myTasksInput>;
