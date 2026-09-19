import {
	AllKeysExhaustedError,
	deactivateKey,
	getAvailableLlmKey,
	updateKeyRateLimit,
} from "./keys";
import {
	callLlm,
	isLlmProvider,
	LLM_PROVIDERS,
	LlmKeyExhaustedError,
} from "./llm";
import { STYLE_SYSTEM, STYLE_VERSION } from "./prompts";
import {
	type Anchors,
	buildUserMessage,
	pickAnchors,
	type UserMessageOptions,
} from "./prompts/anchors";
import {
	sanitizeEnhancedPrompt,
	validateEnhancedPrompt,
} from "./prompts/contract";
import {
	buildBrief,
	detectUserMedium,
	detectUserPalette,
	detectUserSetting,
	ensureClosingFormula,
	extractCapsPhrases,
	extractNamedTexts,
	extractQuotedTexts,
	hijackedOpening,
	maskUnrequestedTexts,
	missingDetails,
	quoteUserCyrillic,
	requestsText,
	toGeneratorQuotes,
} from "./prompts/style-hints";
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
	getAvailableLlmKey: typeof getAvailableLlmKey;
	deactivateKey: typeof deactivateKey;
	updateKeyRateLimit: typeof updateKeyRateLimit;
	callLlm: typeof callLlm;
	deadlineMs: number;
}

const defaultDeps: EnhanceDeps = {
	getAvailableLlmKey,
	deactivateKey,
	updateKeyRateLimit,
	callLlm,
	deadlineMs: ENHANCE_DEADLINE_MS,
};

// Якоря, которые не передаются в LLM: место и свет, если их задал
// пользователь. Остальной канон 42 остаётся — он обогащает замысел.
export function anchorsToOmit(userInput: string): (keyof Anchors)[] {
	const omit: (keyof Anchors)[] = [];
	if (detectUserSetting(userInput)) omit.push("location");
	if (detectUserPalette(userInput)) omit.push("lighting");
	return omit;
}

interface Candidate {
	text: string;
	issues: number;
	keyId: string;
	model: string;
	inputTokens: number | null;
	outputTokens: number | null;
}

export async function enhancePrompt(
	userInput: string,
	deps: Partial<EnhanceDeps> = {},
): Promise<EnhanceResult> {
	const {
		getAvailableLlmKey: takeKey,
		deactivateKey: dropKey,
		updateKeyRateLimit: saveLimits,
		callLlm: callModel,
		deadlineMs,
	} = { ...defaultDeps, ...deps };

	const started = Date.now();
	const anchors = pickAnchors();
	const userMedium = detectUserMedium(userInput);
	if (userMedium) {
		anchors.medium = userMedium;
	}
	const exactTexts = [
		...new Set([
			...extractQuotedTexts(userInput),
			...extractNamedTexts(userInput),
		]),
	];
	const textRequested = requestsText(userInput) || exactTexts.length > 0;
	const messageOptions: UserMessageOptions = {
		textRequested,
		exactTexts,
		textCandidates: textRequested ? extractCapsPhrases(userInput) : [],
		brief: buildBrief(userInput),
		omit: anchorsToOmit(userInput),
	};
	const baseMessage = buildUserMessage(userInput, anchors, messageOptions);
	let message = baseMessage;
	let lastError: string | undefined;
	let contractRetries = 0;
	// Ответ LLM с мелкими огрехами (потерянная деталь, свита в первом
	// предложении) всё равно лучше шаблонного fallback: держим лучший из них.
	let best: Candidate | null = null;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (Date.now() - started > deadlineMs) {
			lastError = `deadline: ${deadlineMs}ms exceeded`;
			break;
		}

		let key: Awaited<ReturnType<typeof getAvailableLlmKey>>;
		try {
			key = await takeKey();
		} catch (error) {
			if (error instanceof AllKeysExhaustedError) break;
			throw error;
		}
		if (!isLlmProvider(key.provider)) {
			lastError = `unexpected key provider: ${key.provider}`;
			break;
		}

		try {
			const result = await callModel({
				provider: key.provider,
				system: STYLE_SYSTEM,
				user: message,
				apiKey: key.key,
				timeoutMs: Math.max(2_000, deadlineMs - (Date.now() - started)),
			});
			await saveLimits(key.id, {
				...result.rateLimit,
				...result.usage,
			});

			let cleaned = quoteUserCyrillic(
				sanitizeEnhancedPrompt(result.text),
				userInput,
				textRequested,
			);
			if (!textRequested) {
				cleaned = maskUnrequestedTexts(cleaned);
			}
			const verdict = validateEnhancedPrompt(cleaned);
			if (!verdict.ok) {
				lastError = `contract: ${verdict.reason}`;
				contractRetries += 1;
				if (contractRetries >= MAX_CONTRACT_RETRIES) break;
				message = `${baseMessage}\n\nPREVIOUS ATTEMPT WAS REJECTED: ${verdict.reason}. Output the corrected prompt only.`;
				continue;
			}

			const missingExact = exactTexts.filter((text) => !cleaned.includes(text));
			const missing = missingDetails(userInput, cleaned);
			const hijackedBy = hijackedOpening(userInput, cleaned);
			const issues = missingExact.length + missing.length + hijackedBy.length;
			const candidate: Candidate = {
				text: cleaned,
				issues,
				keyId: key.id,
				model: LLM_PROVIDERS[key.provider].model,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
			};
			if (!best || issues < best.issues) best = candidate;
			if (issues === 0) break;

			lastError = [
				missingExact.length && `missing exact text: ${missingExact.join(", ")}`,
				missing.length && `missing details: ${missing.join(", ")}`,
				hijackedBy.length && `hijacked opening: ${hijackedBy.join(", ")}`,
			]
				.filter(Boolean)
				.join("; ");
			contractRetries += 1;
			if (contractRetries >= MAX_CONTRACT_RETRIES) break;
			message = buildUserMessage(userInput, anchors, {
				...messageOptions,
				missingDetails: [
					...missing,
					...missingExact.map((text) => `the exact text «${text}», verbatim`),
				],
				hijackedBy,
			});
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

	if (best) {
		return {
			prompt: toGeneratorQuotes(
				ensureClosingFormula(best.text, anchors.medium),
			),
			keyId: best.keyId,
			model: best.model,
			styleVersion: STYLE_VERSION,
			inputTokens: best.inputTokens,
			outputTokens: best.outputTokens,
			durationMs: Date.now() - started,
			fallback: false,
			...(best.issues > 0 && lastError ? { error: lastError } : {}),
		};
	}

	return {
		prompt: toGeneratorQuotes(
			buildFallbackPrompt(userInput, anchors, {
				textRequested,
				exactTexts,
				omit: messageOptions.omit,
			}),
		),
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
