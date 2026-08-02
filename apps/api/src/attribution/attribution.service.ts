import {
	AccessScope,
	ActivityType,
	type Db,
	PermissionAction,
	type Prisma,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	CRM_RESOURCE,
	DEFAULT_BUSINESS_UNIT_ID,
} from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { RevenueAccountsService } from "../revenue-accounts/revenue-accounts.service";
import type {
	AttributionEventInput,
	AttributionProjectionInput,
} from "./attribution.contracts";
import {
	activityAttributionSelect,
	activityTouch,
	conversionEventSelect,
	conversionEventTouch,
	isPipelineEntry,
	leadSubmissionAttributionSelect,
	leadSubmissionTouch,
} from "./attribution.helpers";
import type {
	AttributionProjection,
	AttributionTouch,
} from "./attribution.types";

type Subject = {
	id: string;
	businessUnitId: string;
	teamId: string | null;
};

type LinkedDeal = {
	id: string;
	businessUnitId: string;
	teamId: string | null;
	pipelineId: string;
	stageId: string;
};

@Injectable()
export class AttributionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly accessControl: AccessControlService,
		private readonly accounts: RevenueAccountsService,
	) {}

	async record(input: AttributionEventInput, principal: EffectivePrincipal) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.activities,
			PermissionAction.CREATE,
		);
		const subject = await this.resolveSubject(
			input.entityType,
			input.entityId,
			principal,
			PermissionAction.READ,
		);
		const linkedDeal = await this.resolveLinkedDeal(input, principal);
		const reference = await this.validateReferences(
			input,
			subject,
			linkedDeal,
			principal,
		);
		const operationId = input.operationId ?? crypto.randomUUID();
		const occurredAt = input.occurredAt
			? new Date(input.occurredAt)
			: new Date();

		const event = await this.db.$transaction(async (tx) => {
			const created = await tx.conversionAttributionEvent.upsert({
				where: {
					entityType_entityId_operationId: {
						entityType: input.entityType,
						entityId: subject.id,
						operationId,
					},
				},
				create: {
					entityType: input.entityType,
					entityId: subject.id,
					contactId: input.entityType === "CONTACT" ? subject.id : null,
					companyId: input.entityType === "COMPANY" ? subject.id : null,
					dealId: input.entityType === "DEAL" ? subject.id : reference.dealId,
					revenueAccountId:
						input.entityType === "REVENUE_ACCOUNT" ? subject.id : null,
					businessUnitId: subject.businessUnitId,
					teamId: subject.teamId,
					actorType: principal.actorType,
					actorId: principal.actorId,
					operationId,
					channel: input.channel ?? null,
					source: input.source ?? null,
					conversionType: input.conversionType,
					utmSource: input.utmSource ?? null,
					utmMedium: input.utmMedium ?? null,
					utmCampaign: input.utmCampaign ?? null,
					utmTerm: input.utmTerm ?? null,
					utmContent: input.utmContent ?? null,
					marketingFormId: input.marketingFormId ?? null,
					marketingEventId: input.marketingEventId ?? null,
					pipelineId: reference.pipelineId,
					pipelineStageId: reference.pipelineStageId,
					metadata: input.metadata as Prisma.InputJsonValue | undefined,
					occurredAt,
				},
				update: {},
				select: conversionEventSelect,
			});
			await tx.domainEvent.upsert({
				where: {
					eventKey: `revenue-conversion.recorded:${created.entityType}:${created.entityId}:${operationId}`,
				},
				create: {
					eventKey: `revenue-conversion.recorded:${created.entityType}:${created.entityId}:${operationId}`,
					type: "revenue-conversion.recorded",
					resource: "conversion-attribution",
					recordId: created.entityId,
					businessUnitId: created.businessUnitId,
					teamId: created.teamId,
					actorType: principal.actorType,
					actorId: principal.actorId,
					payload: {
						eventId: created.id,
						entityType: created.entityType,
						entityId: created.entityId,
						conversionType: created.conversionType,
						operationId: created.operationId,
					},
				},
				update: {},
			});
			return created;
		});

		return conversionEventTouch(event);
	}

	async projection(
		input: AttributionProjectionInput,
		principal: EffectivePrincipal,
	): Promise<AttributionProjection> {
		const subject = await this.resolveSubject(
			input.entityType,
			input.entityId,
			principal,
			PermissionAction.READ,
		);
		const touches = await this.loadTouches(input, subject, principal);
		const ordered = touches.sort(compareTouches);
		const firstTouch = ordered[0] ?? null;
		const currentTouch = ordered.at(-1) ?? null;
		const firstConversion =
			ordered.find((touch) => touch.conversionType !== "TOUCH") ?? null;
		const touchCount = ordered.filter(
			(touch) => touch.conversionType === "TOUCH",
		).length;

		return {
			entityType: input.entityType,
			entityId: subject.id,
			firstTouch,
			currentTouch,
			firstConversion,
			conversionCount: ordered.length - touchCount,
			touchCount,
			pipelineEntryCount: ordered.filter(isPipelineEntry).length,
			sourceHistory: uniqueValues(ordered.map((touch) => touch.source)),
			channelHistory: uniqueValues(ordered.map((touch) => touch.channel)),
			events: input.includeEvents ? ordered : [],
		};
	}

	async history(
		input: AttributionProjectionInput,
		principal: EffectivePrincipal,
	) {
		return this.projection({ ...input, includeEvents: true }, principal);
	}

	private async resolveSubject(
		entityType: AttributionEventInput["entityType"],
		entityId: string,
		principal: EffectivePrincipal,
		action: PermissionAction,
	): Promise<Subject> {
		const unitIds = principal.businessUnitTreeIds.length
			? principal.businessUnitTreeIds
			: [DEFAULT_BUSINESS_UNIT_ID];
		if (entityType === "REVENUE_ACCOUNT") {
			return this.accounts.assertReadable(entityId, principal);
		}
		const resource =
			entityType === "CONTACT"
				? CRM_RESOURCE.contacts
				: entityType === "COMPANY"
					? CRM_RESOURCE.companies
					: CRM_RESOURCE.deals;
		await this.accessControl.assertRecord(
			principal,
			resource,
			action,
			entityId,
		);

		if (entityType === "DEAL") {
			const deal = await this.db.deal.findUnique({
				where: { id: entityId },
				select: { id: true, businessUnitId: true, teamId: true },
			});
			if (!deal) throw new NotFoundException("Deal not found.");
			return deal;
		}

		const stateWhere = {
			businessUnitId: { in: unitIds },
			archivedAt: null,
		};
		const state =
			entityType === "CONTACT"
				? await this.db.contactBusinessUnitState.findFirst({
						where: { contactId: entityId, ...stateWhere },
						orderBy: { updatedAt: "desc" },
						select: { businessUnitId: true, teamId: true },
					})
				: await this.db.companyBusinessUnitState.findFirst({
						where: { companyId: entityId, ...stateWhere },
						orderBy: { updatedAt: "desc" },
						select: { businessUnitId: true, teamId: true },
					});
		return {
			id: entityId,
			businessUnitId: state?.businessUnitId ?? DEFAULT_BUSINESS_UNIT_ID,
			teamId: state?.teamId ?? null,
		};
	}

	private async resolveLinkedDeal(
		input: AttributionEventInput,
		principal: EffectivePrincipal,
	): Promise<LinkedDeal | null> {
		const dealId =
			input.dealId ?? (input.entityType === "DEAL" ? input.entityId : null);
		if (!dealId) return null;
		await this.accessControl.assertRecord(
			principal,
			CRM_RESOURCE.deals,
			PermissionAction.READ,
			dealId,
		);
		const deal = await this.db.deal.findUnique({
			where: { id: dealId },
			select: {
				id: true,
				businessUnitId: true,
				teamId: true,
				pipelineId: true,
				stageId: true,
			},
		});
		if (!deal) throw new NotFoundException("Deal not found.");
		return deal;
	}

	private async validateReferences(
		input: AttributionEventInput,
		subject: Subject,
		linkedDeal: LinkedDeal | null,
		principal: EffectivePrincipal,
	) {
		const pipelineId = input.pipelineId ?? linkedDeal?.pipelineId ?? null;
		const pipelineStageId =
			input.pipelineStageId ?? linkedDeal?.stageId ?? null;
		if (pipelineId) {
			const pipelineScope = this.accessControl.configurationWhere(
				principal,
				CRM_RESOURCE.pipelines,
				PermissionAction.READ,
				true,
			);
			const pipeline = await this.db.pipeline.findFirst({
				where: { AND: [{ id: pipelineId, archivedAt: null }, pipelineScope] },
				select: { id: true, businessUnitId: true },
			});
			if (!pipeline)
				throw new NotFoundException("Pipeline not found in scope.");
			if (
				pipeline.businessUnitId &&
				pipeline.businessUnitId !== subject.businessUnitId
			) {
				throw new BadRequestException(
					"The pipeline belongs to another business unit.",
				);
			}
			if (pipelineStageId) {
				const stage = await this.db.pipelineStage.findFirst({
					where: { id: pipelineStageId, pipelineId },
					select: { id: true },
				});
				if (!stage) throw new NotFoundException("Pipeline stage not found.");
			}
		} else if (pipelineStageId) {
			throw new BadRequestException(
				"pipelineId is required when pipelineStageId is provided.",
			);
		}

		if (input.marketingFormId) {
			const scope = this.accessControl.configurationWhere(
				principal,
				CRM_RESOURCE.marketingForms,
				PermissionAction.READ,
				true,
			);
			const form = await this.db.marketingForm.findFirst({
				where: {
					AND: [{ id: input.marketingFormId, archivedAt: null }, scope],
				},
				select: { id: true },
			});
			if (!form)
				throw new NotFoundException("Marketing form not found in scope.");
		}
		if (input.marketingEventId) {
			const scope = this.accessControl.configurationWhere(
				principal,
				CRM_RESOURCE.marketingEvents,
				PermissionAction.READ,
				true,
			);
			const event = await this.db.marketingEvent.findFirst({
				where: {
					AND: [{ id: input.marketingEventId, archivedAt: null }, scope],
				},
				select: { id: true },
			});
			if (!event)
				throw new NotFoundException("Marketing event not found in scope.");
		}
		if (linkedDeal && linkedDeal.businessUnitId !== subject.businessUnitId) {
			throw new BadRequestException(
				"The deal belongs to another business unit.",
			);
		}
		return { pipelineId, pipelineStageId, dealId: linkedDeal?.id ?? null };
	}

	private async loadTouches(
		input: AttributionProjectionInput,
		subject: Subject,
		principal: EffectivePrincipal,
	): Promise<AttributionTouch[]> {
		const eventScope = this.eventWhere(principal);
		const events = await this.db.conversionAttributionEvent.findMany({
			where: {
				AND: [
					{ entityType: input.entityType, entityId: subject.id },
					eventScope,
				],
			},
			orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
			take: input.limit,
			select: conversionEventSelect,
		});
		const activities = await this.loadActivities(input, subject, principal);
		const submissions =
			input.entityType === "CONTACT"
				? await this.db.leadSubmission.findMany({
						where: {
							contactId: subject.id,
							...this.leadSubmissionWhere(principal),
						},
						orderBy: { receivedAt: "asc" },
						take: input.limit,
						select: leadSubmissionAttributionSelect,
					})
				: [];
		return [
			...events.map(conversionEventTouch),
			...activities.map((activity) =>
				activityTouch(activity, input.entityType),
			),
			...submissions.map((submission) => leadSubmissionTouch(submission)),
		];
	}

	private async loadActivities(
		input: AttributionProjectionInput,
		subject: Subject,
		principal: EffectivePrincipal,
	) {
		const anchor = await this.activityAnchor(input, subject, principal);
		return this.db.activity.findMany({
			where: {
				AND: [
					{
						type: {
							in: [
								ActivityType.FORM_CONVERSION,
								ActivityType.EVENT_ATTENDANCE,
								ActivityType.STAGE_CHANGE,
							],
						},
					},
					anchor,
					this.accessControl.activityWhere(
						principal,
						CRM_RESOURCE.activities,
						PermissionAction.READ,
					),
				],
			},
			orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
			take: input.limit,
			select: activityAttributionSelect,
		});
	}

	private async activityAnchor(
		input: AttributionProjectionInput,
		subject: Subject,
		principal: EffectivePrincipal,
	): Promise<Prisma.ActivityWhereInput> {
		if (input.entityType === "CONTACT") return { contactId: subject.id };
		if (input.entityType === "COMPANY") return { companyId: subject.id };
		if (input.entityType === "DEAL") return { dealId: subject.id };
		const account = await this.accounts.byId(subject.id, principal);
		const contactIds = account.contacts.map((row) => row.contactId);
		const companyIds = account.companies.map((row) => row.companyId);
		const dealIds = account.deals.map((row) => row.dealId);
		return {
			OR: [
				contactIds.length
					? { contactId: { in: contactIds } }
					: { id: { in: [] } },
				companyIds.length
					? { companyId: { in: companyIds } }
					: { id: { in: [] } },
				dealIds.length ? { dealId: { in: dealIds } } : { id: { in: [] } },
			],
		};
	}

	private eventWhere(
		principal: EffectivePrincipal,
	): Prisma.ConversionAttributionEventWhereInput {
		const scope = this.accessControl.assert(
			principal,
			CRM_RESOURCE.activities,
			PermissionAction.READ,
		);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED) {
			return principal.actorId
				? { actorId: principal.actorId }
				: { id: { in: [] } };
		}
		if (scope === AccessScope.TEAM)
			return { teamId: { in: principal.teamIds } };
		if (scope === AccessScope.MANAGED_TEAMS) {
			return { teamId: { in: principal.managedTeamIds } };
		}
		return {
			businessUnitId: {
				in:
					scope === AccessScope.BUSINESS_UNIT_TREE
						? principal.businessUnitTreeIds
						: principal.businessUnitIds,
			},
		};
	}

	private leadSubmissionWhere(principal: EffectivePrincipal) {
		const scope = this.accessControl.assert(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
		if (scope === AccessScope.ALL) return {};
		return { businessUnitId: { in: principal.businessUnitTreeIds } };
	}
}

function compareTouches(left: AttributionTouch, right: AttributionTouch) {
	const time = left.occurredAt.localeCompare(right.occurredAt);
	return time || left.id.localeCompare(right.id);
}

function uniqueValues(values: Array<string | null>): string[] {
	return [
		...new Set(values.filter((value): value is string => Boolean(value))),
	];
}
