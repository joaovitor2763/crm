import { db, type Prisma } from "@crm/db";
import type { AgentAccess } from "./access";

export type RevenueAnalyticsInput = {
	from?: string;
	to?: string;
	pipelineId?: string;
	ownerId?: string;
	limit?: number;
};

export async function readRevenueAnalytics(
	access: AgentAccess,
	input: RevenueAnalyticsInput,
) {
	const to = input.to ? new Date(input.to) : new Date();
	const from = input.from
		? new Date(input.from)
		: new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
	const scope: Prisma.DealWhereInput = {
		AND: [
			access.dealWhere,
			{ archivedAt: null, createdAt: { lte: to } },
			{ OR: [{ closedAt: null }, { closedAt: { gte: from } }] },
			input.pipelineId ? { pipelineId: input.pipelineId } : {},
			input.ownerId ? { ownerId: input.ownerId } : {},
		],
	};
	const deals = await db.deal.findMany({
		where: scope,
		select: {
			id: true,
			ownerId: true,
			pipelineId: true,
			stageId: true,
			stage: { select: { id: true, name: true, type: true, position: true } },
			pipeline: { select: { id: true, name: true, funnelType: true } },
			owner: { select: { id: true, name: true, email: true } },
			amount: true,
			createdAt: true,
			closedAt: true,
		},
		orderBy: { createdAt: "asc" },
		take: Math.min(input.limit ?? 250, 5000),
	});
	const stageRows = groupBy(
		deals,
		(deal) => `${deal.pipelineId}:${deal.stageId}`,
	);
	const ownerRows = groupBy(deals, (deal) => deal.ownerId);
	const won = deals.filter((deal) => deal.stage.type === "WON");
	const closed = deals.filter(
		(deal) => deal.stage.type === "WON" || deal.stage.type === "LOST",
	);
	return {
		window: { from: from.toISOString(), to: to.toISOString() },
		counts: {
			deals: deals.length,
			won: won.length,
			closed: closed.length,
			conversionRate: closed.length ? won.length / closed.length : null,
		},
		funnel: [...stageRows.entries()].map(([key, rows]) => ({
			key,
			pipeline: rows[0]?.pipeline,
			stage: rows[0]?.stage,
			count: rows.length,
			amount: sumAmount(rows),
		})),
		byOwner: [...ownerRows.entries()].map(([ownerId, rows]) => ({
			owner: rows[0]?.owner,
			ownerId,
			count: rows.length,
			won: rows.filter((deal) => deal.stage.type === "WON").length,
			amount: sumAmount(rows),
		})),
		chartCdn: {
			type: "bar" as const,
			data: {
				labels: [...stageRows.keys()],
				datasets: [
					{
						label: "Deals",
						data: [...stageRows.values()].map((rows) => rows.length),
					},
				],
			},
		},
	};
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const group = groups.get(key(row)) ?? [];
		group.push(row);
		groups.set(key(row), group);
	}
	return groups;
}

function sumAmount(rows: Array<{ amount: unknown }>) {
	return rows.reduce(
		(total, row) => total + (row.amount ? Number(row.amount) : 0),
		0,
	);
}
