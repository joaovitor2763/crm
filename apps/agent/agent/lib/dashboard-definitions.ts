import { DashboardDefinitionStatus, db, type Prisma } from "@crm/db";
import type { AgentAccess } from "./access";

export async function readDashboardDefinitions(
	access: AgentAccess,
	input: {
		status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
		key?: string;
		includeVersions: boolean;
	},
) {
	const scope: Prisma.DashboardDefinitionWhereInput =
		access.isSystem || access.isAdmin
			? {}
			: {
					OR: [
						{ businessUnitId: null },
						{
							businessUnitId: {
								in: Array.from(
									access.businessUnitTreeIds ?? access.businessUnitIds ?? [],
								),
							},
						},
					],
				};
	const rows = await db.dashboardDefinition.findMany({
		where: {
			AND: [
				scope,
				input.status
					? { status: input.status as DashboardDefinitionStatus }
					: { status: { not: DashboardDefinitionStatus.ARCHIVED } },
				input.key ? { key: input.key } : {},
			],
		},
		orderBy: [{ key: "asc" }, { version: "desc" }],
	});
	const selected = input.includeVersions ? rows : latest(rows);
	return selected.map((row) => ({
		id: row.id,
		key: row.key,
		name: row.name,
		description: row.description,
		version: row.version,
		status: row.status,
		businessUnitId: row.businessUnitId,
		spec: row.spec,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		publishedAt: row.publishedAt?.toISOString() ?? null,
	}));
}

function latest<T extends { key: string; version: number }>(rows: T[]) {
	const seen = new Set<string>();
	return rows.filter((row) => {
		if (seen.has(row.key)) return false;
		seen.add(row.key);
		return true;
	});
}
