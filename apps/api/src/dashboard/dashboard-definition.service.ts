import {
	AccessScope,
	DashboardDefinitionStatus,
	type Db,
	PermissionAction,
	type Prisma,
} from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { DashboardService } from "./dashboard.service";
import {
	type DashboardDefinitionCreateInput,
	type DashboardDefinitionDuplicateInput,
	type DashboardDefinitionListInput,
	type DashboardDefinitionUpdateInput,
	dashboardDefinitionSpec,
} from "./dashboard-definition.contracts";
import { writeDashboardDefinitionEvent } from "./dashboard-definition-events";
import {
	analyticsInputForDefinition,
	latestVersions,
	renderDefinition,
	serializeDefinition,
} from "./dashboard-definition-render";
import { standardDashboardTemplates } from "./dashboard-templates";

export type StoredDefinition = Prisma.DashboardDefinitionGetPayload<
	Record<string, never>
>;

@Injectable()
export class DashboardDefinitionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(DashboardService) private readonly dashboard: DashboardService,
	) {}

	async list(
		input: DashboardDefinitionListInput,
		principal: EffectivePrincipal,
	) {
		const scope = this.scope(principal, PermissionAction.READ);
		const rows = await this.db.dashboardDefinition.findMany({
			where: {
				AND: [
					scope,
					input.status
						? { status: input.status }
						: { status: { not: DashboardDefinitionStatus.ARCHIVED } },
					input.key ? { key: input.key } : {},
				],
			},
			orderBy: [{ key: "asc" }, { version: "desc" }],
		});
		const selected = input.includeVersions ? rows : latestVersions(rows);
		return selected.map(serializeDefinition);
	}

	async byId(id: string, principal: EffectivePrincipal) {
		const row = await this.findVisible(id, principal, PermissionAction.READ);
		return serializeDefinition(row);
	}

	templates(principal: EffectivePrincipal) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			PermissionAction.READ,
		);
		return standardDashboardTemplates();
	}

	async create(
		input: DashboardDefinitionCreateInput,
		principal: EffectivePrincipal,
	) {
		const businessUnitId =
			input.businessUnitId === undefined
				? principal.primaryBusinessUnitId
				: input.businessUnitId;
		await this.assertCanAssign(
			principal,
			PermissionAction.MANAGE,
			businessUnitId,
		);
		await this.assertKeyAvailable(input.key);
		const spec = dashboardDefinitionSpec.parse(input.spec);
		const row = await this.db.dashboardDefinition.create({
			data: {
				key: input.key,
				name: input.name,
				description: input.description ?? null,
				businessUnitId,
				spec: spec as Prisma.InputJsonValue,
				createdByType: principal.actorType,
				createdById: principal.actorId,
				updatedByType: principal.actorType,
				updatedById: principal.actorId,
			},
		});
		return serializeDefinition(row);
	}

	async update(
		input: DashboardDefinitionUpdateInput,
		principal: EffectivePrincipal,
	) {
		const current = await this.findVisible(
			input.id,
			principal,
			PermissionAction.MANAGE,
		);
		this.assertDraft(current);
		const spec = input.spec
			? dashboardDefinitionSpec.parse(input.spec)
			: undefined;
		const row = await this.db.dashboardDefinition.update({
			where: { id: current.id },
			data: {
				name: input.name,
				description: input.description,
				spec: spec as Prisma.InputJsonValue | undefined,
				updatedByType: principal.actorType,
				updatedById: principal.actorId,
			},
		});
		return serializeDefinition(row);
	}

	async duplicate(
		input: DashboardDefinitionDuplicateInput,
		principal: EffectivePrincipal,
	) {
		const source = await this.findVisible(
			input.id,
			principal,
			PermissionAction.READ,
		);
		await this.assertCanAssign(
			principal,
			PermissionAction.MANAGE,
			source.businessUnitId,
		);
		await this.assertKeyAvailable(input.key);
		const row = await this.db.dashboardDefinition.create({
			data: {
				key: input.key,
				name: input.name ?? `${source.name} copy`,
				description: source.description,
				businessUnitId: source.businessUnitId,
				spec: source.spec as Prisma.InputJsonValue,
				createdByType: principal.actorType,
				createdById: principal.actorId,
				updatedByType: principal.actorType,
				updatedById: principal.actorId,
			},
		});
		return serializeDefinition(row);
	}

	async version(id: string, principal: EffectivePrincipal) {
		const source = await this.findVisible(
			id,
			principal,
			PermissionAction.MANAGE,
		);
		await this.assertCanAssign(
			principal,
			PermissionAction.MANAGE,
			source.businessUnitId,
		);
		const latest = await this.db.dashboardDefinition.findFirst({
			where: { key: source.key },
			orderBy: { version: "desc" },
			select: { version: true },
		});
		const row = await this.db.dashboardDefinition.create({
			data: {
				key: source.key,
				name: source.name,
				description: source.description,
				businessUnitId: source.businessUnitId,
				spec: source.spec as Prisma.InputJsonValue,
				version: (latest?.version ?? source.version) + 1,
				createdByType: principal.actorType,
				createdById: principal.actorId,
				updatedByType: principal.actorType,
				updatedById: principal.actorId,
			},
		});
		return serializeDefinition(row);
	}

	async publish(id: string, principal: EffectivePrincipal) {
		const current = await this.findVisible(
			id,
			principal,
			PermissionAction.MANAGE,
		);
		this.assertDraft(current);
		const spec = dashboardDefinitionSpec.parse(current.spec);
		const row = await this.db.$transaction(async (tx) => {
			const previous = await tx.dashboardDefinition.findMany({
				where: {
					key: current.key,
					status: DashboardDefinitionStatus.PUBLISHED,
				},
				select: {
					id: true,
					key: true,
					version: true,
					businessUnitId: true,
				},
			});
			const publishedAt = new Date();
			await tx.dashboardDefinition.updateMany({
				where: {
					key: current.key,
					status: DashboardDefinitionStatus.PUBLISHED,
				},
				data: {
					status: DashboardDefinitionStatus.ARCHIVED,
					archivedAt: publishedAt,
				},
			});
			const published = await tx.dashboardDefinition.update({
				where: { id: current.id },
				data: {
					status: DashboardDefinitionStatus.PUBLISHED,
					publishedAt,
					archivedAt: null,
					spec: spec as Prisma.InputJsonValue,
					updatedByType: principal.actorType,
					updatedById: principal.actorId,
				},
			});
			for (const definition of previous) {
				await writeDashboardDefinitionEvent(
					tx,
					definition,
					"archived",
					principal,
				);
			}
			await writeDashboardDefinitionEvent(
				tx,
				published,
				"published",
				principal,
			);
			return published;
		});
		return serializeDefinition(row);
	}

	async archive(id: string, principal: EffectivePrincipal) {
		const current = await this.findVisible(
			id,
			principal,
			PermissionAction.MANAGE,
		);
		const row = await this.db.$transaction(async (tx) => {
			const archived = await tx.dashboardDefinition.update({
				where: { id: current.id },
				data: {
					status: DashboardDefinitionStatus.ARCHIVED,
					archivedAt: new Date(),
					updatedByType: principal.actorType,
					updatedById: principal.actorId,
				},
			});
			await writeDashboardDefinitionEvent(tx, archived, "archived", principal);
			return archived;
		});
		return serializeDefinition(row);
	}

	async render(id: string, principal: EffectivePrincipal) {
		const definition = await this.findVisible(
			id,
			principal,
			PermissionAction.READ,
		);
		return this.renderSpec(
			definition.id,
			definition.spec,
			principal,
			definition,
		);
	}

	async renderSpec(
		id: string,
		storedSpec: unknown,
		principal: EffectivePrincipal,
		definition: Pick<StoredDefinition, "id" | "key" | "version" | "status"> = {
			id,
			key: id,
			version: 1,
			status: DashboardDefinitionStatus.DRAFT,
		},
	) {
		const spec = dashboardDefinitionSpec.parse(storedSpec);
		const contactPermission = this.accessControl.permission(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
		const analytics = await this.dashboard.analytics(
			principal,
			principal.userId ?? "",
			analyticsInputForDefinition(spec),
			this.accessControl.dealWhere(
				principal,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			),
			this.accessControl.activityWhere(
				principal,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
			this.accessControl.configurationWhere(
				principal,
				CRM_RESOURCE.pipelines,
				PermissionAction.READ,
				true,
			),
			contactPermission === AccessScope.NONE
				? { id: { in: [] } }
				: this.accessControl.contactWhere(
						principal,
						CRM_RESOURCE.contacts,
						PermissionAction.READ,
					),
		);
		return renderDefinition(definition, spec, analytics);
	}

	private async findVisible(
		id: string,
		principal: EffectivePrincipal,
		action: PermissionAction,
	) {
		const row = await this.db.dashboardDefinition.findFirst({
			where: { AND: [{ id }, this.scope(principal, action)] },
		});
		if (!row) throw new NotFoundException("Dashboard is not in your scope.");
		return row;
	}

	private scope(principal: EffectivePrincipal, action: PermissionAction) {
		const scope = this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			action,
		);
		if (scope === AccessScope.ALL) return {};
		if (scope === AccessScope.OWNED) {
			return { createdById: principal.userId ?? "__none__" };
		}
		if (scope === AccessScope.TEAM || scope === AccessScope.MANAGED_TEAMS) {
			return { id: { in: [] } };
		}
		const businessUnitIds =
			scope === AccessScope.BUSINESS_UNIT
				? principal.businessUnitIds
				: principal.businessUnitTreeIds;
		return {
			OR: [
				{ businessUnitId: null },
				{ businessUnitId: { in: businessUnitIds } },
			],
		};
	}

	private async assertCanAssign(
		principal: EffectivePrincipal,
		action: PermissionAction,
		businessUnitId: string | null,
	) {
		await this.accessControl.assertAssignment(
			principal,
			CRM_RESOURCE.dashboards,
			action,
			{
				businessUnitId,
			},
		);
	}

	private async assertKeyAvailable(key: string) {
		const exists = await this.db.dashboardDefinition.findFirst({
			where: { key, status: { not: DashboardDefinitionStatus.ARCHIVED } },
			select: { id: true },
		});
		if (exists)
			throw new ConflictException(`Dashboard key ${key} already exists.`);
	}

	private assertDraft(row: StoredDefinition) {
		if (row.status !== DashboardDefinitionStatus.DRAFT) {
			throw new BadRequestException(
				"Only a draft dashboard can be edited or published.",
			);
		}
	}
}
export { analyticsInputForDefinition, renderDefinition };
