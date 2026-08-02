import type { RouterOutputs } from "@/lib/trpc/types";
import { companiesSearchParams } from "../companies/companies-search-params";

export const STUDIO_ACCOUNT_INPUT = companiesSearchParams.toInput({
	q: "",
	sort: "createdAt",
	dir: "desc",
	page: 1,
	owner: "all",
	industry: "all",
	enrichment: "all",
});

export type StudioSchema = RouterOutputs["fields"]["schema"];

export type StudioRelation = {
	id: string;
	source: string;
	target: string;
	name: string;
	inverseName: string;
	key: string;
	cardinality: string;
};

export function relationRows(schema: StudioSchema): StudioRelation[] {
	return schema.flatMap((object) =>
		object.sourceRelations.map((relation) => ({
			id: relation.id,
			source: object.pluralName,
			target: relation.targetObject.pluralName,
			name: relation.name,
			inverseName: relation.inverseName,
			key: relation.key,
			cardinality: relation.cardinality,
		})),
	);
}
