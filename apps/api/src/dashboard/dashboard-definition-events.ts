import type { Prisma } from "@crm/db";
import type { EffectivePrincipal } from "../access-control/access-control.types";

export type DashboardDefinitionEventAction = "published" | "archived";

type EventDefinition = {
	id: string;
	key: string;
	version: number;
	businessUnitId: string | null;
};

export function dashboardDefinitionEventKey(
	definitionId: string,
	version: number,
	action: DashboardDefinitionEventAction,
) {
	return `dashboard-definition.${action}:${definitionId}:${version}`;
}

export function writeDashboardDefinitionEvent(
	tx: Prisma.TransactionClient,
	definition: EventDefinition,
	action: DashboardDefinitionEventAction,
	principal: EffectivePrincipal,
) {
	const type = `dashboard-definition.${action}`;
	const eventKey = dashboardDefinitionEventKey(
		definition.id,
		definition.version,
		action,
	);
	return tx.domainEvent.upsert({
		where: { eventKey },
		update: {},
		create: {
			eventKey,
			type,
			resource: "dashboards",
			recordId: definition.id,
			businessUnitId: definition.businessUnitId,
			actorType: principal.actorType,
			actorId: principal.actorId,
			payload: {
				key: definition.key,
				version: definition.version,
				status: action === "published" ? "PUBLISHED" : "ARCHIVED",
			},
		},
	});
}
