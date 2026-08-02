import { ActivityType, type Db, type Prisma } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import type {
	ActivityCreateInput,
	MyTasksInput,
	TimelineFilter,
	TimelineInput,
} from "./activities.contracts";

const AUTHOR_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const ENTRY_SELECT = {
	id: true,
	type: true,
	subject: true,
	body: true,
	occurredAt: true,
	dueAt: true,
	completedAt: true,
	meta: true,
	createdAt: true,
	createdBy: { select: AUTHOR_SELECT },
	company: { select: { id: true, name: true } },
	contact: { select: { id: true, firstName: true, lastName: true } },
	deal: { select: { id: true, name: true } },
	marketingForm: { select: { id: true, name: true } },
	marketingEvent: { select: { id: true, name: true } },

	// Summaries only. An email body never rides on a list payload — the row
	// carries a snippet, and the accordion fetches `google.thread` on expand.
	emailThread: {
		select: {
			id: true,
			messageCount: true,
			lastMessageAt: true,
		},
	},
	calendarEvent: {
		select: {
			id: true,
			startsAt: true,
			endsAt: true,
			isAllDay: true,
			location: true,
			conferenceUrl: true,
			_count: { select: { attendees: true } },
		},
	},
} as const;

/** Entries a `NOTE`-ish filter should keep — what someone wrote down. */
const NOTE_TYPES = [
	ActivityType.NOTE,
	ActivityType.CALL,
	ActivityType.EMAIL,
	ActivityType.MEETING,
];

@Injectable()
export class ActivitiesService {
	private readonly logger = new Logger(ActivitiesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	/**
	 * A record's timeline, newest first, paged by cursor.
	 *
	 * Cursor rather than offset because entries are added at the top while
	 * someone is reading: page two of an offset query would repeat whatever the
	 * new entry pushed down.
	 */
	async timeline(input: TimelineInput, scope: Prisma.ActivityWhereInput = {}) {
		const where: Prisma.ActivityWhereInput = {
			AND: [this.anchor(input), scope],
		};
		Object.assign(where, filterClause(input.filter));

		const rows = await this.db.activity.findMany({
			where,
			// One more than asked for, so we know whether there is another page
			// without a second count query.
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			// By when it *happened*, not when the row was written. Those were the
			// same thing while a human logged everything by hand, and stopped being
			// the same thing the moment a sync started writing: a first sync stamps
			// every thread and meeting with roughly one `createdAt`, so ordering by
			// it would jumble a year of history into one arbitrary block. `id` breaks
			// ties so the cursor stays deterministic.
			orderBy: [
				{ occurredAt: { sort: "desc", nulls: "last" } },
				{ id: "desc" },
			],
			select: ENTRY_SELECT,
		});

		const hasMore = rows.length > input.limit;
		const entries = hasMore ? rows.slice(0, input.limit) : rows;

		return {
			entries: entries.map(serializeEntry),
			nextCursor: hasMore ? (entries[entries.length - 1]?.id ?? null) : null,
		};
	}

	/**
	 * Counts for the timeline's filter tabs, over the same anchor.
	 *
	 * Separate from `timeline` so paging does not re-count on every scroll.
	 */
	async timelineCounts(
		input: Pick<TimelineInput, "companyId" | "contactId" | "dealId">,
		scope: Prisma.ActivityWhereInput = {},
	) {
		const anchor: Prisma.ActivityWhereInput = {
			AND: [this.anchor(input), scope],
		};

		const [all, notes, upcoming, done, email, meetings] = await Promise.all([
			this.db.activity.count({ where: anchor }),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("notes") },
			}),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("upcoming") },
			}),
			this.db.activity.count({ where: { ...anchor, ...filterClause("done") } }),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("email") },
			}),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("meetings") },
			}),
		]);

		return { all, notes, upcoming, done, email, meetings };
	}

	async create(
		input: ActivityCreateInput,
		actingUserId: string,
		placement: { businessUnitId: string; teamId: string | null } = {
			businessUnitId: "business-unit-default",
			teamId: null,
		},
	) {
		await this.validateMarketingTarget(input);
		// A deal or contact activity is stamped with its company too, so a company
		// timeline is one indexed range scan instead of three joins.
		const companyId = await this.resolveCompanyId(input);

		const isTask = input.type === ActivityType.TASK;
		const meta = activityMeta(input);

		const activity = await this.db.activity.create({
			data: {
				type: input.type,
				subject: blankToNull(input.subject ?? ""),
				body: blankToNull(input.body ?? ""),
				// Every entry is stamped with where it belongs on the timeline,
				// tasks included.
				//
				// A task is scheduled rather than logged, so this used to be null for
				// them — and `orderBy` sorts nulls last, so every task sank beneath
				// the whole history and stayed there. The one you added a second ago
				// appeared at the bottom of today, under things from this morning.
				// `dueAt` is when it is *for*; this is when it was written down, which
				// is what a reverse-chronological list is ordered by.
				occurredAt: parseDate(input.occurredAt) ?? new Date(),
				dueAt: isTask ? parseDate(input.dueAt) : null,
				companyId,
				contactId: input.contactId ?? null,
				dealId: input.dealId ?? null,
				marketingFormId:
					input.type === ActivityType.FORM_CONVERSION
						? (input.marketingFormId ?? null)
						: null,
				marketingEventId:
					input.type === ActivityType.EVENT_ATTENDANCE
						? (input.marketingEventId ?? null)
						: null,
				createdById: actingUserId,
				businessUnitId: placement.businessUnitId,
				teamId: placement.teamId,
				meta: meta ?? undefined,
			},
			select: ENTRY_SELECT,
		});

		await this.stamp.touch(
			{ companyId, contactId: input.contactId, dealId: input.dealId },
			activity.createdAt,
		);

		this.logger.log({
			message: "Activity logged",
			activityId: activity.id,
			type: activity.type,
		});

		return serializeEntry(activity);
	}

	/** Ticks a task off, or puts it back. */
	async complete(
		id: string,
		completed: boolean,
		scope: Prisma.ActivityWhereInput = {},
	) {
		const activity = await this.db.activity.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true, type: true },
		});

		if (!activity) {
			throw new NotFoundException(`No activity with id ${id}.`);
		}

		if (activity.type !== ActivityType.TASK) {
			throw new BadRequestException("Only tasks can be completed.");
		}

		const updated = await this.db.activity.update({
			where: { id: activity.id },
			data: { completedAt: completed ? new Date() : null },
			select: ENTRY_SELECT,
		});

		return serializeEntry(updated);
	}

	/** Open tasks assigned to whoever is asking. */
	async myTasks(
		input: MyTasksInput,
		actingUserId: string,
		scope: Prisma.ActivityWhereInput = {},
	) {
		const now = new Date();
		const where: Prisma.ActivityWhereInput = {
			AND: [
				{
					type: ActivityType.TASK,
					completedAt: null,
					createdById: actingUserId,
				},
				scope,
			],
		};

		if (input.window === "overdue") where.dueAt = { lt: now };
		if (input.window === "upcoming") where.dueAt = { gte: now };

		const tasks = await this.db.activity.findMany({
			where,
			take: input.limit,
			// Undated tasks last: a task with no due date is a someday, and it
			// should not sit above something due this afternoon.
			orderBy: [
				{ dueAt: { sort: "asc", nulls: "last" } },
				{ createdAt: "desc" },
			],
			select: ENTRY_SELECT,
		});

		return tasks.map(serializeEntry);
	}

	async resolvePlacement(
		input: Pick<ActivityCreateInput, "companyId" | "contactId" | "dealId">,
		businessUnitIds: string[],
		defaultBusinessUnitId: string | null,
		defaultTeamId: string | null,
	): Promise<{ businessUnitId: string; teamId: string | null }> {
		if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { businessUnitId: true, teamId: true },
			});
			if (deal) return deal;
		}
		const state = input.contactId
			? await this.db.contactBusinessUnitState.findFirst({
					where: {
						contactId: input.contactId,
						businessUnitId: { in: businessUnitIds },
						archivedAt: null,
					},
					orderBy: { updatedAt: "desc" },
					select: { businessUnitId: true, teamId: true },
				})
			: input.companyId
				? await this.db.companyBusinessUnitState.findFirst({
						where: {
							companyId: input.companyId,
							businessUnitId: { in: businessUnitIds },
							archivedAt: null,
						},
						orderBy: { updatedAt: "desc" },
						select: { businessUnitId: true, teamId: true },
					})
				: null;
		if (state) return state;
		if (!defaultBusinessUnitId) {
			throw new BadRequestException("An activity needs a business unit.");
		}
		return {
			businessUnitId: defaultBusinessUnitId,
			teamId: defaultTeamId,
		};
	}

	/** Exactly one of company/contact/deal, as the contract promises. */
	private anchor(
		input: Pick<TimelineInput, "companyId" | "contactId" | "dealId">,
	): Prisma.ActivityWhereInput {
		if (input.dealId) return { dealId: input.dealId };
		if (input.contactId) return { contactId: input.contactId };
		if (input.companyId) return { companyId: input.companyId };
		throw new BadRequestException(
			"A timeline needs a company, a contact or a deal.",
		);
	}

	/**
	 * The company an activity belongs to.
	 *
	 * Taken from the deal or contact when the caller did not say, which is what
	 * makes the company timeline work without joins. A contact with no company
	 * simply has no company stamp.
	 */
	private async resolveCompanyId(
		input: ActivityCreateInput,
	): Promise<string | null> {
		if (input.companyId) return input.companyId;

		if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { companyId: true },
			});
			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			}
			return deal.companyId;
		}

		if (input.contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: input.contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${input.contactId}.`);
			}
			return contact.companyId;
		}

		return null;
	}

	private async validateMarketingTarget(input: ActivityCreateInput) {
		if (input.marketingFormId && input.type !== ActivityType.FORM_CONVERSION) {
			throw new BadRequestException(
				"A form can only be linked to a form conversion.",
			);
		}
		if (
			input.marketingEventId &&
			input.type !== ActivityType.EVENT_ATTENDANCE
		) {
			throw new BadRequestException(
				"An event can only be linked to event attendance.",
			);
		}
		if (input.type === ActivityType.FORM_CONVERSION) {
			if (!input.marketingFormId)
				throw new BadRequestException("Choose an active marketing form.");
			const form = await this.db.marketingForm.findFirst({
				where: { id: input.marketingFormId, archivedAt: null },
				select: { id: true },
			});
			if (!form)
				throw new BadRequestException("That marketing form is not active.");
		}
		if (input.type === ActivityType.EVENT_ATTENDANCE) {
			if (!input.marketingEventId)
				throw new BadRequestException("Choose an active marketing event.");
			const event = await this.db.marketingEvent.findFirst({
				where: { id: input.marketingEventId, archivedAt: null },
				select: { id: true },
			});
			if (!event)
				throw new BadRequestException("That marketing event is not active.");
		}
	}
}

function filterClause(filter: TimelineFilter): Prisma.ActivityWhereInput {
	switch (filter) {
		case "notes":
			return { type: { in: NOTE_TYPES } };
		case "upcoming":
			// Everything still outstanding, overdue included — "upcoming" on a
			// timeline means "not done yet", and hiding the overdue ones is how
			// they get forgotten.
			return { type: ActivityType.TASK, completedAt: null };
		case "done":
			return { type: ActivityType.TASK, completedAt: { not: null } };
		case "history":
			return { NOT: { type: ActivityType.TASK, completedAt: null } };
		// Both cover what a rep logged by hand *and* what the Google sync
		// projected — from the timeline's point of view they are the same event,
		// and splitting them would make "did we email them?" two questions.
		case "email":
			return { type: ActivityType.EMAIL };
		case "meetings":
			return { type: ActivityType.MEETING };
		case "all":
			return {};
	}
}

type Entry = Prisma.ActivityGetPayload<{ select: typeof ENTRY_SELECT }>;

/** Dates as ISO strings so they survive JSON, and `meta` narrowed for the UI. */
function serializeEntry(entry: Entry) {
	return {
		...entry,
		occurredAt: entry.occurredAt?.toISOString() ?? null,
		dueAt: entry.dueAt?.toISOString() ?? null,
		completedAt: entry.completedAt?.toISOString() ?? null,
		createdAt: entry.createdAt.toISOString(),
		meta: entry.meta as Record<string, unknown> | null,

		emailThread: entry.emailThread
			? {
					id: entry.emailThread.id,
					messageCount: entry.emailThread.messageCount,
					lastMessageAt: entry.emailThread.lastMessageAt.toISOString(),
				}
			: null,

		calendarEvent: entry.calendarEvent
			? {
					id: entry.calendarEvent.id,
					startsAt: entry.calendarEvent.startsAt.toISOString(),
					endsAt: entry.calendarEvent.endsAt.toISOString(),
					isAllDay: entry.calendarEvent.isAllDay,
					location: entry.calendarEvent.location,
					conferenceUrl: entry.calendarEvent.conferenceUrl,
					attendeeCount: entry.calendarEvent._count.attendees,
				}
			: null,
	};
}

function activityMeta(
	input: ActivityCreateInput,
): Record<string, string> | null {
	if (input.type === ActivityType.MESSAGE && input.messageChannel) {
		return { channel: input.messageChannel };
	}
	if (
		input.type === ActivityType.FORM_CONVERSION ||
		input.type === ActivityType.EVENT_ATTENDANCE
	) {
		const attribution = {
			utmSource: input.utmSource?.trim(),
			utmMedium: input.utmMedium?.trim(),
			utmCampaign: input.utmCampaign?.trim(),
			utmTerm: input.utmTerm?.trim(),
			utmContent: input.utmContent?.trim(),
		};
		const present = Object.entries(attribution).filter(
			(entry): entry is [string, string] => Boolean(entry[1]),
		);
		return present.length > 0 ? Object.fromEntries(present) : null;
	}
	return null;
}

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
