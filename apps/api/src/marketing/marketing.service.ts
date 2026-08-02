import { type Db, type Prisma, Prisma as PrismaNamespace } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class MarketingService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async forms(
		includeArchived = false,
		scope: Prisma.MarketingFormWhereInput = {},
	) {
		return this.db.marketingForm.findMany({
			where: { AND: [includeArchived ? {} : { archivedAt: null }, scope] },
			orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
			select: {
				id: true,
				name: true,
				externalId: true,
				businessUnitId: true,
				businessUnit: { select: { id: true, name: true } },
				archivedAt: true,
				_count: { select: { conversions: true } },
			},
		});
	}

	async events(
		includeArchived = false,
		scope: Prisma.MarketingEventWhereInput = {},
	) {
		const rows = await this.db.marketingEvent.findMany({
			where: { AND: [includeArchived ? {} : { archivedAt: null }, scope] },
			orderBy: [
				{ archivedAt: "asc" },
				{ startsAt: { sort: "desc", nulls: "last" } },
				{ name: "asc" },
			],
			select: {
				id: true,
				name: true,
				startsAt: true,
				endsAt: true,
				location: true,
				businessUnitId: true,
				businessUnit: { select: { id: true, name: true } },
				archivedAt: true,
				_count: { select: { attendances: true } },
			},
		});
		return rows.map(({ startsAt, endsAt, ...row }) => ({
			...row,
			startsAt: startsAt?.toISOString() ?? null,
			endsAt: endsAt?.toISOString() ?? null,
		}));
	}

	async createForm(input: {
		name: string;
		externalId?: string | null;
		businessUnitId?: string | null;
	}) {
		try {
			return await this.db.marketingForm.create({
				data: {
					name: input.name.trim(),
					externalId: blankToNull(input.externalId ?? ""),
					businessUnitId: input.businessUnitId ?? null,
				},
				select: { id: true },
			});
		} catch (error) {
			throw this.translateUnique(
				error,
				"That external form ID is already in use.",
			);
		}
	}

	async updateForm(
		input: {
			id: string;
			name?: string;
			externalId?: string | null;
		},
		scope: Prisma.MarketingFormWhereInput = {},
	) {
		await this.requireForm(input.id, scope);
		try {
			return await this.db.marketingForm.update({
				where: { id: input.id },
				data: {
					...(input.name ? { name: input.name.trim() } : {}),
					...(input.externalId !== undefined
						? { externalId: blankToNull(input.externalId ?? "") }
						: {}),
				},
				select: { id: true },
			});
		} catch (error) {
			throw this.translateUpdate(error, input.id, "form");
		}
	}

	async createEvent(input: {
		name: string;
		startsAt?: string | null;
		endsAt?: string | null;
		location?: string | null;
		businessUnitId?: string | null;
	}) {
		const dates = eventDates(input.startsAt, input.endsAt);
		return this.db.marketingEvent.create({
			data: {
				name: input.name.trim(),
				...dates,
				location: blankToNull(input.location ?? ""),
				businessUnitId: input.businessUnitId ?? null,
			},
			select: { id: true },
		});
	}

	async updateEvent(
		input: {
			id: string;
			name?: string;
			startsAt?: string | null;
			endsAt?: string | null;
			location?: string | null;
		},
		scope: Prisma.MarketingEventWhereInput = {},
	) {
		await this.requireEvent(input.id, scope);
		try {
			return await this.db.$transaction(async (tx) => {
				const locked = await tx.$queryRaw<Array<{ id: string }>>`
					SELECT "id"
					FROM "marketingEvent"
					WHERE "id" = ${input.id}
					FOR UPDATE
				`;
				if (!locked[0]) {
					throw new NotFoundException(
						`No marketing event with id ${input.id}.`,
					);
				}
				let dates: Partial<ReturnType<typeof eventDates>> = {};
				if (input.startsAt !== undefined || input.endsAt !== undefined) {
					const current = await tx.marketingEvent.findUniqueOrThrow({
						where: { id: input.id },
						select: { startsAt: true, endsAt: true },
					});
					dates = eventDates(
						input.startsAt === undefined
							? (current.startsAt?.toISOString() ?? null)
							: input.startsAt,
						input.endsAt === undefined
							? (current.endsAt?.toISOString() ?? null)
							: input.endsAt,
					);
				}
				return tx.marketingEvent.update({
					where: { id: input.id },
					data: {
						...(input.name ? { name: input.name.trim() } : {}),
						...dates,
						...(input.location !== undefined
							? { location: blankToNull(input.location ?? "") }
							: {}),
					},
					select: { id: true },
				});
			});
		} catch (error) {
			throw this.translateUpdate(error, input.id, "event");
		}
	}

	async archiveForm(
		id: string,
		scope: Prisma.MarketingFormWhereInput = {},
	): Promise<{ id: string }> {
		await this.requireForm(id, scope);
		return this.db.marketingForm.update({
			where: { id },
			data: { archivedAt: new Date() },
			select: { id: true },
		});
	}

	async restoreForm(
		id: string,
		scope: Prisma.MarketingFormWhereInput = {},
	): Promise<{ id: string }> {
		await this.requireForm(id, scope);
		return this.db.marketingForm.update({
			where: { id },
			data: { archivedAt: null },
			select: { id: true },
		});
	}

	async archiveEvent(
		id: string,
		scope: Prisma.MarketingEventWhereInput = {},
	): Promise<{ id: string }> {
		await this.requireEvent(id, scope);
		return this.db.marketingEvent.update({
			where: { id },
			data: { archivedAt: new Date() },
			select: { id: true },
		});
	}

	async restoreEvent(
		id: string,
		scope: Prisma.MarketingEventWhereInput = {},
	): Promise<{ id: string }> {
		await this.requireEvent(id, scope);
		return this.db.marketingEvent.update({
			where: { id },
			data: { archivedAt: null },
			select: { id: true },
		});
	}

	private translateUnique(error: unknown, message: string): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return new BadRequestException(message);
		}
		return error;
	}

	private async requireForm(id: string, scope: Prisma.MarketingFormWhereInput) {
		const form = await this.db.marketingForm.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!form) throw new NotFoundException(`No marketing form with id ${id}.`);
	}

	private async requireEvent(
		id: string,
		scope: Prisma.MarketingEventWhereInput,
	) {
		const event = await this.db.marketingEvent.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!event)
			throw new NotFoundException(`No marketing event with id ${id}.`);
	}

	private translateUpdate(error: unknown, id: string, kind: string): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2025"
		) {
			return new NotFoundException(`No marketing ${kind} with id ${id}.`);
		}
		return this.translateUnique(
			error,
			"That external form ID is already in use.",
		);
	}
}

function eventDates(startsAt?: string | null, endsAt?: string | null) {
	const start = parseDate(startsAt);
	const end = parseDate(endsAt);
	if (start && end && end < start) {
		throw new BadRequestException("An event cannot end before it starts.");
	}
	return { startsAt: start, endsAt: end };
}

function parseDate(value?: string | null): Date | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
