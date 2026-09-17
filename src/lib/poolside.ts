import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText } from "ai";

export const POOLSIDE_BASE_URL =
	process.env.POOLSIDE_BASE_URL ?? "https://inference.poolside.ai/v1";
export const POOLSIDE_MODEL =
	process.env.POOLSIDE_MODEL ?? "poolside/laguna-xs-2.1";

export interface PoolsideUsage {
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
}

export interface PoolsideRateLimit {
	limit: number | null;
	remaining: number | null;
}

export interface PoolsideResult {
	text: string;
	usage: PoolsideUsage;
	rateLimit: PoolsideRateLimit;
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

export async function callPoolside(params: {
	system: string;
	user: string;
	apiKey: string;
	timeoutMs?: number;
	maxOutputTokens?: number;
}): Promise<PoolsideResult> {
	const {
		system,
		user,
		apiKey,
		timeoutMs = 30_000,
		maxOutputTokens = 900,
	} = params;

	const provider = createOpenAICompatible({
		name: "poolside",
		baseURL: POOLSIDE_BASE_URL,
		apiKey,
	});

	try {
		const result = await generateText({
			model: provider(POOLSIDE_MODEL),
			instructions: system,
			prompt: user,
			temperature: 0.9,
			maxOutputTokens,
			maxRetries: 0,
			timeout: { totalMs: timeoutMs },
			providerOptions: {
				poolside: { chat_template_kwargs: { enable_thinking: false } },
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
		if (status === 401 || status === 403 || status === 429) {
			throw new LlmKeyExhaustedError(
				status,
				`Poolside key rejected: ${status}`,
			);
		}
		throw new LlmCallError(
			error instanceof Error ? error.message : String(error),
		);
	}
}
