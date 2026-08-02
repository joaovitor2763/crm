import { ActivityType, type Db, PipelineStageType, type Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import type { DashboardSummaryInput } from "./dashboard.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

/** Months in the trend chart, the current one included. */
const TREND_MONTHS = 6;

/**
 * Window behind the rolling rates — win rate, average deal size, cycle time.
 *
 * A quarter is long enough that one good week does not swing it and short
 * enough that it still describes how the rep is selling now.
 */
const RATE_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Feb". The chart has room for three letters, not "February". */
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short" });

/** Local month boundary, `offset` months from the one `from` falls in. */
function monthStart(from: Date, offset: number): Date {
	return new Date(from.getFullYear(), from.getMonth() + offset, 1);
}

/** Months since year zero — subtract two to get a bucket index. */
function monthKey(date: Date): number {
	return date.getFullYear() * 12 + date.getMonth();
}

@Injectable()
export class DashboardService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * How the rep is doing: what they have closed, what is still open, the rates
	 * that describe how they sell, and what needs attention today.
	 *
	 * The open pipeline spans all history, so it is aggregated in Postgres — the
	 * alternative is a page that gets slower every quarter. Everything derived
	 * from closed and newly created deals comes off one bounded read of the last
	 * six months and is folded up here: that window does not grow with history,
	 * it is a single index scan instead of a dozen aggregates, and it keeps the
	 * KPI strip and the chart underneath it on exactly the same month boundaries
	 * rather than letting SQL's idea of a month drift from JavaScript's.
	 */
	async summary(
		actingUserId: string,
		input: DashboardSummaryInput,
		dealScope: Prisma.DealWhereInput = {},
		activityScope: Prisma.ActivityWhereInput = {},
	) {
		const mine = input.scope === "me";
		const owned: Prisma.DealWhereInput = mine ? { ownerId: actingUserId } : {};
		const dealsWhere: Prisma.DealWhereInput = { AND: [owned, dealScope] };

		const now = new Date();
		const startOfMonth = monthStart(now, 0);
		const startOfNextMonth = monthStart(now, 1);
		const startOfPrevMonth = monthStart(now, -1);
		const trendStart = monthStart(now, -(TREND_MONTHS - 1));
		const rateStart = new Date(now.getTime() - RATE_WINDOW_DAYS * DAY_MS);

		const [
			openByStage,
			recentDeals,
			closingThisMonthTotals,
			biggestOpen,
			overdueTasks,
			recentActivity,
		] = await Promise.all([
			this.db.deal.groupBy({
				by: ["stageId"],
				where: {
					AND: [dealsWhere, { archivedAt: null, stage: { type: "OPEN" } }],
				},
				_count: { _all: true },
				_sum: { amount: true },
			}),
			// One read covers the trend chart, this month vs. last, and the
			// 90-day rates. `amount` is the only wide column and there are four
			// of them, so this stays cheap even for a busy team.
			this.db.deal.findMany({
				where: {
					AND: [
						dealsWhere,
						{ archivedAt: null },
						{
							OR: [
								{ createdAt: { gte: trendStart } },
								{ closedAt: { gte: trendStart } },
							],
						},
					],
				},
				select: {
					amount: true,
					stage: {
						select: { id: true, name: true, type: true, position: true },
					},
					createdAt: true,
					closedAt: true,
				},
			}),
			// A count and a sum, not rows: the KPI strip quotes "due this month"
			// as one figure, and no list on the page shows the deals behind it.
			this.db.deal.aggregate({
				where: {
					AND: [
						dealsWhere,
						{
							archivedAt: null,
							stage: { type: "OPEN" },
							expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth },
						},
					],
				},
				_count: { _all: true },
				_sum: { amount: true },
			}),
			this.db.deal.findMany({
				where: {
					AND: [dealsWhere, { archivedAt: null, stage: { type: "OPEN" } }],
				},
				orderBy: [
					{ amount: { sort: "desc", nulls: "last" } },
					{ expectedCloseDate: "asc" },
				],
				take: 6,
				select: {
					id: true,
					name: true,
					stage: {
						select: { id: true, name: true, type: true, position: true },
					},
					amount: true,
					currency: true,
					expectedCloseDate: true,
					stageChangedAt: true,
					company: { select: { id: true, name: true, iconUrl: true } },
					owner: { select: OWNER_SELECT },
				},
			}),
			// Always the acting user's, in either scope: nobody else's tasks are
			// theirs to tick off.
			this.db.activity.findMany({
				where: {
					AND: [
						{
							type: ActivityType.TASK,
							completedAt: null,
							dueAt: { lt: now },
							createdById: actingUserId,
						},
						activityScope,
					],
				},
				orderBy: [{ dueAt: "asc" }],
				take: 10,
				select: {
					id: true,
					subject: true,
					dueAt: true,
					company: { select: { id: true, name: true } },
					deal: { select: { id: true, name: true } },
				},
			}),
			this.db.activity.findMany({
				where: {
					AND: [mine ? { createdById: actingUserId } : {}, activityScope],
				},
				orderBy: [{ createdAt: "desc" }],
				take: 12,
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					createdAt: true,
					meta: true,
					createdBy: { select: OWNER_SELECT },
					company: { select: { id: true, name: true } },
					deal: { select: { id: true, name: true } },
				},
			}),
		]);

		const openStageRecords = await this.db.pipelineStage.findMany({
			where: { type: "OPEN", pipeline: { archivedAt: null } },
			orderBy: [{ pipeline: { isDefault: "desc" } }, { position: "asc" }],
			select: { id: true, name: true, type: true, position: true },
		});
		const stages = openStageRecords.map((stage) => {
			const group = openByStage.find((row) => row.stageId === stage.id);
			return {
				stage,
				count: group?._count._all ?? 0,
				valueCents: toCents(group?._sum.amount ?? null) ?? 0,
			};
		});

		const firstBucket = monthKey(trendStart);
		const trend = Array.from({ length: TREND_MONTHS }, (_, index) => ({
			month: MONTH_LABEL.format(monthStart(trendStart, index)),
			won: 0,
			created: 0,
		}));

		const wonThisMonth = { count: 0, valueCents: 0 };
		const wonPrevMonth = { count: 0, valueCents: 0 };
		let wins = 0;
		let losses = 0;
		let wonCents = 0;
		let cycleDays = 0;

		for (const deal of recentDeals) {
			const cents = toCents(deal.amount) ?? 0;

			// A deal closed inside the window but opened before it lands in no
			// created bucket — the index is negative, and the lookup misses.
			const created = trend[monthKey(deal.createdAt) - firstBucket];
			if (created) created.created += cents;

			const { closedAt, stage } = deal;
			if (!closedAt) continue;
			const won = stage.type === PipelineStageType.WON;

			if (won) {
				const closed = trend[monthKey(closedAt) - firstBucket];
				if (closed) closed.won += cents;

				if (closedAt >= startOfMonth && closedAt < startOfNextMonth) {
					wonThisMonth.count += 1;
					wonThisMonth.valueCents += cents;
				} else if (closedAt >= startOfPrevMonth && closedAt < startOfMonth) {
					wonPrevMonth.count += 1;
					wonPrevMonth.valueCents += cents;
				}
			}

			if (closedAt < rateStart) continue;
			if (won) {
				wins += 1;
				wonCents += cents;
				cycleDays += (closedAt.getTime() - deal.createdAt.getTime()) / DAY_MS;
			} else if (stage.type === PipelineStageType.LOST) {
				// Disqualified deals are deliberately neither: they never reached a
				// decision, so counting them would turn the win rate into a
				// measure of lead quality.
				losses += 1;
			}
		}

		const decided = wins + losses;

		return {
			scope: input.scope,
			pipeline: {
				stages,
				totalCents: stages.reduce((total, s) => total + s.valueCents, 0),
				totalDeals: stages.reduce((total, s) => total + s.count, 0),
			},
			wonThisMonth,
			wonPrevMonth,
			/** Rolling rates over `windowDays`. `null` where nothing has closed. */
			performance: {
				windowDays: RATE_WINDOW_DAYS,
				wins,
				losses,
				winRate: decided === 0 ? null : wins / decided,
				avgDealCents: wins === 0 ? null : Math.round(wonCents / wins),
				avgCycleDays: wins === 0 ? null : Math.round(cycleDays / wins),
			},
			/** Six months of closed-won value against new pipeline created. */
			trend,
			closingThisMonthTotal: {
				count: closingThisMonthTotals._count._all,
				valueCents: toCents(closingThisMonthTotals._sum.amount) ?? 0,
			},
			biggestOpen: biggestOpen.map(
				({ amount, expectedCloseDate, stageChangedAt, ...deal }) => ({
					...deal,
					amountCents: toCents(amount),
					expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
					stageChangedAt: stageChangedAt.toISOString(),
				}),
			),
			overdueTasks: overdueTasks.map(({ dueAt, ...task }) => ({
				...task,
				dueAt: dueAt?.toISOString() ?? null,
			})),
			recentActivity: recentActivity.map(({ createdAt, meta, ...entry }) => ({
				...entry,
				createdAt: createdAt.toISOString(),
				meta: meta as Record<string, unknown> | null,
			})),
		};
	}
}
