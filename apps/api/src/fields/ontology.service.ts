import { randomUUID } from "node:crypto";
import { type Db, OntologySchemaVersionStatus, type Prisma } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import {
	type OntologyCreateDraftInput,
	type OntologyReplaceDraftInput,
	type OntologySchemaListInput,
	type OntologySnapshot,
} from "./ontology.contracts";
import {
	checksumOntologySnapshot,
	diffOntologySnapshots,
	normalizeOntologySnapshot,
	snapshotRuntime,
	validateOntologySnapshot,
} from "./ontology.snapshot";

const ONTOLOGY_RESOURCE = "ontology-schemas";

@Injectable()
export class OntologyService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(input: OntologySchemaListInput, principal: EffectivePrincipal) {
		this.assertGlobalManage(principal);
		const definitions = await this.db.ontologySchemaDefinition.findMany({
			where: input.key ? { key: input.key } : undefined,
			orderBy: { key: "asc" },
			include: {
				versions: {
					where: input.includeArchived
						? undefined
						: { status: { not: OntologySchemaVersionStatus.ARCHIVED } },
					orderBy: { version: "desc" },
					select: versionSelect,
				},
			},
		});
		return definitions.map((definition) => ({
			id: definition.id,
			key: definition.key,
			name: definition.name,
			description: definition.description,
			versions: definition.versions.map(serializeVersion),
		}));
	}

	async detail(id: string, principal: EffectivePrincipal) {
		this.assertGlobalManage(principal);
		const version = await this.db.ontologySchemaVersion.findUnique({
			where: { id },
			include: { schemaDefinition: true },
		});
		if (!version) throw new NotFoundException("Ontology version not found.");
		return serializeVersion({
			...version,
			schemaDefinition: version.schemaDefinition,
		});
	}

	async createDraft(
		input: OntologyCreateDraftInput,
		principal: EffectivePrincipal,
	) {
		this.assertGlobalManage(principal);
		return this.db.$transaction(async (tx) => {
			const definition =
				(await tx.ontologySchemaDefinition.findUnique({
					where: { key: input.key },
				})) ??
				(await tx.ontologySchemaDefinition.create({
					data: {
						key: input.key,
						name: input.name,
						description: input.description ?? null,
					},
				}));
			const published = await this.publishedVersion(tx, definition.id);
			const baseline = published
				? parseSnapshot(published.snapshot)
				: await snapshotRuntime(tx);
			const snapshot = validateOntologySnapshot(
				input.snapshot ?? baseline,
				published ? baseline : undefined,
			);
			const version = await tx.ontologySchemaVersion.create({
				data: {
					schemaDefinitionId: definition.id,
					version: await this.nextVersion(tx, definition.id),
					status: OntologySchemaVersionStatus.DRAFT,
					snapshot: toJson(snapshot),
					checksum: checksumOntologySnapshot(snapshot),
					createdByType: principal.actorType,
					createdById: principal.actorId,
				},
				include: { schemaDefinition: true },
			});
			await this.recordChange(
				tx,
				principal,
				"ontology.schema.draft.created",
				version,
				{ baseVersion: published?.version ?? null },
			);
			return serializeVersion(version);
		});
	}

	async replaceDraft(
		input: OntologyReplaceDraftInput,
		principal: EffectivePrincipal,
	) {
		this.assertGlobalManage(principal);
		return this.db.$transaction(async (tx) => {
			const current = await tx.ontologySchemaVersion.findUnique({
				where: { id: input.id },
				include: { schemaDefinition: true },
			});
			if (!current) throw new NotFoundException("Ontology version not found.");
			if (current.status !== OntologySchemaVersionStatus.DRAFT) {
				throw new BadRequestException(
					"Only a draft ontology version can change.",
				);
			}
			const published = await this.publishedVersion(
				tx,
				current.schemaDefinitionId,
			);
			const baseline = published
				? parseSnapshot(published.snapshot)
				: undefined;
			const snapshot = validateOntologySnapshot(input.snapshot, baseline);
			const next = await tx.ontologySchemaVersion.create({
				data: {
					schemaDefinitionId: current.schemaDefinitionId,
					version: await this.nextVersion(tx, current.schemaDefinitionId),
					status: OntologySchemaVersionStatus.DRAFT,
					snapshot: toJson(snapshot),
					checksum: checksumOntologySnapshot(snapshot),
					createdByType: principal.actorType,
					createdById: principal.actorId,
				},
				include: { schemaDefinition: true },
			});
			await tx.ontologySchemaVersion.update({
				where: { id: current.id },
				data: {
					status: OntologySchemaVersionStatus.ARCHIVED,
					archivedAt: new Date(),
				},
			});
			await this.recordChange(
				tx,
				principal,
				"ontology.schema.draft.replaced",
				next,
				{ replacedVersionId: current.id },
			);
			return serializeVersion(next);
		});
	}

	async impactPreview(id: string, principal: EffectivePrincipal) {
		this.assertGlobalManage(principal);
		const version = await this.db.ontologySchemaVersion.findUnique({
			where: { id },
			include: { schemaDefinition: true },
		});
		if (!version) throw new NotFoundException("Ontology version not found.");
		const published = await this.publishedVersion(
			this.db,
			version.schemaDefinitionId,
			version.id,
		);
		const to = parseSnapshot(version.snapshot);
		const from = published ? parseSnapshot(published.snapshot) : null;
		return {
			schema: {
				key: version.schemaDefinition.key,
				name: version.schemaDefinition.name,
			},
			version: serializeVersion(version),
			fromVersion: published?.version ?? null,
			checksum: version.checksum,
			impact: diffOntologySnapshots(from, to),
		};
	}

	async publish(id: string, confirmed: boolean, principal: EffectivePrincipal) {
		this.assertGlobalManage(principal);
		if (!confirmed) {
			throw new BadRequestException(
				"Publishing an ontology version requires confirmed: true.",
			);
		}
		return this.db.$transaction(async (tx) => {
			const draft = await tx.ontologySchemaVersion.findUnique({
				where: { id },
				include: { schemaDefinition: true },
			});
			if (!draft) throw new NotFoundException("Ontology version not found.");
			if (draft.status !== OntologySchemaVersionStatus.DRAFT) {
				throw new BadRequestException(
					"Only a draft ontology version can publish.",
				);
			}
			const previous = await this.publishedVersion(
				tx,
				draft.schemaDefinitionId,
			);
			const snapshot = validateOntologySnapshot(
				parseSnapshot(draft.snapshot),
				previous ? parseSnapshot(previous.snapshot) : undefined,
			);
			const publishedAt = new Date();
			await tx.ontologySchemaVersion.updateMany({
				where: {
					schemaDefinitionId: draft.schemaDefinitionId,
					status: OntologySchemaVersionStatus.PUBLISHED,
				},
				data: {
					status: OntologySchemaVersionStatus.ARCHIVED,
					archivedAt: publishedAt,
				},
			});
			const version = await tx.ontologySchemaVersion.update({
				where: { id: draft.id },
				data: {
					status: OntologySchemaVersionStatus.PUBLISHED,
					publishedAt,
					archivedAt: null,
				},
				include: { schemaDefinition: true },
			});
			await this.recordChange(
				tx,
				principal,
				"ontology.schema.published",
				version,
				{
					previousVersion: previous?.version ?? null,
					impact: diffOntologySnapshots(
						previous ? parseSnapshot(previous.snapshot) : null,
						snapshot,
					),
				},
			);
			return serializeVersion(version);
		});
	}

	private assertGlobalManage(principal: EffectivePrincipal) {
		if (!principal.isAdmin) {
			throw new ForbiddenException(
				"Only a global administrator can manage ontology versions.",
			);
		}
	}

	private async nextVersion(
		tx: Prisma.TransactionClient,
		schemaDefinitionId: string,
	): Promise<number> {
		const latest = await tx.ontologySchemaVersion.aggregate({
			where: { schemaDefinitionId },
			_max: { version: true },
		});
		return (latest._max.version ?? 0) + 1;
	}

	private publishedVersion(
		client: Pick<Prisma.TransactionClient, "ontologySchemaVersion">,
		schemaDefinitionId: string,
		excludeId?: string,
	) {
		return client.ontologySchemaVersion.findFirst({
			where: {
				schemaDefinitionId,
				status: OntologySchemaVersionStatus.PUBLISHED,
				...(excludeId ? { id: { not: excludeId } } : {}),
			},
			orderBy: { version: "desc" },
		});
	}

	private recordChange(
		tx: Prisma.TransactionClient,
		principal: EffectivePrincipal,
		type: string,
		version: {
			id: string;
			version: number;
			schemaDefinitionId: string;
			checksum: string;
			schemaDefinition: { key: string };
		},
		extra: Record<string, unknown>,
	) {
		const operationId = randomUUID();
		return Promise.all([
			tx.auditEvent.create({
				data: {
					actorType: principal.actorType,
					actorId: principal.actorId,
					action: type,
					resource: ONTOLOGY_RESOURCE,
					recordId: version.id,
				},
			}),
			tx.domainEvent.create({
				data: {
					eventKey: `${type}:${version.id}:${operationId}`,
					type,
					resource: ONTOLOGY_RESOURCE,
					recordId: version.id,
					actorType: principal.actorType,
					actorId: principal.actorId,
					payload: toJson({
						operationId,
						schemaKey: version.schemaDefinition.key,
						schemaDefinitionId: version.schemaDefinitionId,
						version: version.version,
						checksum: version.checksum,
						...extra,
					}),
				},
			}),
		]);
	}
}

const versionSelect = {
	id: true,
	version: true,
	status: true,
	checksum: true,
	createdByType: true,
	createdById: true,
	publishedAt: true,
	archivedAt: true,
	createdAt: true,
} as const;

function serializeVersion(version: {
	id: string;
	version: number;
	status: OntologySchemaVersionStatus;
	checksum: string;
	createdByType: string;
	createdById: string | null;
	publishedAt: Date | null;
	archivedAt: Date | null;
	createdAt: Date;
	snapshot?: Prisma.JsonValue;
	schemaDefinition?: {
		id: string;
		key: string;
		name: string;
		description: string | null;
	};
}) {
	return {
		id: version.id,
		version: version.version,
		status: version.status,
		checksum: version.checksum,
		createdByType: version.createdByType,
		createdById: version.createdById,
		publishedAt: version.publishedAt?.toISOString() ?? null,
		archivedAt: version.archivedAt?.toISOString() ?? null,
		createdAt: version.createdAt.toISOString(),
		...(version.schemaDefinition
			? { schemaDefinition: version.schemaDefinition }
			: {}),
		...(version.snapshot !== undefined
			? { snapshot: parseSnapshot(version.snapshot) }
			: {}),
	};
}

function parseSnapshot(value: Prisma.JsonValue): OntologySnapshot {
	return normalizeOntologySnapshot(value as OntologySnapshot);
}

function toJson(value: unknown): Prisma.InputJsonObject {
	return value as Prisma.InputJsonObject;
}
