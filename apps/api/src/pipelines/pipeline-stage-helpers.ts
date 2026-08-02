import {
	type Db,
	PipelineStageType,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { readStringArray } from "./pipeline-persistence";

export type StageInput = {
	pipelineId: string;
	name: string;
	type: PipelineStageType;
	key?: string;
	semanticPhase?: string;
	allowedRoles?: string[];
	responsibleRole?: string;
	defaultResponsibleRole?: string;
	allowedNextStages?: string[];
};

export type StageUpdateInput = {
	id: string;
	name?: string;
	type?: PipelineStageType;
	key?: string;
	semanticPhase?: string;
	allowedRoles?: string[];
	responsibleRole?: string | null;
	defaultResponsibleRole?: string | null;
	allowedNextStages?: string[];
};

export function resolveNextStageIds(
	keys: string[] | undefined,
	stages: Array<{ id: string; key: string }>,
) {
	if (!keys) return [];
	const byKey = new Map(stages.map((stage) => [stage.key, stage.id]));
	return keys.map((key) => byKey.get(key) ?? key);
}

export async function requirePipeline(
	db: Db,
	id: string,
	scope: Prisma.PipelineWhereInput,
) {
	const pipeline = await db.pipeline.findFirst({
		where: { AND: [{ id }, scope] },
		select: { id: true },
	});
	if (!pipeline) throw new NotFoundException(`No pipeline with id ${id}.`);
}

export async function requireStage(
	db: Db,
	id: string,
	scope: Prisma.PipelineWhereInput,
) {
	const stage = await db.pipelineStage.findFirst({
		where: { id, pipeline: scope },
		select: { id: true },
	});
	if (!stage) throw new NotFoundException(`No stage with id ${id}.`);
}

export function uniqueStageKey(name: string, existing: string[]) {
	const base = slugify(name);
	if (!existing.includes(base)) return base;
	let suffix = 2;
	while (existing.includes(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
}

function slugify(value: string) {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "stage"
	);
}

export function readStoredRoles(value: Prisma.JsonValue) {
	return readStringArray(value);
}

export function assertStageRoles(
	allowedRoles: string[],
	responsibleRole: string | null | undefined,
	defaultResponsibleRole: string | null | undefined,
) {
	if (responsibleRole && !allowedRoles.includes(responsibleRole)) {
		throw new BadRequestException(
			"The responsible role must be allowed on the stage.",
		);
	}
	if (
		defaultResponsibleRole &&
		!allowedRoles.includes(defaultResponsibleRole)
	) {
		throw new BadRequestException(
			"The default responsible role must be allowed on the stage.",
		);
	}
}

export function isUnique(error: unknown) {
	return (
		error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

export function defaultConflict(error: unknown): Error {
	if (isUnique(error)) {
		return new BadRequestException(
			"Another pipeline became the default. Refresh and try again.",
		);
	}
	return error instanceof Error ? error : new Error(String(error));
}
