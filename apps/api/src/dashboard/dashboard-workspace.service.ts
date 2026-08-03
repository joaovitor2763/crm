import {
	AccessScope,
	DashboardVisibility,
	type Db,
	PermissionAction,
	type Prisma,
} from "@crm/db";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { InjectDatabase } from "../database/database.constants";
import { dashboardDefinitionSpec } from "./dashboard-definition.contracts";
import { DashboardDefinitionService } from "./dashboard-definition.service";
import type {
	DashboardWidgetCreateInput,
	DashboardWidgetLayoutInput,
	DashboardWidgetUpdateInput,
	DashboardWorkspaceCreateInput,
	DashboardWorkspaceListInput,
	DashboardWorkspaceUpdateInput,
} from "./dashboard-workspace.contracts";

@Injectable()
export class DashboardWorkspaceService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(DashboardDefinitionService)
		private readonly definitions: DashboardDefinitionService,
	) {}

	async list(
		input: DashboardWorkspaceListInput,
		principal: EffectivePrincipal,
		userId: string,
	) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			PermissionAction.READ,
		);
		const scope =
			input.scope === "mine"
				? { ownerId: userId }
				: input.scope === "public"
					? { visibility: DashboardVisibility.PUBLIC }
					: {
							OR: [
								{ ownerId: userId },
								{ visibility: DashboardVisibility.PUBLIC },
							],
						};
		const search: Prisma.DashboardWhereInput = input.q
			? {
					OR: [
						{ name: { contains: input.q, mode: "insensitive" } },
						{
							description: {
								contains: input.q,
								mode: "insensitive",
							},
						},
					],
				}
			: {};
		// Keep audience and search in separate AND branches. Spreading the two
		// OR clauses together would let a search expose somebody else's private
		// dashboard.
		const where: Prisma.DashboardWhereInput = {
			AND: [{ archivedAt: null }, scope, search],
		};
		const [rows, total] = await Promise.all([
			this.db.dashboard.findMany({
				where,
				orderBy: { updatedAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
				include: {
					owner: { select: { id: true, name: true, image: true } },
					_count: { select: { widgets: true } },
				},
			}),
			this.db.dashboard.count({ where }),
		]);
		return { rows, total };
	}

	async byId(id: string, principal: EffectivePrincipal, userId: string) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			PermissionAction.READ,
		);
		const row = await this.db.dashboard.findFirst({
			where: {
				id,
				archivedAt: null,
				OR: [{ ownerId: userId }, { visibility: DashboardVisibility.PUBLIC }],
			},
			include: {
				owner: { select: { id: true, name: true, image: true } },
				widgets: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
			},
		});
		if (!row) throw new NotFoundException("Dashboard not found.");
		return {
			...row,
			canEdit: await this.canEdit(row.ownerId, principal, userId),
		};
	}

	create(
		input: DashboardWorkspaceCreateInput,
		principal: EffectivePrincipal,
		userId: string,
	) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			PermissionAction.READ,
		);
		return this.db.dashboard.create({
			data: {
				...input,
				description: input.description ?? null,
				ownerId: userId,
			},
		});
	}

	async update(
		input: DashboardWorkspaceUpdateInput,
		principal: EffectivePrincipal,
		userId: string,
	) {
		const current = await this.editable(input.id, principal, userId);
		const { id: _id, ...data } = input;
		return this.db.dashboard.update({ where: { id: current.id }, data });
	}

	async archive(id: string, principal: EffectivePrincipal, userId: string) {
		const current = await this.editable(id, principal, userId);
		return this.db.dashboard.update({
			where: { id: current.id },
			data: { archivedAt: new Date() },
		});
	}

	async addWidget(
		input: DashboardWidgetCreateInput,
		principal: EffectivePrincipal,
		userId: string,
	) {
		await this.editable(input.dashboardId, principal, userId);
		const last = await this.db.dashboardWidget.aggregate({
			where: { dashboardId: input.dashboardId },
			_max: { position: true },
		});
		return this.db.dashboardWidget.create({
			data: {
				dashboardId: input.dashboardId,
				title: input.title,
				description: input.description ?? null,
				spec: dashboardDefinitionSpec.parse(
					input.spec,
				) as Prisma.InputJsonValue,
				position: (last._max.position ?? -1) + 1,
				width: input.width,
			},
		});
	}

	async updateWidget(
		input: DashboardWidgetUpdateInput,
		principal: EffectivePrincipal,
		userId: string,
	) {
		const current = await this.db.dashboardWidget.findUnique({
			where: { id: input.id },
			select: { id: true, dashboardId: true },
		});
		if (!current) throw new NotFoundException("Dashboard widget not found.");
		await this.editable(current.dashboardId, principal, userId);
		const { id: _id, spec, ...data } = input;
		return this.db.dashboardWidget.update({
			where: { id: current.id },
			data: {
				...data,
				...(spec !== undefined && {
					spec: dashboardDefinitionSpec.parse(spec) as Prisma.InputJsonValue,
				}),
			},
		});
	}

	async updateLayout(
		input: DashboardWidgetLayoutInput,
		principal: EffectivePrincipal,
		userId: string,
	) {
		await this.editable(input.dashboardId, principal, userId);
		const ids = input.widgets.map((widget) => widget.id);
		const count = await this.db.dashboardWidget.count({
			where: { dashboardId: input.dashboardId, id: { in: ids } },
		});
		if (count !== ids.length)
			throw new NotFoundException("One or more dashboard widgets are invalid.");
		await this.db.$transaction(
			input.widgets.map((widget) =>
				this.db.dashboardWidget.update({
					where: { id: widget.id },
					data: {
						position: widget.position,
						width: widget.width,
						...(widget.height !== undefined && { height: widget.height }),
					},
				}),
			),
		);
		return { updated: count };
	}

	async removeWidget(
		id: string,
		principal: EffectivePrincipal,
		userId: string,
	) {
		const current = await this.db.dashboardWidget.findUnique({
			where: { id },
			select: { dashboardId: true },
		});
		if (!current) throw new NotFoundException("Dashboard widget not found.");
		await this.editable(current.dashboardId, principal, userId);
		return this.db.dashboardWidget.delete({ where: { id } });
	}

	async renderWidget(
		id: string,
		principal: EffectivePrincipal,
		userId: string,
	) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			PermissionAction.READ,
		);
		const widget = await this.db.dashboardWidget.findFirst({
			where: {
				id,
				dashboard: {
					archivedAt: null,
					OR: [{ ownerId: userId }, { visibility: DashboardVisibility.PUBLIC }],
				},
			},
		});
		if (!widget) throw new NotFoundException("Dashboard widget not found.");
		return this.definitions.renderSpec(widget.id, widget.spec, principal);
	}

	private async editable(
		id: string,
		principal: EffectivePrincipal,
		userId: string,
	) {
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.dashboards,
			PermissionAction.READ,
		);
		const row = await this.db.dashboard.findFirst({
			where: { id, archivedAt: null },
			select: { id: true, ownerId: true },
		});
		if (!row || !(await this.canEdit(row.ownerId, principal, userId))) {
			throw new NotFoundException("Editable dashboard not found.");
		}
		return row;
	}

	private canEdit(
		ownerId: string,
		principal: EffectivePrincipal,
		userId: string,
	) {
		if (ownerId === userId) return true;
		return (
			this.accessControl.permission(
				principal,
				CRM_RESOURCE.dashboards,
				PermissionAction.MANAGE,
			) === AccessScope.ALL
		);
	}
}
