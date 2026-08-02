import { type Db, type Prisma, Prisma as PrismaNamespace } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { fromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class ProductsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(includeArchived = false, scope: Prisma.ProductWhereInput = {}) {
		const rows = await this.db.product.findMany({
			where: {
				AND: [includeArchived ? {} : { archivedAt: null }, scope],
			},
			orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
			select: {
				id: true,
				sku: true,
				name: true,
				price: true,
				currency: true,
				archivedAt: true,
				businessUnitId: true,
				businessUnit: { select: { id: true, name: true } },
				_count: { select: { lineItems: true } },
			},
		});
		return rows.map(({ price, ...row }) => ({
			...row,
			priceCents: toCents(price) ?? 0,
		}));
	}

	async create(input: {
		sku: string;
		name: string;
		priceCents: number;
		currency: string;
		businessUnitId?: string | null;
	}) {
		try {
			return await this.db.product.create({
				data: {
					sku: input.sku.trim(),
					name: input.name.trim(),
					price: fromCents(input.priceCents) ?? 0,
					currency: input.currency.toUpperCase(),
					businessUnitId: input.businessUnitId ?? null,
				},
				select: { id: true },
			});
		} catch (error) {
			throw this.translate(error);
		}
	}

	async update(
		input: {
			id: string;
			sku?: string;
			name?: string;
			priceCents?: number;
			currency?: string;
		},
		scope: Prisma.ProductWhereInput = {},
	) {
		await this.requireScoped(input.id, scope);
		try {
			return await this.db.product.update({
				where: { id: input.id },
				data: {
					...(input.sku ? { sku: input.sku.trim() } : {}),
					...(input.name ? { name: input.name.trim() } : {}),
					...(input.priceCents !== undefined
						? { price: fromCents(input.priceCents) ?? 0 }
						: {}),
					...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
				},
				select: { id: true },
			});
		} catch (error) {
			if (
				error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
				error.code === "P2025"
			) {
				throw new NotFoundException(`No product with id ${input.id}.`);
			}
			throw this.translate(error);
		}
	}

	async archive(
		id: string,
		scope: Prisma.ProductWhereInput = {},
	): Promise<{ id: string }> {
		await this.requireScoped(id, scope);
		return this.db.product.update({
			where: { id },
			data: { archivedAt: new Date() },
			select: { id: true },
		});
	}

	async restore(
		id: string,
		scope: Prisma.ProductWhereInput = {},
	): Promise<{ id: string }> {
		await this.requireScoped(id, scope);
		return this.db.product.update({
			where: { id },
			data: { archivedAt: null },
			select: { id: true },
		});
	}

	private translate(error: unknown): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2002"
		) {
			return new BadRequestException(
				"That SKU is already in the product catalogue.",
			);
		}
		return error;
	}

	private async requireScoped(id: string, scope: Prisma.ProductWhereInput) {
		const product = await this.db.product.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!product) throw new NotFoundException(`No product with id ${id}.`);
	}
}
