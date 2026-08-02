import {
	type Db,
	LeadSubmissionStatus,
	type Prisma,
	RecordSource,
} from "@crm/db";
import { Inject, Injectable } from "@nestjs/common";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import {
	type LeadIngestionInput,
	leadIngestionInput,
} from "./lead-ingestion.contracts";

@Injectable()
export class LeadIngestionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(FieldsService)
		private readonly fields: FieldsService,
	) {}

	async ingest(payload: unknown, principal: EffectivePrincipal) {
		const rawPayload = toJson(payload);
		const parsed = leadIngestionInput.safeParse(payload);
		if (!parsed.success) {
			const hints = unsafeRoutingHints(payload);
			const submission = await this.db.leadSubmission.create({
				data: {
					source: hints.source,
					externalId: hints.externalId,
					idempotencyKey: hints.idempotencyKey,
					status: LeadSubmissionStatus.REJECTED,
					payload: rawPayload,
					reasons: parsed.error.issues.map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
					businessUnitId:
						hints.businessUnitId ??
						principal.primaryBusinessUnitId ??
						undefined,
					teamId: hints.teamId,
					receivedByType: principal.actorType,
					receivedById: principal.actorId,
					processedAt: new Date(),
				},
				select: { id: true, status: true, reasons: true },
			});
			return submission;
		}

		let customValues: Record<string, Prisma.InputJsonValue>;
		try {
			customValues = await this.fields.validateChannelValues(
				"contacts",
				parsed.data.businessUnitId,
				parsed.data.customValues,
				principal,
				"api",
			);
		} catch (error) {
			return this.db.leadSubmission.create({
				data: {
					source: parsed.data.source,
					externalId: parsed.data.externalId,
					idempotencyKey: parsed.data.idempotencyKey,
					status: LeadSubmissionStatus.REJECTED,
					payload: rawPayload,
					normalizedPayload: toJson(parsed.data),
					reasons: [
						{
							path: "customValues",
							message:
								error instanceof Error
									? error.message
									: "Invalid custom fields.",
						},
					],
					businessUnitId: parsed.data.businessUnitId,
					teamId: parsed.data.teamId,
					receivedByType: principal.actorType,
					receivedById: principal.actorId,
					processedAt: new Date(),
				},
				select: { id: true, status: true, reasons: true },
			});
		}
		const input = { ...parsed.data, customValues };
		const prior = await this.findPrior(input);
		if (prior) return prior;

		return this.db.$transaction(async (tx) => {
			const existing = input.email
				? await tx.contact.findUnique({
						where: { email: input.email.toLowerCase() },
						select: { id: true },
					})
				: null;
			const contactId =
				existing?.id ?? (await this.createContact(tx, input)).id;
			if (existing) {
				await tx.contactBusinessUnitState.upsert({
					where: {
						contactId_businessUnitId: {
							contactId,
							businessUnitId: input.businessUnitId,
						},
					},
					create: { contactId, ...unitState(input, principal) },
					update: {},
				});
			}

			const status = existing
				? LeadSubmissionStatus.DUPLICATE
				: LeadSubmissionStatus.ACCEPTED;
			const submission = await tx.leadSubmission.create({
				data: {
					source: input.source,
					externalId: input.externalId,
					idempotencyKey: input.idempotencyKey,
					status,
					payload: rawPayload,
					normalizedPayload: toJson(input),
					reasons: existing ? [{ code: "EMAIL_ALREADY_EXISTS" }] : undefined,
					businessUnitId: input.businessUnitId,
					teamId: input.teamId,
					contactId,
					receivedByType: principal.actorType,
					receivedById: principal.actorId,
					processedAt: new Date(),
				},
				select: { id: true, status: true, contactId: true, reasons: true },
			});
			await tx.domainEvent.create({
				data: {
					eventKey: `lead.submitted:${submission.id}`,
					type: "lead.submitted",
					resource: "contacts",
					recordId: contactId,
					businessUnitId: input.businessUnitId,
					teamId: input.teamId,
					actorType: principal.actorType,
					actorId: principal.actorId,
					payload: { submissionId: submission.id, status },
				},
			});
			return submission;
		});
	}

	private findPrior(input: LeadIngestionInput) {
		if (!input.externalId && !input.idempotencyKey) return null;
		return this.db.leadSubmission.findFirst({
			where: {
				source: input.source,
				OR: [
					...(input.externalId ? [{ externalId: input.externalId }] : []),
					...(input.idempotencyKey
						? [{ idempotencyKey: input.idempotencyKey }]
						: []),
				],
			},
			select: { id: true, status: true, contactId: true, reasons: true },
		});
	}

	private async createContact(
		tx: Prisma.TransactionClient,
		input: LeadIngestionInput,
	) {
		return tx.contact.create({
			data: {
				firstName: input.firstName,
				lastName: input.lastName || null,
				email: input.email?.toLowerCase() ?? null,
				phone: input.phone || null,
				title: input.title || null,
				companyId: input.companyId,
				ownerId: input.ownerId,
				source: RecordSource.IMPORT,
				utmSource: input.utmSource,
				utmMedium: input.utmMedium,
				utmCampaign: input.utmCampaign,
				utmTerm: input.utmTerm,
				utmContent: input.utmContent,
				customValues: toJson(input.customValues),
				unitStates: { create: unitState(input) },
			},
			select: { id: true },
		});
	}
}

function unitState(input: LeadIngestionInput, principal?: EffectivePrincipal) {
	return {
		businessUnitId: input.businessUnitId,
		teamId: input.teamId,
		ownerId: input.ownerId ?? principal?.userId,
		leadSource: input.source,
		utmSource: input.utmSource,
		utmMedium: input.utmMedium,
		utmCampaign: input.utmCampaign,
		utmTerm: input.utmTerm,
		utmContent: input.utmContent,
		customValues: toJson(input.customValues),
	};
}

function unsafeRoutingHints(payload: unknown) {
	const value =
		typeof payload === "object" && payload !== null
			? (payload as Record<string, unknown>)
			: {};
	return {
		source:
			typeof value.source === "string" ? value.source.slice(0, 120) : "unknown",
		externalId:
			typeof value.externalId === "string" ? value.externalId : undefined,
		idempotencyKey:
			typeof value.idempotencyKey === "string"
				? value.idempotencyKey
				: undefined,
		businessUnitId:
			typeof value.businessUnitId === "string"
				? value.businessUnitId
				: undefined,
		teamId: typeof value.teamId === "string" ? value.teamId : undefined,
	};
}

function toJson(value: unknown): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
