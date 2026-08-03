import { type Db, encryptSecret, type Prisma } from "@crm/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDatabase } from "../database/database.constants";
import type {
	AgentTaskListInput,
	AiConfigurationUpdateInput,
} from "./agent-admin.contracts";

const FALLBACK_MODEL = "deepseek/deepseek-v4-flash-0731";
const FALLBACK_CONTEXT_WINDOW = 1_048_576;
const RECOMMENDED_MODELS = [
	{ id: "minimax/minimax-m3", label: "MiniMax M3", contextWindow: 1_048_576 },
	{ id: "moonshotai/kimi-k3", label: "Kimi K3", contextWindow: 1_048_576 },
	{
		id: "openai/gpt-5.6-luna",
		label: "GPT-5.6 Luna",
		contextWindow: 1_048_576,
	},
	{ id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", contextWindow: 1_048_576 },
	{
		id: "openai/gpt-5.6-terra",
		label: "GPT-5.6 Terra",
		contextWindow: 1_048_576,
	},
	{
		id: FALLBACK_MODEL,
		label: "DeepSeek V4 Flash",
		contextWindow: FALLBACK_CONTEXT_WINDOW,
	},
] as const;
const DEFAULTS = {
	interactive: FALLBACK_MODEL,
	research: FALLBACK_MODEL,
	enrichment: FALLBACK_MODEL,
};

@Injectable()
export class AgentAdminService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: ConfigService,
	) {}

	async configuration() {
		const row = await this.db.aiProviderConfiguration.findUnique({
			where: { provider: "openrouter" },
		});
		return {
			provider: "openrouter" as const,
			storageEnabled: Boolean(
				this.config.get<string>("AI_CONFIG_ENCRYPTION_KEY"),
			),
			providerConfigured: Boolean(row?.apiKeyEncrypted),
			lastFour: row?.apiKeyLastFour ?? null,
			models: row?.models.length
				? row.models
				: RECOMMENDED_MODELS.map((model) => model.id),
			modelContextWindows: parseContextWindows(row?.modelContextWindows),
			defaults: parseDefaults(row?.defaults),
			recommendedModels: RECOMMENDED_MODELS,
		};
	}

	async updateConfiguration(input: AiConfigurationUpdateInput) {
		const encryptionKey = this.config.get<string>("AI_CONFIG_ENCRYPTION_KEY");
		if (input.apiKey && !encryptionKey) {
			throw new BadRequestException(
				"Set AI_CONFIG_ENCRYPTION_KEY before saving a provider credential.",
			);
		}
		const credential = input.clearApiKey
			? { apiKeyEncrypted: null, apiKeyLastFour: null }
			: input.apiKey && encryptionKey
				? {
						apiKeyEncrypted: encryptSecret(input.apiKey, encryptionKey),
						apiKeyLastFour: input.apiKey.slice(-4),
					}
				: {};
		await this.db.aiProviderConfiguration.upsert({
			where: { provider: "openrouter" },
			create: {
				provider: "openrouter",
				models: input.models,
				modelContextWindows: input.modelContextWindows,
				defaults: input.defaults,
				...credential,
			},
			update: {
				models: input.models,
				modelContextWindows: input.modelContextWindows,
				defaults: input.defaults,
				...credential,
			},
		});
		return this.configuration();
	}

	async tasks(input: AgentTaskListInput) {
		const now = new Date();
		const status: Prisma.AgentTaskWhereInput =
			input.status === "pending"
				? {
						finishedAt: null,
						OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
					}
				: input.status === "running"
					? { finishedAt: null, leasedUntil: { gte: now } }
					: input.status === "failed"
						? {
								finishedAt: { not: null },
								outcome: { not: null },
								NOT: [
									{ outcome: "ran" },
									{ outcome: { startsWith: "Cancelled" } },
								],
							}
						: input.status === "finished"
							? { finishedAt: { not: null } }
							: {};
		const where: Prisma.AgentTaskWhereInput = {
			AND: [
				status,
				input.q
					? {
							OR: [
								{ kind: { contains: input.q, mode: "insensitive" } },
								{ reason: { contains: input.q, mode: "insensitive" } },
								{
									contact: {
										firstName: { contains: input.q, mode: "insensitive" },
									},
								},
								{
									contact: {
										lastName: { contains: input.q, mode: "insensitive" },
									},
								},
								{
									company: { name: { contains: input.q, mode: "insensitive" } },
								},
							],
						}
					: {},
			],
		};
		const [rows, total] = await Promise.all([
			this.db.agentTask.findMany({
				where,
				orderBy: [
					{ finishedAt: { sort: "desc", nulls: "first" } },
					{ priority: "desc" },
					{ dueAt: "asc" },
				],
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
				include: {
					contact: { select: { id: true, firstName: true, lastName: true } },
					company: { select: { id: true, name: true } },
				},
			}),
			this.db.agentTask.count({ where }),
		]);
		return { rows, total, now: now.toISOString() };
	}

	async retryTask(id: string): Promise<{ id: string }> {
		const now = new Date();
		const { count } = await this.db.agentTask.updateMany({
			where: {
				id,
				OR: [
					{ finishedAt: { not: null } },
					{ leasedUntil: null },
					{ leasedUntil: { lt: now } },
				],
			},
			data: {
				dueAt: now,
				leasedUntil: null,
				startedAt: null,
				finishedAt: null,
				outcome: null,
				attempts: 0,
			},
		});
		if (count === 0) {
			throw new BadRequestException(
				"A running task cannot be retried until its lease expires.",
			);
		}
		return { id };
	}

	async cancelTask(id: string): Promise<{ id: string }> {
		const now = new Date();
		const { count } = await this.db.agentTask.updateMany({
			where: {
				id,
				finishedAt: null,
				OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
			},
			data: {
				leasedUntil: null,
				finishedAt: now,
				outcome: "Cancelled by an administrator.",
			},
		});
		if (count === 0) {
			throw new BadRequestException(
				"Only a pending task can be cancelled. Running work must finish or let its lease expire.",
			);
		}
		return { id };
	}
}

function parseContextWindows(value: unknown): Record<string, number> {
	const fallback = Object.fromEntries(
		RECOMMENDED_MODELS.map((model) => [model.id, model.contextWindow]),
	);
	if (!value || typeof value !== "object" || Array.isArray(value))
		return fallback;
	const parsed = Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, number] =>
				typeof entry[1] === "number" && Number.isInteger(entry[1]),
		),
	);
	return { ...fallback, ...parsed };
}

function parseDefaults(value: unknown): typeof DEFAULTS {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return DEFAULTS;
	const row = value as Record<string, unknown>;
	return {
		interactive:
			typeof row.interactive === "string"
				? row.interactive
				: DEFAULTS.interactive,
		research:
			typeof row.research === "string" ? row.research : DEFAULTS.research,
		enrichment:
			typeof row.enrichment === "string" ? row.enrichment : DEFAULTS.enrichment,
	};
}
