import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

/** The records one activity can belong to. All three are stamped. */
export type ActivityTarget = {
	companyId?: string | null;
	contactId?: string | null;
	dealId?: string | null;
};

/**
 * Keeps `lastActivityAt` current on companies, contacts and deals.
 *
 * The column is denormalised because it is a **sortable** column on every list,
 * and ordering by `max(activity.createdAt)` is an aggregate over a relation that
 * Prisma cannot express — the alternative is a correlated subquery per row,
 * which would be the slowest thing on the page.
 *
 * Denormalised means it can drift, so every activity write goes through here
 * rather than each caller remembering to update three tables. There are five
 * places that write activities (the composer, stage changes, the research
 * agent, and both Google syncs); the fan-out belongs to the shape of the data,
 * not to whichever feature happened to trigger it. **A new activity writer adds
 * a `touch()` call here, not its own update.**
 *
 * Stamped with the activity's `createdAt`, not `occurredAt`: a meeting booked
 * for next month must not make a company look like it was active in the future.
 * That also matches the lateral join this replaced.
 */
@Injectable()
export class ActivityStampService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * Raises `lastActivityAt` to `at` wherever it is currently older or unset.
	 *
	 * A conditional update rather than a read-then-write: two syncs stamping the
	 * same company concurrently would otherwise race, and the older one could
	 * win. Guarding in the `where` makes the operation idempotent and
	 * order-independent, so replaying a window cannot move the value backwards.
	 */
	async touch(target: ActivityTarget, at: Date): Promise<void> {
		const stale = {
			OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }],
		};

		// The pg adapter uses one client for this service. Concurrent `query()` calls
		// on that client are deprecated in pg 8 and will fail in pg 9, so keep this
		// tiny fan-out sequential rather than wrapping it in `Promise.all`.
		if (target.companyId) {
			await this.db.company.updateMany({
				where: { id: target.companyId, ...stale },
				data: { lastActivityAt: at },
			});
		}
		if (target.contactId) {
			await this.db.contact.updateMany({
				where: { id: target.contactId, ...stale },
				data: { lastActivityAt: at },
			});
		}
		if (target.dealId) {
			await this.db.deal.updateMany({
				where: { id: target.dealId, ...stale },
				data: { lastActivityAt: at },
			});
		}
	}

	/**
	 * Recomputes from the activity table.
	 *
	 * For deletes, where the value can only go *down* and `touch` — which never
	 * lowers it — cannot help. Purging a mailbox is the case that needs it:
	 * without this a company keeps claiming activity whose rows are gone.
	 */
	async recompute(target: ActivityTarget): Promise<void> {
		if (target.companyId) {
			const { _max } = await this.db.activity.aggregate({
				where: { companyId: target.companyId },
				_max: { createdAt: true },
			});
			await this.db.company.update({
				where: { id: target.companyId },
				data: { lastActivityAt: _max.createdAt },
			});
		}

		if (target.contactId) {
			const { _max } = await this.db.activity.aggregate({
				where: { contactId: target.contactId },
				_max: { createdAt: true },
			});
			await this.db.contact.update({
				where: { id: target.contactId },
				data: { lastActivityAt: _max.createdAt },
			});
		}

		if (target.dealId) {
			const { _max } = await this.db.activity.aggregate({
				where: { dealId: target.dealId },
				_max: { createdAt: true },
			});
			await this.db.deal.update({
				where: { id: target.dealId },
				data: { lastActivityAt: _max.createdAt },
			});
		}
	}

	/**
	 * Rebuilds every row's stamp in three statements.
	 *
	 * For bulk deletes, where naming the affected records would mean collecting
	 * ids across cascades. Set-based, so it stays a few hundred milliseconds on a
	 * table this size rather than one query per record.
	 */
	async recomputeAll(): Promise<void> {
		await this.db.$transaction([
			this.db.$executeRaw`
				UPDATE "company" c
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "companyId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "companyId" IS NOT NULL GROUP BY "companyId"
				) a
				WHERE c.id = a.id AND c."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "company" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "companyId" FROM "activity" WHERE "companyId" IS NOT NULL)`,
			this.db.$executeRaw`
				UPDATE "contact" c
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "contactId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "contactId" IS NOT NULL GROUP BY "contactId"
				) a
				WHERE c.id = a.id AND c."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "contact" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "contactId" FROM "activity" WHERE "contactId" IS NOT NULL)`,
			this.db.$executeRaw`
				UPDATE "deal" d
				SET "lastActivityAt" = a.max
				FROM (
					SELECT "dealId" AS id, MAX("createdAt") AS max
					FROM "activity" WHERE "dealId" IS NOT NULL GROUP BY "dealId"
				) a
				WHERE d.id = a.id AND d."lastActivityAt" IS DISTINCT FROM a.max`,
			this.db.$executeRaw`
				UPDATE "deal" SET "lastActivityAt" = NULL
				WHERE "lastActivityAt" IS NOT NULL
				AND id NOT IN (SELECT "dealId" FROM "activity" WHERE "dealId" IS NOT NULL)`,
		]);
	}
}
