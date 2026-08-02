import { describe, expect, it } from "bun:test";
import {
	AccessScope,
	AuditActorType,
	DashboardDefinitionStatus,
} from "@crm/db";
import {
	dashboardDefinitionPublishInput,
	dashboardDefinitionSpec,
} from "../src/dashboard/dashboard-definition.contracts";
import {
	analyticsInputForDefinition,
	DashboardDefinitionService,
	renderDefinition,
} from "../src/dashboard/dashboard-definition.service";
import { standardDashboardTemplates } from "../src/dashboard/dashboard-templates";

describe("dashboard definition contract", () => {
	it("ships standard revenue views as provider-neutral templates", () => {
		const templates = standardDashboardTemplates();
		expect(templates.map((template) => template.key)).toEqual([
			"conversion-rate",
			"conversion-time",
			"stage-rates",
			"stage-times",
			"channel-performance",
			"owner-performance",
			"utm-performance",
			"deal-attribute-performance",
			"macro-bowtie",
		]);
		for (const template of templates)
			expect(dashboardDefinitionSpec.parse(template.spec)).toBeTruthy();
	});

	it("requires an attribute key for governed deal-attribute cuts", () => {
		const result = dashboardDefinitionSpec.safeParse({
			metric: "breakdown",
			population: "deals",
			groupBy: ["dealAttribute"],
		});
		expect(result.success).toBe(false);
	});

	it("requires explicit confirmation before an API publish", () => {
		expect(
			dashboardDefinitionPublishInput.safeParse({ id: "dashboard-1" }).success,
		).toBe(false);
		expect(
			dashboardDefinitionPublishInput.parse({
				id: "dashboard-1",
				confirmed: true,
			}),
		).toEqual({ id: "dashboard-1", confirmed: true });
	});

	it("maps only supported analytics dimensions to the query contract", () => {
		const spec = dashboardDefinitionSpec.parse({
			metric: "conversionRate",
			population: "deals",
			groupBy: ["pipeline", "owner"],
		});
		expect(analyticsInputForDefinition(spec)).toMatchObject({
			scope: "everyone",
			dimensions: ["owner"],
		});
	});

	it("keeps ChartCDN JSON serializable while honoring visualization options", () => {
		const spec = dashboardDefinitionSpec.parse({
			metric: "conversionRate",
			population: "deals",
			visualization: "line",
			options: { spanGaps: true },
		});
		const result = renderDefinition(
			{
				id: "dashboard-1",
				key: "conversion-rate",
				version: 2,
				status: "PUBLISHED",
			},
			spec,
			{
				window: {
					from: "2026-01-01T00:00:00.000Z",
					to: "2026-02-01T00:00:00.000Z",
				},
				dealCount: 1,
				comparison: { requested: "none", supported: true },
				views: [
					{
						key: "timeSeries",
						title: "Conversion over time",
						description: "Time series",
						chart: {
							type: "line",
							data: {
								labels: ["2026-01"],
								datasets: [{ label: "Conversion", data: [1] }],
							},
						},
						rows: [
							{ period: "2026-01", created: 1, won: 1, conversionRate: 1 },
						],
					},
				],
				attribution: [],
			},
		);
		expect(result.chart.type).toBe("line");
		expect(result.chart.options).toMatchObject({ spanGaps: true });
		expect(JSON.stringify(result)).not.toContain("undefined");
	});

	it("renders stage time from elapsed-day rows instead of conversion rates", () => {
		const spec = dashboardDefinitionSpec.parse({
			metric: "stageTime",
			population: "deals",
			visualization: "bar",
		});
		const result = renderDefinition(
			{
				id: "dashboard-2",
				key: "stage-times",
				version: 1,
				status: "PUBLISHED",
			},
			spec,
			{
				window: {
					from: "2026-01-01T00:00:00.000Z",
					to: "2026-02-01T00:00:00.000Z",
				},
				dealCount: 2,
				comparison: { requested: "none", supported: true },
				views: [
					{
						key: "stagePerformance",
						title: "Stage performance",
						description: "Stages",
						chart: {
							type: "bar",
							data: {
								labels: ["Discovery → Qualified"],
								datasets: [{ label: "Rate", data: [0.5] }],
							},
						},
						rows: [
							{
								fromStage: "Discovery",
								toStage: "Qualified",
								conversionRate: 0.5,
								avgDays: 4.25,
							},
						],
					},
				],
				attribution: [],
			},
		);
		expect(result.chart.data.datasets[0]?.data).toEqual([4.25]);
		expect(result.chart.data.datasets[0]?.label).toBe(
			"Average days between stages",
		);
	});

	it("writes publish and archive outbox events in the definition transaction", async () => {
		const events: Array<{ create: Record<string, unknown> }> = [];
		const calls: string[] = [];
		const draft = definitionRow({
			id: "dashboard-draft",
			key: "pipeline",
			version: 2,
			status: DashboardDefinitionStatus.DRAFT,
		});
		const previous = definitionRow({
			id: "dashboard-published",
			key: "pipeline",
			version: 1,
			status: DashboardDefinitionStatus.PUBLISHED,
		});
		const tx = {
			dashboardDefinition: {
				findMany: async () => [previous],
				updateMany: async () => {
					calls.push("archive-previous");
					return { count: 1 };
				},
				update: async ({ data }: { data: Record<string, unknown> }) => {
					calls.push("publish-current");
					return {
						...draft,
						...data,
						status: DashboardDefinitionStatus.PUBLISHED,
					};
				},
			},
			domainEvent: {
				upsert: async (args: { create: Record<string, unknown> }) => {
					calls.push(`event:${String(args.create.type)}`);
					events.push(args);
					return args.create;
				},
			},
		};
		const db = {
			dashboardDefinition: { findFirst: async () => draft },
			$transaction: async (callback: (transaction: typeof tx) => unknown) =>
				callback(tx),
		} as never;
		const service = new DashboardDefinitionService(
			db,
			{ assert: () => AccessScope.ALL } as never,
			{} as never,
		);

		await service.publish("dashboard-draft", principal());

		expect(calls).toEqual([
			"archive-previous",
			"publish-current",
			"event:dashboard-definition.archived",
			"event:dashboard-definition.published",
		]);
		expect(events.map((event) => event.create.eventKey)).toEqual([
			"dashboard-definition.archived:dashboard-published:1",
			"dashboard-definition.published:dashboard-draft:2",
		]);
		expect(events[1]?.create.payload).toEqual({
			key: "pipeline",
			version: 2,
			status: "PUBLISHED",
		});
	});

	it("archives a definition and emits an idempotent archive event", async () => {
		const events: Array<{ create: Record<string, unknown> }> = [];
		const published = definitionRow({
			id: "dashboard-published",
			key: "pipeline",
			version: 3,
			status: DashboardDefinitionStatus.PUBLISHED,
		});
		const tx = {
			dashboardDefinition: {
				update: async ({ data }: { data: Record<string, unknown> }) => ({
					...published,
					...data,
				}),
			},
			domainEvent: {
				upsert: async (args: { create: Record<string, unknown> }) => {
					events.push(args);
					return args.create;
				},
			},
		};
		const db = {
			dashboardDefinition: { findFirst: async () => published },
			$transaction: async (callback: (transaction: typeof tx) => unknown) =>
				callback(tx),
		} as never;
		const service = new DashboardDefinitionService(
			db,
			{ assert: () => AccessScope.ALL } as never,
			{} as never,
		);

		await service.archive("dashboard-published", principal());

		expect(events).toHaveLength(1);
		expect(events[0]?.create).toMatchObject({
			eventKey: "dashboard-definition.archived:dashboard-published:3",
			payload: { key: "pipeline", version: 3, status: "ARCHIVED" },
		});
	});

	it("keeps business-unit scope bounded and does not invent team scope", async () => {
		let where: { AND: Array<unknown> } | undefined;
		const db = {
			dashboardDefinition: {
				findMany: async (args: { where: { AND: Array<unknown> } }) => {
					where = args.where;
					return [];
				},
			},
		} as never;
		const access = {
			assert: (_principal: unknown, _resource: unknown, _action: unknown) =>
				AccessScope.BUSINESS_UNIT,
		} as {
			assert: (
				_principal: unknown,
				_resource: unknown,
				_action: unknown,
			) => AccessScope;
		};
		const service = new DashboardDefinitionService(
			db,
			access as never,
			{} as never,
		);
		await service.list({ includeVersions: false }, principal());
		expect(where?.AND[0]).toEqual({
			OR: [
				{ businessUnitId: null },
				{ businessUnitId: { in: ["business-unit-root"] } },
			],
		});

		access.assert = () => AccessScope.TEAM;
		await service.list({ includeVersions: false }, principal());
		expect(where?.AND[0]).toEqual({ id: { in: [] } });
	});
});

function principal() {
	return {
		actorType: AuditActorType.USER,
		actorId: "user-1",
		userId: "user-1",
		roleId: "role-1",
		roleKey: "sales-manager",
		isAdmin: false,
		status: "ACTIVE",
		primaryBusinessUnitId: "business-unit-root",
		primaryTeamId: null,
		businessUnitIds: ["business-unit-root"],
		businessUnitTreeIds: ["business-unit-root", "business-unit-child"],
		teamIds: [],
		managedTeamIds: [],
		teamAssignments: [],
		ownerAssignments: [],
		permissions: [],
		fieldPermissions: [],
	} as never;
}

function definitionRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "dashboard-1",
		key: "pipeline",
		name: "Pipeline",
		description: null,
		version: 1,
		status: DashboardDefinitionStatus.DRAFT,
		spec: { metric: "conversionRate", population: "deals" },
		businessUnitId: "business-unit-root",
		createdByType: AuditActorType.USER,
		createdById: "user-1",
		updatedByType: AuditActorType.USER,
		updatedById: "user-1",
		publishedAt: null,
		archivedAt: null,
		createdAt: new Date("2026-08-01T00:00:00.000Z"),
		updatedAt: new Date("2026-08-01T00:00:00.000Z"),
		...overrides,
	} as Record<string, unknown>;
}
