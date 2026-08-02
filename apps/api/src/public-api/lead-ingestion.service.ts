import {
	AccessScope,
	type Db,
	LeadSubmissionStatus,
	PermissionAction,
	type Prisma,
	Prisma as PrismaNamespace,
	RecordSource,
} from "@crm/db";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
	CRM_RESOURCE,
	DEFAULT_BUSINESS_UNIT_ID,
} from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import {
	type LeadIngestionInput,
	leadIngestionInput,
} from "./lead-ingestion.contracts";

type SubmissionResult = {
	id: string;
	status: LeadSubmissionStatus;
	contactId?: string | null;
	reasons?: Prisma.JsonValue | null;
};

type SubmissionIdentity = {
	source: string;
	externalId?: string;
	idempotencyKey?: string;
	businessUnitId: string;
	teamId: string | null;
};

type RoutingHints = Pick<
	SubmissionIdentity,
	"source" | "externalId" | "idempotencyKey"
> & {
	businessUnitId?: string;
	teamId?: string;
};

@Injectable()
export class LeadIngestionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(FieldsService)
		private readonly fields: FieldsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	async ingest(payload: unknown, principal: EffectivePrincipal) {
		const rawPayload = toJson(payload);
		const contactScope = this.readContactScope(principal);
		const parsed = leadIngestionInput.safeParse(payload);
		if (!parsed.success) {
			const hints = unsafeRoutingHints(payload);
			const identity = {
				source: hints.source,
				externalId: hints.externalId,
				idempotencyKey: hints.idempotencyKey,
				...(await this.resolveRoutingScope(hints, principal)),
			};
			const prior = await this.findPrior(identity);
			if (prior) return this.publicSubmission(prior, contactScope);
			return this.createRejectedSubmission(
				identity,
				rawPayload,
				principal,
				contactScope,
				toJson(
					parsed.error.issues.map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
				),
			);
		}

		const identity = toSubmissionIdentity(parsed.data);
		await this.assertCompanyReadable(parsed.data, principal);
		const prior = await this.findPrior(identity);
		if (prior) return this.publicSubmission(prior, contactScope);

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
			return this.createRejectedSubmission(
				identity,
				rawPayload,
				principal,
				contactScope,
				toJson([
					{
						path: "customValues",
						message:
							error instanceof Error ? error.message : "Invalid custom fields.",
					},
				]),
				toJson(parsed.data),
			);
		}
		const input = { ...parsed.data, customValues };
		const submissionIdentity = toSubmissionIdentity(input);
		try {
			const submission = await this.db.$transaction(async (tx) => {
				const normalizedEmail = input.email?.toLowerCase();
				const existing =
					normalizedEmail && contactScope
						? await tx.contact.findFirst({
								where: { AND: [{ email: normalizedEmail }, contactScope] },
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
			return this.publicSubmission(submission, contactScope);
		} catch (error) {
			if (isContactEmailConflict(error)) {
				const concurrent = await this.findPrior(submissionIdentity);
				if (concurrent) return this.publicSubmission(concurrent, contactScope);
				return this.createUnassociatedSubmission(
					submissionIdentity,
					rawPayload,
					principal,
					contactScope,
					toJson(input),
				);
			}
			if (isUniqueViolation(error)) {
				const concurrent = await this.findPrior(submissionIdentity);
				if (concurrent) return this.publicSubmission(concurrent, contactScope);
			}
			throw error;
		}
	}

	private readContactScope(principal: EffectivePrincipal) {
		return this.accessControl.permission(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		) === AccessScope.NONE
			? null
			: this.accessControl.contactWhere(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
				);
	}

	private async assertCompanyReadable(
		input: LeadIngestionInput,
		principal: EffectivePrincipal,
	): Promise<void> {
		if (input.companyId === undefined || input.companyId === null) return;
		await this.accessControl.assertRecord(
			principal,
			CRM_RESOURCE.companies,
			PermissionAction.READ,
			input.companyId,
		);
	}

	private async resolveRoutingScope(
		hints: RoutingHints,
		principal: EffectivePrincipal,
	) {
		const defaultBusinessUnitId =
			principal.primaryBusinessUnitId ?? DEFAULT_BUSINESS_UNIT_ID;
		const defaultTeam = principal.primaryTeamId
			? principal.teamAssignments.find(
					(assignment) =>
						assignment.teamId === principal.primaryTeamId &&
						assignment.businessUnitId === defaultBusinessUnitId,
				)
			: undefined;
		const defaultScope = {
			businessUnitId: defaultBusinessUnitId,
			teamId: defaultTeam?.teamId ?? null,
		};

		const businessUnitId = hints.businessUnitId ?? defaultBusinessUnitId;
		const teamId =
			hints.teamId ??
			(defaultTeam?.businessUnitId === businessUnitId
				? defaultTeam.teamId
				: null);
		const candidate = { businessUnitId, teamId };
		try {
			await this.accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.CREATE,
				candidate,
			);
			return candidate;
		} catch (error) {
			if (!(error instanceof ForbiddenException)) throw error;
			await this.accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.CREATE,
				defaultScope,
			);
			return defaultScope;
		}
	}

	private async createRejectedSubmission(
		identity: SubmissionIdentity,
		rawPayload: Prisma.InputJsonValue,
		principal: EffectivePrincipal,
		contactScope: Prisma.ContactWhereInput | null,
		reasons: Prisma.InputJsonValue,
		normalizedPayload?: Prisma.InputJsonValue,
	) {
		try {
			const submission = await this.db.leadSubmission.create({
				data: {
					...identity,
					status: LeadSubmissionStatus.REJECTED,
					payload: rawPayload,
					normalizedPayload,
					reasons,
					receivedByType: principal.actorType,
					receivedById: principal.actorId,
					processedAt: new Date(),
				},
				select: { id: true, status: true, contactId: true, reasons: true },
			});
			return this.publicSubmission(submission, contactScope);
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			const concurrent = await this.findPrior(identity);
			if (concurrent) return this.publicSubmission(concurrent, contactScope);
			throw error;
		}
	}

	private async createUnassociatedSubmission(
		identity: SubmissionIdentity,
		rawPayload: Prisma.InputJsonValue,
		principal: EffectivePrincipal,
		contactScope: Prisma.ContactWhereInput | null,
		normalizedPayload: Prisma.InputJsonValue,
	) {
		try {
			const submission = await this.db.leadSubmission.create({
				data: {
					...identity,
					status: LeadSubmissionStatus.NEEDS_REVIEW,
					payload: rawPayload,
					normalizedPayload,
					reasons: [{ code: "CONTACT_UNRESOLVED" }],
					receivedByType: principal.actorType,
					receivedById: principal.actorId,
					processedAt: new Date(),
				},
				select: { id: true, status: true, contactId: true, reasons: true },
			});
			return this.publicSubmission(submission, contactScope);
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			const concurrent = await this.findPrior(identity);
			if (concurrent) return this.publicSubmission(concurrent, contactScope);
			throw error;
		}
	}

	private async publicSubmission(
		submission: SubmissionResult,
		contactScope: Prisma.ContactWhereInput | null,
	) {
		const duplicateInScope =
			submission.status === LeadSubmissionStatus.DUPLICATE &&
			submission.contactId !== null &&
			submission.contactId !== undefined &&
			contactScope !== null
				? await this.db.contact.findFirst({
						where: {
							AND: [{ id: submission.contactId }, contactScope],
						},
						select: { id: true },
					})
				: null;
		const genericStatus =
			submission.status === LeadSubmissionStatus.ACCEPTED ||
			submission.status === LeadSubmissionStatus.NEEDS_REVIEW ||
			(submission.status === LeadSubmissionStatus.DUPLICATE &&
				!duplicateInScope);
		return {
			id: submission.id,
			status: genericStatus ? LeadSubmissionStatus.ACCEPTED : submission.status,
			contactId: null,
			...(genericStatus ? {} : { reasons: submission.reasons }),
		};
	}

	private findPrior(input: SubmissionIdentity) {
		if (!input.externalId && !input.idempotencyKey) return null;
		return this.db.leadSubmission.findFirst({
			where: {
				source: input.source,
				businessUnitId: input.businessUnitId,
				idempotencyScopeKey: idempotencyScopeKey(input),
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

function toSubmissionIdentity(input: LeadIngestionInput): SubmissionIdentity {
	return {
		source: input.source,
		externalId: input.externalId,
		idempotencyKey: input.idempotencyKey,
		businessUnitId: input.businessUnitId,
		teamId: input.teamId ?? null,
	};
}

function idempotencyScopeKey(input: Pick<SubmissionIdentity, "teamId">) {
	return input.teamId === null ? "none" : `team:${input.teamId}`;
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

function unsafeRoutingHints(payload: unknown): RoutingHints {
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

function isUniqueViolation(
	error: unknown,
): error is PrismaNamespace.PrismaClientKnownRequestError {
	return (
		error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

function isContactEmailConflict(error: unknown): boolean {
	if (!isUniqueViolation(error)) return false;
	const target = error.meta?.target;
	const targetText = Array.isArray(target)
		? target.join(" ")
		: String(target ?? "");
	return /email/i.test(targetText) || /email/i.test(error.message);
}
