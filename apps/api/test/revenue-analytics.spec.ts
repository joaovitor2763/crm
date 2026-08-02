import { describe, expect, it } from "bun:test";
import { PipelineStageType } from "@crm/db";
import {
	type AnalyticsActivity,
	type AnalyticsDeal,
	type AnalyticsPipeline,
	buildRevenueAnalytics,
} from "../src/dashboard/analytics";
import { dashboardAnalyticsInput } from "../src/dashboard/analytics.contracts";
import { DashboardService } from "../src/dashboard/dashboard.service";
import {
	inferPipelineFunnelType,
	validateBlueprintTransition,
	validatePipelineBlueprint,
} from "../src/pipelines/pipeline-blueprint";
import { pipelineBlueprintInput } from "../src/pipelines/pipelines-blueprint.contracts";

const stages = {
	discovery: {
		key: "discovery",
		position: 0,
		type: PipelineStageType.OPEN,
		allowedRoles: ["sdr", "closer"] as const,
		responsibleRole: "sdr" as const,
	},
	qualified: {
		key: "qualified",
		position: 1,
		type: PipelineStageType.OPEN,
		allowedRoles: ["closer"] as const,
		responsibleRole: "closer" as const,
	},
	won: {
		key: "won",
		position: 2,
		type: PipelineStageType.WON,
		allowedRoles: ["account_manager"] as const,
		responsibleRole: "account_manager" as const,
	},
	lost: {
		key: "lost",
		position: 3,
		type: PipelineStageType.LOST,
		allowedRoles: ["closer"] as const,
		responsibleRole: "closer" as const,
	},
};

const blueprint = {
	type: "full_bowtie" as const,
	stages: Object.values(stages),
	handovers: [
		{
			fromStage: "discovery",
			toStage: "qualified",
			fromRole: "sdr" as const,
			toRole: "closer" as const,
		},
		{
			fromStage: "qualified",
			toStage: "won",
			fromRole: "closer" as const,
			toRole: "account_manager" as const,
		},
	],
};

describe("revenue pipeline blueprint", () => {
	it("validates full bowtie roles and explicit handovers", () => {
		expect(validatePipelineBlueprint(blueprint)).toMatchObject({ valid: true });
		expect(
			validateBlueprintTransition(blueprint, {
				fromStage: "discovery",
				toStage: "qualified",
				actingRole: "sdr",
				handoverToRole: "closer",
			}),
		).toMatchObject({ valid: true });
	});

	it("rejects a role transition without a matching handover", () => {
		const invalid = {
			...blueprint,
			handovers: blueprint.handovers.slice(0, 1),
		};
		const result = validateBlueprintTransition(invalid, {
			fromStage: "qualified",
			toStage: "won",
			actingRole: "closer",
			handoverToRole: "account_manager",
		});
		expect(result.valid).toBe(false);
		expect(result.errors.map((error) => error.message).join(" ")).toContain(
			"explicit handover",
		);
	});

	it("infers stored topology and parses the serializable contract", () => {
		expect(inferPipelineFunnelType(Object.values(stages))).toBe("full_bowtie");
		for (const type of [
			"left_side",
			"right_side",
			"custom",
			"side_bowtie",
		] as const) {
			expect(
				pipelineBlueprintInput.safeParse({
					type,
					stages: [stages.discovery],
					handovers: [],
				}).success,
			).toBe(true);
		}
	});
});

const pipeline: AnalyticsPipeline = {
	id: "pipeline-1",
	name: "Revenue",
	stages: [
		{
			id: "stage-discovery",
			name: "Discovery",
			position: 0,
			type: PipelineStageType.OPEN,
		},
		{
			id: "stage-qualified",
			name: "Qualified",
			position: 1,
			type: PipelineStageType.OPEN,
		},
		{ id: "stage-won", name: "Won", position: 2, type: PipelineStageType.WON },
		{
			id: "stage-lost",
			name: "Lost",
			position: 3,
			type: PipelineStageType.LOST,
		},
	],
};

function stageAt(index: number) {
	const stage = pipeline.stages[index];
	if (!stage) throw new Error(`Missing fixture stage at ${index}.`);
	return stage;
}

const deals: AnalyticsDeal[] = [
	{
		id: "deal-won",
		pipelineId: pipeline.id,
		stage: stageAt(2),
		owner: { id: "seller-1", name: "Closer One" },
		createdAt: "2026-01-01T00:00:00.000Z",
		closedAt: "2026-01-06T00:00:00.000Z",
		amountCents: 100_00,
		customValues: { segment: "enterprise" },
		contacts: [
			{
				utmSource: "google",
				utmMedium: "cpc",
				utmCampaign: "launch",
				utmTerm: null,
				utmContent: null,
			},
		],
	},
	{
		id: "deal-lost",
		pipelineId: pipeline.id,
		stage: stageAt(3),
		owner: { id: "seller-2", name: "Closer Two" },
		createdAt: "2026-01-01T00:00:00.000Z",
		closedAt: "2026-01-04T00:00:00.000Z",
		amountCents: 50_00,
		customValues: { segment: "smb" },
		contacts: [],
	},
];

const activities: AnalyticsActivity[] = [
	{
		dealId: "deal-won",
		type: "STAGE_CHANGE",
		occurredAt: "2026-01-03T00:00:00.000Z",
		createdAt: "2026-01-03T00:00:00.000Z",
		meta: { fromId: "stage-discovery", toId: "stage-qualified" },
	},
	{
		dealId: "deal-won",
		type: "STAGE_CHANGE",
		occurredAt: "2026-01-06T00:00:00.000Z",
		createdAt: "2026-01-06T00:00:00.000Z",
		meta: { fromId: "stage-qualified", toId: "stage-won" },
	},
	{
		dealId: "deal-won",
		type: "FORM_CONVERSION",
		occurredAt: "2026-01-02T00:00:00.000Z",
		createdAt: "2026-01-02T00:00:00.000Z",
		meta: {
			utmSource: "linkedin",
			utmMedium: "paid-social",
			utmCampaign: "retargeting",
		},
	},
	{
		dealId: "deal-lost",
		type: "STAGE_CHANGE",
		occurredAt: "2026-01-04T00:00:00.000Z",
		createdAt: "2026-01-04T00:00:00.000Z",
		meta: { fromId: "stage-discovery", toId: "stage-lost" },
	},
];

describe("revenue analytics definitions", () => {
	it("builds funnel, elapsed-time and attribution views from existing rows", () => {
		const result = buildRevenueAnalytics([pipeline], deals, activities, {
			from: "2025-12-01T00:00:00.000Z",
			to: "2026-02-01T00:00:00.000Z",
			limit: 25,
			dimensions: ["channel", "owner", "utmSource", "dealAttribute"],
			attributeKey: "segment",
		});
		const funnel = result.views.find(
			(view) => view.title === "Conversion funnel",
		);
		expect(funnel?.rows).toContainEqual(
			expect.objectContaining({ stage: "Qualified", deals: 1 }),
		);
		const time = result.views.find(
			(view) => view.title === "Time to conversion",
		);
		expect(time?.rows).toContainEqual(
			expect.objectContaining({ outcome: PipelineStageType.WON, avgDays: 5 }),
		);
		const breakdowns = result.views.filter((view) => view.key === "breakdown");
		expect(breakdowns.map((view) => view.title)).toContain("By channel");
		expect(breakdowns.map((view) => view.title)).toContain(
			"By deal attribute · segment",
		);
		expect(result.attribution[0]?.firstTouch.utmSource).toBe("google");
		expect(result.attribution[0]?.currentConversion.utmSource).toBe("linkedin");
		expect(funnel?.chart.data.datasets[0]?.data).toEqual([2, 1, 1, 1]);
	});
});

describe("dashboard field authorization", () => {
	function serviceWithCustomValue(fieldKeys: string[]) {
		const db = {
			pipeline: { findMany: async () => [pipeline] },
			deal: {
				findMany: async () => [
					{
						id: "deal-attribute",
						pipelineId: pipeline.id,
						stage: stageAt(0),
						owner: { id: "seller", name: "Seller" },
						createdAt: new Date("2026-01-01T00:00:00.000Z"),
						closedAt: null,
						amount: null,
						customValues: { segment: "enterprise", secret: "do-not-return" },
						contacts: [],
					},
				],
			},
			activity: { findMany: async () => [] },
		} as never;
		const fields = {
			schema: async () => [{ fields: fieldKeys.map((key) => ({ key })) }],
		} as never;
		return new DashboardService(db, fields);
	}

	it("projects only a readable deal field into an attribute view", async () => {
		const result = await serviceWithCustomValue(["segment"]).analytics(
			{} as never,
			"seller",
			dashboardAnalyticsInput.parse({
				scope: "everyone",
				from: "2025-12-01T00:00:00.000Z",
				to: "2026-02-01T00:00:00.000Z",
				dimensions: ["dealAttribute"],
				attributeKey: "segment",
			}),
		);
		const attribute = result.views.find((view) =>
			view.title.includes("segment"),
		);
		expect(attribute?.rows).toContainEqual(
			expect.objectContaining({ label: "enterprise" }),
		);
		expect(JSON.stringify(result)).not.toContain("do-not-return");
	});

	it("rejects an attribute field that is not readable", async () => {
		await expect(
			serviceWithCustomValue([]).analytics(
				{} as never,
				"seller",
				dashboardAnalyticsInput.parse({
					scope: "everyone",
					from: "2025-12-01T00:00:00.000Z",
					to: "2026-02-01T00:00:00.000Z",
					dimensions: ["dealAttribute"],
					attributeKey: "secret",
				}),
			),
		).rejects.toThrow("unknown or not readable");
	});
});
