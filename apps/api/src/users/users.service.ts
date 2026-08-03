import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export interface UserOption {
	id: string;
	name: string;
	email: string;
	image: string | null;
}

@Injectable()
export class UsersService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * Everyone currently eligible to own a company, contact or deal.
	 * Suspended identities keep historical ownership but cannot receive new work.
	 */
	async list(): Promise<UserOption[]> {
		return this.db.user.findMany({
			where: {
				OR: [{ access: null }, { access: { is: { status: "ACTIVE" } } }],
			},
			select: { id: true, name: true, email: true, image: true },
			orderBy: [{ name: "asc" }, { email: "asc" }],
		});
	}
}
