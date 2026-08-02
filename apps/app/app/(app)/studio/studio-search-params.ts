import { createLoader, parseAsStringLiteral } from "nuqs/server";

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
] as const;

export type StudioView = (typeof STUDIO_VIEWS)[number];

export const studioParsers = {
	view: parseAsStringLiteral(STUDIO_VIEWS).withDefault("overview"),
	// Keep the dashboard scope compatible with the existing overview query.
	scope: parseAsStringLiteral(["me", "everyone"] as const).withDefault("me"),
};

export const loadStudioSearchParams = createLoader(studioParsers);
