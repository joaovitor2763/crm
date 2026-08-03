import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiCredentialAccessMode, ApiCredentialStatus, type Db } from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import type { ApiCredentialCreateInput } from "./api-credentials.contracts";

const TOKEN_PREFIX = "crm_live";

export type ApiCredentialRow = {
	id: string;
	name: string;
	prefix: string;
	lastFour: string;
	status: ApiCredentialStatus;
	accessMode: ApiCredentialAccessMode;
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
	role: { id: string; key: string; name: string };
	createdBy: { id: string; name: string; email: string };
	businessUnits: { businessUnit: { id: string; name: string } }[];
	teams: { team: { id: string; name: string } }[];
};

@Injectable()
export class ApiCredentialsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	list(): Promise<ApiCredentialRow[]> {
		return this.db.apiCredential.findMany({
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				name: true,
				prefix: true,
				lastFour: true,
				status: true,
				accessMode: true,
				expiresAt: true,
				lastUsedAt: true,
				createdAt: true,
				role: { select: { id: true, key: true, name: true } },
				createdBy: { select: { id: true, name: true, email: true } },
				businessUnits: {
					select: { businessUnit: { select: { id: true, name: true } } },
				},
				teams: { select: { team: { select: { id: true, name: true } } } },
			},
		});
	}

	async create(input: ApiCredentialCreateInput, actor: EffectivePrincipal) {
		if (!actor.userId) throw new ForbiddenException();
		const accessMode = input.accessMode ?? ApiCredentialAccessMode.SCOPED_ROLE;
		const delegated = accessMode === ApiCredentialAccessMode.USER_DELEGATE;
		const roleId = delegated ? actor.roleId : input.roleId;
		if (!roleId) throw new NotFoundException("Role not found.");
		const role = await this.db.role.findFirst({
			where: { id: roleId, archivedAt: null },
			select: { id: true, isAdmin: true },
		});
		if (!role) throw new NotFoundException("Role not found.");
		if (!delegated && role.isAdmin) {
			throw new ForbiddenException(
				"Scoped API credentials cannot use a global administrator role.",
			);
		}
		const prefix = randomBytes(6).toString("hex");
		const secret = randomBytes(32).toString("base64url");
		const token = `${TOKEN_PREFIX}_${prefix}_${secret}`;
		const credential = await this.db.apiCredential.create({
			data: {
				name: input.name,
				accessMode,
				prefix,
				secretHash: hashToken(token),
				lastFour: secret.slice(-4),
				roleId,
				createdById: actor.userId,
				expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
				businessUnits: {
					create: (delegated ? [] : (input.businessUnitIds ?? [])).map(
						(businessUnitId) => ({
							businessUnitId,
						}),
					),
				},
				teams: {
					create: (delegated ? [] : (input.teamIds ?? [])).map((teamId) => ({
						teamId,
					})),
				},
			},
			select: { id: true, name: true, prefix: true, lastFour: true },
		});
		return { ...credential, token };
	}

	async revoke(id: string) {
		const found = await this.db.apiCredential.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!found) throw new NotFoundException("API credential not found.");
		return this.db.apiCredential.update({
			where: { id },
			data: { status: ApiCredentialStatus.REVOKED, revokedAt: new Date() },
			select: { id: true, status: true, revokedAt: true },
		});
	}

	async authenticate(authorization?: string) {
		const token = authorization?.startsWith("Bearer ")
			? authorization.slice(7)
			: "";
		const match = /^crm_live_([a-f0-9]{12})_(.+)$/.exec(token);
		if (!match) {
			throw new ForbiddenException("Invalid API credential.");
		}
		const prefix = match[1] as string;
		const credential = await this.db.apiCredential.findUnique({
			where: { prefix },
			select: {
				id: true,
				secretHash: true,
				status: true,
				expiresAt: true,
			},
		});
		const presentedHash = Buffer.from(hashToken(token));
		const expectedHash = Buffer.from(credential?.secretHash ?? "0".repeat(64));
		const valid =
			presentedHash.length === expectedHash.length &&
			timingSafeEqual(presentedHash, expectedHash);
		if (
			!credential ||
			!valid ||
			credential.status !== ApiCredentialStatus.ACTIVE ||
			(credential.expiresAt && credential.expiresAt <= new Date())
		) {
			throw new ForbiddenException("Invalid API credential.");
		}
		void this.db.apiCredential.update({
			where: { id: credential.id },
			data: { lastUsedAt: new Date() },
		});
		return credential.id;
	}
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
