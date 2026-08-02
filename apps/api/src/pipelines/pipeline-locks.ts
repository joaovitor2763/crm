import type { Prisma } from "@crm/db";

const DEFAULT_PIPELINE_LOCK = "crm:default-pipeline";

export async function lockDefaultPipeline(tx: Prisma.TransactionClient) {
	await lock(tx, DEFAULT_PIPELINE_LOCK);
}

export async function lockPipelines(
	tx: Prisma.TransactionClient,
	pipelineIds: string[],
) {
	for (const pipelineId of [...new Set(pipelineIds)].sort()) {
		await lock(tx, `crm:pipeline:${pipelineId}`);
	}
}

async function lock(tx: Prisma.TransactionClient, key: string) {
	await tx.$queryRaw`SELECT 1::int AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
