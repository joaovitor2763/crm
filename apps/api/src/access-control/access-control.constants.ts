export const DEFAULT_BUSINESS_UNIT_ID = "business-unit-default";
export const DEFAULT_TEAM_ID = "team-default";
export const DEFAULT_ROLE_ID = "role-read-only";

export const CRM_RESOURCE = {
	activities: "activities",
	apiCredentials: "api-credentials",
	audit: "audit",
	automations: "automations",
	businessUnits: "business-units",
	companies: "companies",
	contacts: "contacts",
	deals: "deals",
	dashboards: "dashboards",
	fields: "fields",
	marketingEvents: "marketing-events",
	marketingForms: "marketing-forms",
	pipelines: "pipelines",
	products: "products",
	revenueAccounts: "revenue-accounts",
	roles: "roles",
	teams: "teams",
	users: "users",
	webhooks: "webhooks",
} as const;

export type CrmResource = (typeof CRM_RESOURCE)[keyof typeof CRM_RESOURCE];
