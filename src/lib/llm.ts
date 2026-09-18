import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, type JSONValue } from "ai";

export const POOLSIDE_BASE_URL =
	process.env.POOLSIDE_BASE_URL ?? "https://inference.poolside.ai/v1";
export const POOLSIDE_MODEL =
	process.env.POOLSIDE_MODEL ?? "poolside/laguna-xs-2.1";
export const INCEPTION_BASE_URL =
	process.env.INCEPTION_BASE_URL ?? "https://api.inceptionlabs.ai/v1";
export const INCEPTION_MODEL = process.env.INCEPTION_MODEL ?? "mercury-2.5";

export type LlmProviderId = "poolside" | "inception";

export function isLlmProvider(provider: string): provider is LlmProviderId {
	return provider === "poolside" || provider === "inception";
}

export interface LlmProviderConfig {
	/** Имя провайдера в SDK; ключ providerOptions совпадает с ним */
	name: string;
	baseURL: string;
	model: string;
	/** Опции, прокидываемые в тело запроса через providerOptions[name] */
	providerOptions: Record<string, JSONValue>;
	/** HTTP-статусы, означающие «ключ не работает» */
	exhaustedStatuses: number[];
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderConfig> = {
	poolside: {
		name: "poolside",
		baseURL: POOLSIDE_BASE_URL,
		model: POOLSIDE_MODEL,
		providerOptions: { chat_template_kwargs: { enable_thinking: false } },
		exhaustedStatuses: [401, 403, 429],
	},
	inception: {
		name: "inception",
		baseURL: INCEPTION_BASE_URL,
		model: INCEPTION_MODEL,
		providerOptions: { reasoningEffort: "low" },
		exhaustedStatuses: [401, 402, 403, 429],
	},
};

export interface LlmUsage {
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
}

export interface LlmRateLimit {
	limit: number | null;
	remaining: number | null;
}

export interface LlmResult {
	text: string;
	usage: LlmUsage;
	rateLimit: LlmRateLimit;
}

export class LlmKeyExhaustedError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export class LlmCallError extends Error {}

export function headerValue(headers: unknown, name: string): string | null {
	if (!headers) return null;
	if (typeof (headers as Headers).get === "function") {
		return (headers as Headers).get(name);
	}
	const lower = name.toLowerCase();
	for (const [key, value] of Object.entries(
		headers as Record<string, string>,
	)) {
		if (key.toLowerCase() === lower) return value;
	}
	return null;
}

function toNumber(value: string | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export async function callLlm(params: {
	provider: LlmProviderId;
	system: string;
	user: string;
	apiKey: string;
	timeoutMs?: number;
	maxOutputTokens?: number;
}): Promise<LlmResult> {
	const {
		provider: providerId,
		system,
		user,
		apiKey,
		timeoutMs = 30_000,
		maxOutputTokens = 900,
	} = params;

	const config = LLM_PROVIDERS[providerId];

	const provider = createOpenAICompatible({
		name: config.name,
		baseURL: config.baseURL,
		apiKey,
	});

	try {
		const result = await generateText({
			model: provider(config.model),
			instructions: system,
			prompt: user,
			temperature: 0.9,
			maxOutputTokens,
			maxRetries: 0,
			timeout: { totalMs: timeoutMs },
			providerOptions: {
				[config.name]: config.providerOptions,
			},
		});

		const headers = result.finalStep.response?.headers;
		const usage = result.usage;

		return {
			text: result.text,
			usage: {
				inputTokens: usage.inputTokens ?? null,
				outputTokens: usage.outputTokens ?? null,
				totalTokens: usage.totalTokens ?? null,
			},
			rateLimit: {
				limit: toNumber(headerValue(headers, "x-ratelimit-limit-requests")),
				remaining: toNumber(
					headerValue(headers, "x-ratelimit-remaining-requests"),
				),
			},
		};
	} catch (error) {
		const status = APICallError.isInstance(error)
			? error.statusCode
			: undefined;
		if (status !== undefined && config.exhaustedStatuses.includes(status)) {
			throw new LlmKeyExhaustedError(
				status,
				`${config.name} key rejected: ${status}`,
			);
		}
		throw new LlmCallError(
			error instanceof Error ? error.message : String(error),
		);
	}
}
