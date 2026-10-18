import type { EnhanceResult } from "../../src/lib/enhance";
import { errorFromFailure } from "../../src/lib/spaces/failure";
import type {
	AttemptInput,
	AttemptOutcome,
	SpaceFailure,
} from "../../src/lib/spaces/types";
import { getSpacesRuntime } from "../../src/lib/spaces/workflow-runtime";

/**
 * Шаги воркфлоу Krea 2 / Ideogram 4: тонкие обёртки над кодом из src/lib/spaces.
 * Каждый шаг выполняется в полном рантайме с отдельным лимитом функции; аргументы и
 * результаты только сериализуемые (строки, числа, простые объекты).
 */

const llmTokens = (enhanced: EnhanceResult | null): number | null =>
	enhanced
		? (enhanced.inputTokens ?? 0) + (enhanced.outputTokens ?? 0) || null
		: null;

/** Обогащение промпта; без повторов: запрос к LLM расходует лимит ключа, сбой уже превращается в fallback */
export async function enhanceStep(input: {
	id: string;
	engine: string;
	prompt: string;
}): Promise<EnhanceResult> {
	"use step";
	const enhanced = await getSpacesRuntime().enhance(input.prompt, {
		generationId: input.id,
		engine: input.engine,
	});
	if (enhanced.fallback) {
		console.warn(
			`Обогащение промпта упало в fallback: ${enhanced.error ?? "unknown"}`,
		);
	}
	return enhanced;
}
enhanceStep.maxRetries = 0;

/**
 * Одна попытка Space: ключ HF, генерация, картинка в хранилище. Без повторов:
 * каждый вызов расходует прогон ZeroGPU. Отказы возвращаются данными.
 */
export async function generateStep(
	input: AttemptInput,
): Promise<AttemptOutcome> {
	"use step";
	return getSpacesRuntime().attempt(input);
}
generateStep.maxRetries = 0;

export interface CompleteStepInput {
	id: string;
	imageKey: string;
	seed: number;
	width: number;
	height: number;
	apiKeyId: string;
	durationMs: number;
	enhanced: EnhanceResult;
}

export async function completeStep(input: CompleteStepInput): Promise<void> {
	"use step";
	const { enhanced } = input;
	const closed = await getSpacesRuntime().completeGeneration({
		id: input.id,
		imageKey: input.imageKey,
		seed: input.seed,
		width: input.width,
		height: input.height,
		enhancedPrompt: enhanced.prompt,
		durationMs: input.durationMs,
		apiKeyId: input.apiKeyId,
		llmKeyId: enhanced.keyId,
		llmModel: enhanced.model,
		llmTokens: llmTokens(enhanced),
		enhanceMs: enhanced.durationMs,
		styleVersion: enhanced.styleVersion,
	});
	if (!closed) {
		console.error(
			`Генерация ${input.id} закрыта другим путём, картинка ${input.imageKey} осталась без записи`,
		);
	}
}

export interface FailStepInput {
	id: string;
	failure: SpaceFailure;
	seed: number | null;
	durationMs: number;
	enhanced: EnhanceResult | null;
}

/**
 * Компенсация: закрывает строку и возвращает кредиты одной транзакцией по условию
 * `status = 'running'`, поэтому возврат бывает ровно один раз, даже если шаг
 * повторится.
 */
export async function failStep(input: FailStepInput): Promise<void> {
	"use step";
	const { failure, enhanced } = input;
	console.error(`Space error: ${failure.code}: ${failure.message}`);
	await getSpacesRuntime().failGeneration({
		id: input.id,
		error: errorFromFailure(failure),
		seed: input.seed,
		durationMs: input.durationMs,
		enhancedPrompt: enhanced?.prompt ?? null,
		apiKeyId: failure.apiKeyId,
		llmKeyId: enhanced?.keyId ?? null,
		llmModel: enhanced?.model ?? null,
		llmTokens: llmTokens(enhanced),
		enhanceMs: enhanced?.durationMs ?? null,
		styleVersion: enhanced?.styleVersion ?? null,
	});
}
