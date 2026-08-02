import { describe, expect, it } from "bun:test";
import type { StudioSchema } from "@/app/(app)/studio/studio-data";
import {
	relationRows,
	STUDIO_ACCOUNT_INPUT,
} from "@/app/(app)/studio/studio-data";

describe("Revenue Architecture Studio data", () => {
	it("maps schema relations without inventing record data", () => {
		const schema = [
			{
				id: "companies",
				pluralName: "Companies",
				sourceRelations: [
					{
						id: "company-deals",
						key: "deals",
						name: "Deals",
						inverseName: "Company",
						cardinality: "ONE_TO_MANY",
						targetObject: { pluralName: "Deals" },
					},
				],
			},
		] as unknown as StudioSchema;

		expect(relationRows(schema)).toEqual([
			{
				id: "company-deals",
				source: "Companies",
				target: "Deals",
				name: "Deals",
				inverseName: "Company",
				key: "deals",
				cardinality: "ONE_TO_MANY",
			},
		]);
	});

	it("uses the existing company list contract for account navigation", () => {
		expect(STUDIO_ACCOUNT_INPUT).toMatchObject({
			q: "",
			page: 1,
			pageSize: 25,
			owner: "all",
			industry: "all",
			enrichment: "all",
		});
	});
});
