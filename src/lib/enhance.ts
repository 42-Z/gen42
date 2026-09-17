import {
	AllKeysExhaustedError,
	deactivateKey,
	getAvailableKey,
	updateKeyRateLimit,
} from "./keys";
import { callPoolside, LlmKeyExhaustedError, POOLSIDE_MODEL } from "./poolside";
import { STYLE_SYSTEM, STYLE_VERSION } from "./prompts";
import { buildUserMessage, pickAnchors } from "./prompts/anchors";
import {
	sanitizeEnhancedPrompt,
	validateEnhancedPrompt,
} from "./prompts/contract";
import { detectUserMedium, ensureClosingFormula } from "./prompts/style-hints";
import { buildFallbackPrompt } from "./style42-fallback";

const MAX_ATTEMPTS = 3;
const MAX_CONTRACT_RETRIES = 2;
const ENHANCE_DEADLINE_MS = 25_000;

export interface EnhanceResult {
	prompt: string;
	keyId: string | null;
	model: string | null;
	styleVersion: string;
	inputTokens: number | null;
	outputTokens: number | null;
	durationMs: number;
	fallback: boolean;
	error?: string;
}

export interface EnhanceDeps {
	getAvailableKey: typeof getAvailableKey;
	deactivateKey: typeof deactivateKey;
	updateKeyRateLimit: typeof updateKeyRateLimit;
	callPoolside: typeof callPoolside;
	deadlineMs: number;
}

const defaultDeps: EnhanceDeps = {
	getAvailableKey,
	deactivateKey,
	updateKeyRateLimit,
	callPoolside,
	deadlineMs: ENHANCE_DEADLINE_MS,
};

export async function enhancePrompt(
	userInput: string,
	deps: Partial<EnhanceDeps> = {},
): Promise<EnhanceResult> {
	const {
		getAvailableKey: takeKey,
		deactivateKey: dropKey,
		updateKeyRateLimit: saveLimits,
		callPoolside: callLlm,
		deadlineMs,
	} = { ...defaultDeps, ...deps };

	const started = Date.now();
	const anchors = pickAnchors();
	const userMedium = detectUserMedium(userInput);
	if (userMedium) {
		anchors.medium = userMedium;
	}
	const baseMessage = buildUserMessage(userInput, anchors);
	let message = baseMessage;
	let lastError: string | undefined;
	let contractRetries = 0;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (Date.now() - started > deadlineMs) {
			lastError = `deadline: ${deadlineMs}ms exceeded`;
			break;
		}

		let key: Awaited<ReturnType<typeof getAvailableKey>>;
		try {
			key = await takeKey("poolside");
		} catch (error) {
			if (error instanceof AllKeysExhaustedError) break;
			throw error;
		}

		try {
			const result = await callLlm({
				system: STYLE_SYSTEM,
				user: message,
				apiKey: key.key,
				timeoutMs: Math.max(2_000, deadlineMs - (Date.now() - started)),
			});
			await saveLimits(key.id, {
				...result.rateLimit,
				...result.usage,
			});

			const cleaned = sanitizeEnhancedPrompt(result.text);
			const verdict = validateEnhancedPrompt(cleaned);
			if (!verdict.ok) {
				lastError = `contract: ${verdict.reason}`;
				contractRetries += 1;
				if (contractRetries >= MAX_CONTRACT_RETRIES) break;
				message = `${baseMessage}\n\nPREVIOUS ATTEMPT WAS REJECTED: ${verdict.reason}. Output the corrected prompt only.`;
				continue;
			}

			return {
				prompt: ensureClosingFormula(cleaned, anchors.medium),
				keyId: key.id,
				model: POOLSIDE_MODEL,
				styleVersion: STYLE_VERSION,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				durationMs: Date.now() - started,
				fallback: false,
			};
		} catch (error) {
			if (error instanceof LlmKeyExhaustedError) {
				lastError = error.message;
				if (error.status === 429) {
					await saveLimits(key.id, {
						limit: null,
						remaining: 0,
						inputTokens: null,
						outputTokens: null,
						error: error.message,
					});
				} else {
					await dropKey(key.id, error.message);
				}
				continue;
			}
			lastError = error instanceof Error ? error.message : String(error);
			await saveLimits(key.id, {
				limit: null,
				remaining: null,
				inputTokens: null,
				outputTokens: null,
				error: lastError,
			});
		}
	}

	return {
		prompt: buildFallbackPrompt(userInput, anchors),
		keyId: null,
		model: null,
		styleVersion: STYLE_VERSION,
		inputTokens: null,
		outputTokens: null,
		durationMs: Date.now() - started,
		fallback: true,
		error: lastError,
	};
}
