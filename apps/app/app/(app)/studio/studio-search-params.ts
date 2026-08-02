import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server";

export const STUDIO_VIEWS = [
	"overview",
	"pipelines",
	"catalog",
	"fields",
	"relations",
	"automations",
	"accounts",
	"lineage",
	"dashboards",
	"ontology",
	"attribution",
] as const;

export type StudioView = (typeof STUDIO_VIEWS)[number];

export const studioParsers = {
	view: parseAsStringLiteral(STUDIO_VIEWS).withDefault("overview"),
	// Keep the dashboard scope compatible with the existing overview query.
	scope: parseAsStringLiteral(["me", "everyone"] as const).withDefault("me"),
	account: parseAsString.withDefault(""),
	accountQ: parseAsString.withDefault(""),
	accountTargetQ: parseAsString.withDefault(""),
	accountTab: parseAsStringLiteral([
		"details",
		"history",
		"merge",
	] as const).withDefault("details"),
	analyticsView: parseAsStringLiteral([
		"conversionFunnel",
		"conversionTime",
		"stagePerformance",
		"breakdown",
	] as const).withDefault("conversionFunnel"),
	analyticsDimension: parseAsStringLiteral([
		"channel",
		"owner",
		"utmSource",
		"utmMedium",
		"utmCampaign",
		"utmTerm",
		"utmContent",
		"dealAttribute",
	] as const).withDefault("channel"),
	analyticsPipeline: parseAsString.withDefault("all"),
	analyticsAttribute: parseAsString.withDefault(""),
	dashboard: parseAsString.withDefault(""),
	ontology: parseAsString.withDefault(""),
	attributionType: parseAsStringLiteral([
		"CONTACT",
		"COMPANY",
		"DEAL",
		"REVENUE_ACCOUNT",
	] as const).withDefault("CONTACT"),
	attributionId: parseAsString.withDefault(""),
};

export const loadStudioSearchParams = createLoader(studioParsers);
