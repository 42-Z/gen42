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
import { buildFallbackPrompt } from "./style42-fallback";

const MAX_ATTEMPTS = 5;
const MAX_CONTRACT_RETRIES = 2;

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
}

const defaultDeps: EnhanceDeps = {
	getAvailableKey,
	deactivateKey,
	updateKeyRateLimit,
	callPoolside,
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
	} = { ...defaultDeps, ...deps };

	const started = Date.now();
	const anchors = pickAnchors();
	const message = buildUserMessage(userInput, anchors);
	let lastError: string | undefined;
	let contractRetries = 0;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
				continue;
			}

			return {
				prompt: cleaned,
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
				await dropKey(key.id, error.message);
				lastError = error.message;
				continue;
			}
			lastError = error instanceof Error ? error.message : String(error);
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
