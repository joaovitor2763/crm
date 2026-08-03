import { ActivityType, type Db } from "@crm/db";
import { Inject, Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ActivityStampService } from "./activity-stamp.service";

export type EnrichmentEvent = {
	companyId?: string | null;
	contactId?: string | null;
	subject: string;
	body?: string | null;
	/** Where the facts came from, and what changed. Rendered on the entry. */
	meta?: Record<string, unknown>;
};

/**
 * Writes an `ENRICHMENT` activity when something is created or filled in
 * automatically.
 *
 * Without this the agents are invisible: a company appears with a logo and an
 * industry nobody typed, a contact renames itself overnight, and the only way
 * to find out when or why is to read the server logs. A record that changes on
 * its own has to say so on its own timeline — that is the difference between an
 * assistant and a haunted database.
 *
 * Deliberately the same `ENRICHMENT` type the research brief already uses, so
 * one filter shows everything the machines did.
 */
@Injectable()
export class EnrichmentLogService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(ActivityStampService) private readonly stamp: ActivityStampService,
	) {}

	/**
	 * Records one event, attributed to a system author.
	 *
	 * `Activity.createdById` is required, so an automatic write borrows the
	 * record's owner and falls back to any user. `meta.automated` marks it, and
	 * the timeline renders that as "via …" rather than as something a person did.
	 */
	async record(event: EnrichmentEvent): Promise<string | null> {
		const author = await this.authorFor(event);
		if (!author) return null;

		const activity = await this.db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: event.subject,
				body: event.body ?? null,
				occurredAt: new Date(),
				companyId: event.companyId ?? null,
				contactId: event.contactId ?? null,
				createdById: author,
				meta: { ...event.meta, automated: true },
			},
			select: { id: true, createdAt: true },
		});

		await this.stamp.touch(
			{ companyId: event.companyId, contactId: event.contactId },
			activity.createdAt,
		);

		return activity.id;
	}

	/** The owner of whatever this is about, or any user. */
	private async authorFor(event: EnrichmentEvent): Promise<string | null> {
		if (event.contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: event.contactId },
				select: { ownerId: true },
			});
			if (contact?.ownerId) return contact.ownerId;
		}

		if (event.companyId) {
			const company = await this.db.company.findUnique({
				where: { id: event.companyId },
				select: { ownerId: true },
			});
			if (company?.ownerId) return company.ownerId;
		}

		const anyUser = await this.db.user.findFirst({ select: { id: true } });
		return anyUser?.id ?? null;
	}
}

/** "logo, industry, description" — what a lookup actually filled in. */
export function describeFilled(fields: readonly string[]): string | null {
	if (fields.length === 0) return null;
	if (fields.length === 1) return `Filled in ${fields[0]}.`;

	const last = fields[fields.length - 1];
	return `Filled in ${fields.slice(0, -1).join(", ")} and ${last}.`;
}
