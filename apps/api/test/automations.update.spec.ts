import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { ConfigService } from "@nestjs/config";
import { AccessControlService } from "../src/access-control/access-control.service";
import type { EffectivePrincipal } from "../src/access-control/access-control.types";
import { AutomationsService } from "../src/automations/automations.service";
import type { EnvironmentVariables } from "../src/config/env.validation";
import { ContactLifecycleService } from "../src/contacts/contact-lifecycle.service";

const principal = {} as EffectivePrincipal;

function serviceFor(
	onAssignment: (assignment: unknown) => void,
): AutomationsService {
	const db = {
		automation: {
			findFirst: async () => ({
				id: "automation-1",
				version: 4,
				businessUnitId: "current-bu",
				teamId: "current-team",
			}),
			update: async ({ data }: { data: unknown }) => data,
		},
	} as unknown as Db;
	const accessControl = {
		assertAssignment: async (
			_principal: EffectivePrincipal,
			_resource: string,
			_action: unknown,
			assignment: unknown,
		) => onAssignment(assignment),
	} as unknown as AccessControlService;
	const config = {
		get: () => undefined,
	} as unknown as ConfigService<EnvironmentVariables, true>;
	return new AutomationsService(
		db,
		accessControl,
		{} as ContactLifecycleService,
		config,
	);
}

describe("automation update assignment validation", () => {
	it("merges a partial patch with the current tuple before authorizing", async () => {
		const assignments: unknown[] = [];
		const service = serviceFor((assignment) => assignments.push(assignment));

		await service.update(
			{ id: "automation-1", teamId: "next-team" },
			{},
			principal,
		);

		expect(assignments).toEqual([
			{ businessUnitId: "current-bu", teamId: "next-team" },
		]);
	});

	it("retains the current team when only the business unit changes", async () => {
		const assignments: unknown[] = [];
		const service = serviceFor((assignment) => assignments.push(assignment));

		await service.update(
			{ id: "automation-1", businessUnitId: "next-bu" },
			{},
			principal,
		);

		expect(assignments).toEqual([
			{ businessUnitId: "next-bu", teamId: "current-team" },
		]);
	});
});
