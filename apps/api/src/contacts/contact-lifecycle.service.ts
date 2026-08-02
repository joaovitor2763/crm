import { AuditActorType, type Db, LifecycleStage } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import type { ContactLifecycleInput } from "./contacts.contracts";

const STAGE_RANK: Record<LifecycleStage, number> = {
	[LifecycleStage.DISQUALIFIED]: 0,
	[LifecycleStage.LEAD]: 1,
	[LifecycleStage.MQL]: 2,
	[LifecycleStage.SQL]: 3,
	[LifecycleStage.OPPORTUNITY]: 4,
	[LifecycleStage.CUSTOMER]: 5,
};

@Injectable()
export class ContactLifecycleService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async setLifecycle(
		input: ContactLifecycleInput,
		actor: EffectivePrincipal,
		context?: { causationId: string; depth: number },
	) {
		return this.db.$transaction(async (tx) => {
			const [contact, businessUnit, current, team] = await Promise.all([
				tx.contact.findUnique({
					where: { id: input.contactId },
					select: { id: true, archivedAt: true },
				}),
				tx.businessUnit.findUnique({
					where: { id: input.businessUnitId },
					select: { id: true, archivedAt: true },
				}),
				tx.contactBusinessUnitState.findUnique({
					where: {
						contactId_businessUnitId: {
							contactId: input.contactId,
							businessUnitId: input.businessUnitId,
						},
					},
					select: {
						id: true,
						lifecycleStage: true,
						marketingQualifiedAt: true,
						marketingQualifiedReason: true,
						marketingQualifiedById: true,
						teamId: true,
						ownerId: true,
					},
				}),
				input.teamId
					? tx.team.findUnique({
							where: { id: input.teamId },
							select: { id: true, businessUnitId: true, archivedAt: true },
						})
					: null,
			]);

			if (!contact || contact.archivedAt) {
				throw new NotFoundException(
					`No active contact with id ${input.contactId}.`,
				);
			}
			if (!businessUnit || businessUnit.archivedAt) {
				throw new NotFoundException(
					`No active business unit with id ${input.businessUnitId}.`,
				);
			}
			if (
				input.teamId &&
				(!team ||
					team.archivedAt ||
					team.businessUnitId !== input.businessUnitId)
			) {
				throw new BadRequestException(
					"The selected team must belong to the contact's business unit.",
				);
			}

			const now = new Date();
			const wasQualified = current
				? STAGE_RANK[current.lifecycleStage] >= STAGE_RANK[LifecycleStage.MQL]
				: false;
			const isQualified =
				STAGE_RANK[input.lifecycleStage] >= STAGE_RANK[LifecycleStage.MQL];
			const newlyQualified = isQualified && !wasQualified;
			const qualificationReason = newlyQualified
				? (input.qualificationReason ?? "Qualified by lifecycle transition")
				: (input.qualificationReason ??
					current?.marketingQualifiedReason ??
					null);
			const qualifiedAt = newlyQualified
				? now
				: (current?.marketingQualifiedAt ?? null);
			const qualifiedById = newlyQualified
				? actor.userId
				: (current?.marketingQualifiedById ?? null);

			const state = await tx.contactBusinessUnitState.upsert({
				where: {
					contactId_businessUnitId: {
						contactId: input.contactId,
						businessUnitId: input.businessUnitId,
					},
				},
				create: {
					contactId: input.contactId,
					businessUnitId: input.businessUnitId,
					teamId: input.teamId ?? null,
					ownerId: input.ownerId ?? actor.userId,
					lifecycleStage: input.lifecycleStage,
					marketingScore: input.marketingScore ?? null,
					marketingQualifiedAt: qualifiedAt,
					marketingQualifiedReason: qualificationReason,
					marketingQualifiedById: qualifiedById,
				},
				update: {
					lifecycleStage: input.lifecycleStage,
					...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
					...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
					...(input.marketingScore !== undefined
						? { marketingScore: input.marketingScore }
						: {}),
					marketingQualifiedAt: qualifiedAt,
					marketingQualifiedReason: qualificationReason,
					marketingQualifiedById: qualifiedById,
				},
				select: {
					id: true,
					contactId: true,
					businessUnitId: true,
					teamId: true,
					ownerId: true,
					lifecycleStage: true,
					marketingScore: true,
					marketingQualifiedAt: true,
					marketingQualifiedReason: true,
					updatedAt: true,
				},
			});

			const states = await tx.contactBusinessUnitState.findMany({
				where: { contactId: input.contactId, archivedAt: null },
				select: {
					lifecycleStage: true,
					marketingScore: true,
					marketingQualifiedAt: true,
					marketingQualifiedReason: true,
					marketingQualifiedById: true,
				},
			});
			const global = consolidate(states);
			await tx.contact.update({
				where: { id: input.contactId },
				data: {
					globalLifecycleStage: global.lifecycleStage,
					globalMarketingScore: global.marketingScore,
					globallyMarketingQualifiedAt: global.qualifiedAt,
					globallyMarketingQualifiedReason: global.qualificationReason,
					globallyMarketingQualifiedById: global.qualifiedById,
				},
			});

			const payload = {
				from: current?.lifecycleStage ?? null,
				to: input.lifecycleStage,
				newlyQualified,
				globalLifecycleStage: global.lifecycleStage,
			};
			const event = await tx.domainEvent.create({
				data: {
					eventKey: `contact-lifecycle:${state.id}:${state.updatedAt.toISOString()}`,
					type: newlyQualified
						? "contact.became_mql"
						: "contact.lifecycle_changed",
					resource: "contacts",
					recordId: input.contactId,
					businessUnitId: input.businessUnitId,
					teamId: state.teamId,
					actorType: actor.actorType,
					actorId: actor.actorId,
					payload,
					causationId: context?.causationId,
					depth: context?.depth ?? 0,
				},
				select: { id: true },
			});
			await tx.auditEvent.create({
				data: {
					actorType: actor.actorType,
					actorId: actor.actorId,
					action: newlyQualified
						? "contact.became-mql"
						: "contact.lifecycle-updated",
					resource: "contacts",
					recordId: input.contactId,
					businessUnitId: input.businessUnitId,
					teamId: state.teamId,
					metadata: { ...payload, domainEventId: event.id },
				},
			});

			return {
				...state,
				marketingScore: state.marketingScore?.toString() ?? null,
				marketingQualifiedAt: state.marketingQualifiedAt?.toISOString() ?? null,
				globalLifecycleStage: global.lifecycleStage,
				globalMarketingScore: global.marketingScore,
				newlyQualified,
			};
		});
	}
}

type UnitState = {
	lifecycleStage: LifecycleStage;
	marketingScore: { toString(): string } | null;
	marketingQualifiedAt: Date | null;
	marketingQualifiedReason: string | null;
	marketingQualifiedById: string | null;
};

function consolidate(states: UnitState[]): {
	lifecycleStage: LifecycleStage;
	marketingScore: string | null;
	qualifiedAt: Date | null;
	qualificationReason: string | null;
	qualifiedById: string | null;
} {
	const highest = states.reduce<UnitState | null>((best, state) => {
		if (
			!best ||
			STAGE_RANK[state.lifecycleStage] > STAGE_RANK[best.lifecycleStage]
		) {
			return state;
		}
		return best;
	}, null);
	const qualifications = states
		.filter((state) => state.marketingQualifiedAt)
		.toSorted(
			(left, right) =>
				(left.marketingQualifiedAt?.getTime() ?? 0) -
				(right.marketingQualifiedAt?.getTime() ?? 0),
		);
	const firstQualification = qualifications[0] ?? null;
	const scores = states.flatMap((state) =>
		state.marketingScore ? [Number(state.marketingScore.toString())] : [],
	);
	const maxScore = scores.length > 0 ? Math.max(...scores) : null;

	return {
		lifecycleStage: highest?.lifecycleStage ?? LifecycleStage.LEAD,
		marketingScore: maxScore === null ? null : String(maxScore),
		qualifiedAt: firstQualification?.marketingQualifiedAt ?? null,
		qualificationReason: firstQualification?.marketingQualifiedReason ?? null,
		qualifiedById: firstQualification?.marketingQualifiedById ?? null,
	};
}

export function automatedPrincipal(input: {
	id: string;
	roleId: string;
}): Pick<EffectivePrincipal, "actorType" | "actorId" | "roleId"> {
	return {
		actorType: AuditActorType.AUTOMATION,
		actorId: input.id,
		roleId: input.roleId,
	};
}
