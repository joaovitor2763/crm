export type OntologyVersion = {
	id: string;
	version: number;
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
	checksum: string;
	createdAt: string;
};

export type OntologyDefinition = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	versions: OntologyVersion[];
};

export type OntologySnapshot = {
	objects: Array<{ fields: unknown[] }>;
	relations: unknown[];
	policies: { rolePermissions: unknown[] };
};

export type OntologyDetail = OntologyVersion & {
	schemaDefinition?: {
		id: string;
		key: string;
		name: string;
		description: string | null;
	};
	snapshot?: unknown;
};

export type OntologyImpactGroup = {
	added: string[];
	removed: string[];
	changed: string[];
};

export type OntologyImpact = {
	objects: OntologyImpactGroup;
	fields: OntologyImpactGroup;
	relations: OntologyImpactGroup;
	breakingChanges: string[];
};

export function latestVersion(versions: OntologyVersion[]) {
	return [...versions].sort((left, right) => right.version - left.version)[0];
}
