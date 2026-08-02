import type { Db, Prisma } from "@crm/db";

export async function loadAccountConfiguration(
	client: Db | Prisma.TransactionClient,
) {
	const config = await client.revenueAccountConfig.findUnique({
		where: { id: "revenue-account-config" },
		include: { relationPolicies: { orderBy: { targetKind: "asc" } } },
	});
	return (
		config ?? {
			id: "revenue-account-config",
			enabled: false,
			mergePolicy: {},
			relationPolicies: [],
		}
	);
}
