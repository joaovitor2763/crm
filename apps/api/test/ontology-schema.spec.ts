import { describe, expect, it } from "bun:test";
import type { OntologySnapshot } from "../src/fields/ontology.contracts";
import {
	checksumOntologySnapshot,
	diffOntologySnapshots,
	validateOntologySnapshot,
} from "../src/fields/ontology.snapshot";

const baseSnapshot = (): OntologySnapshot => ({
	objects: [
		{
			id: "object-contact",
			key: "contacts",
			name: "Contact",
			pluralName: "Contacts",
			kind: "SYSTEM",
			systemModel: "Contact",
			businessUnitId: null,
			archivedAt: null,
			fields: [
				{
					id: "field-source",
					businessUnitId: null,
					key: "source",
					label: "Source",
					description: null,
					type: "TEXT",
					indexMode: "BASIC",
					classification: "INTERNAL",
					position: 0,
					isRequired: false,
					defaultValue: null,
					agentReadable: true,
					agentWritable: false,
					apiReadable: true,
					apiWritable: true,
					archivedAt: null,
					options: [],
					permissions: [],
				},
			],
		},
	],
	relations: [],
	policies: { rolePermissions: [] },
});

describe("ontology snapshots", () => {
	it("produces an order-independent checksum", () => {
		const snapshot = baseSnapshot();
		const reordered = {
			...snapshot,
			objects: [...snapshot.objects].reverse(),
		};
		expect(checksumOntologySnapshot(snapshot)).toBe(
			checksumOntologySnapshot(reordered),
		);
	});

	it("rejects invalid relation references and duplicate field keys", () => {
		const invalid = baseSnapshot();
		invalid.relations = [
			{
				key: "contact-deals",
				sourceObjectKey: "contacts",
				targetObjectKey: "deals",
				name: "Deals",
				inverseName: "Contact",
				cardinality: "MANY_TO_MANY",
				archivedAt: null,
			},
		];
		expect(() => validateOntologySnapshot(invalid)).toThrow(
			"Relation target object not found",
		);

		const duplicate = baseSnapshot();
		const firstField = duplicate.objects[0]?.fields[0];
		if (firstField) {
			duplicate.objects[0]?.fields.push({ ...firstField, id: "field-other" });
		}
		expect(() => validateOntologySnapshot(duplicate)).toThrow(
			"Duplicate field key",
		);
	});

	it("requires archived stable keys instead of silently removing them", () => {
		const published = baseSnapshot();
		const draft = baseSnapshot();
		draft.objects[0]?.fields.splice(0, 1);
		expect(() => validateOntologySnapshot(draft, published)).toThrow(
			"archive it instead",
		);
	});

	it("reports additions, removals and required-field breaking changes", () => {
		const previous = baseSnapshot();
		const next = baseSnapshot();
		const nextField = next.objects[0]?.fields[0];
		if (nextField) nextField.isRequired = true;
		next.objects.push({
			key: "deals",
			name: "Deal",
			pluralName: "Deals",
			kind: "SYSTEM",
			systemModel: "Deal",
			businessUnitId: null,
			archivedAt: null,
			fields: [],
		});
		const impact = diffOntologySnapshots(previous, next);
		expect(impact.objects.added).toEqual(["deals"]);
		expect(impact.fields.changed).toEqual(["contacts/global/source"]);
		expect(impact.breakingChanges).toContain(
			"Field became required: contacts/source",
		);
		expect(impact.hasBreakingChanges).toBe(true);
	});
});
