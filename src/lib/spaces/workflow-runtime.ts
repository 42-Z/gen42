import { type EnhanceResult, enhancePrompt } from "../enhance";
import {
	type CompleteGenerationParams,
	completeGeneration,
	type FailGenerationParams,
	failGeneration,
} from "../generations";
import { generateImage, getZeroGPUQuota } from "../hf";
import { claimHfKey } from "../hf-key-claim";
import { normalizeContentType } from "../image-format";
import { updateKeyQuota } from "../keys";
import { uploadImage } from "../storage";
import { storeThumb } from "../thumbnails";
import { initTracing, traceSpan } from "../tracing";
import { type AttemptDeps, runAttempt } from "./attempt";
import type { AttemptInput, AttemptOutcome } from "./types";

/**
 * Всё, что шагам воркфлоу Krea 2 / Ideogram 4 нужно от внешнего мира. Шаги берут
 * окружение через `getSpacesRuntime()`, тесты подставляют своё через
 * `setSpacesRuntime()`.
 */
export interface SpacesRuntime {
	enhance(
		prompt: string,
		meta: { generationId: string; engine: string },
	): Promise<EnhanceResult>;
	attempt(input: AttemptInput): Promise<AttemptOutcome>;
	completeGeneration(params: CompleteGenerationParams): Promise<boolean>;
	failGeneration(params: FailGenerationParams): Promise<boolean>;
	now(): number;
}

function createDefaultRuntime(): SpacesRuntime {
	// шаги воркфлоу идут отдельными вызовами функций — каждый вход инициализирует трассировку
	initTracing();
	const deps: AttemptDeps = {
		getAvailableKey: (options) => claimHfKey(options),
		generateImage,
		refreshQuota: async (key, lastError) => {
			const quota = await getZeroGPUQuota(key.key);
			if (quota) {
				await updateKeyQuota(key.id, quota, lastError ? { lastError } : {});
			}
		},
		download: async (url) => {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Не удалось скачать изображение: ${response.status}`);
			}
			return {
				bytes: new Uint8Array(await response.arrayBuffer()),
				contentType: normalizeContentType(response.headers.get("content-type")),
			};
		},
		store: async (imageKey, bytes, contentType) => {
			await uploadImage(imageKey, Buffer.from(bytes), contentType);
			await storeThumb(imageKey, bytes);
		},
		now: Date.now,
	};
	return {
		enhance: (prompt, meta) =>
			traceSpan("enhance", { input: prompt, metadata: meta }, () =>
				enhancePrompt(prompt),
			),
		attempt: (input) => runAttempt(deps, input),
		completeGeneration,
		failGeneration,
		now: Date.now,
	};
}

let override: SpacesRuntime | null = null;
let cached: SpacesRuntime | null = null;

export function getSpacesRuntime(): SpacesRuntime {
	if (override) return override;
	cached ??= createDefaultRuntime();
	return cached;
}

/** Для тестов: подмена окружения (null возвращает боевое) */
export function setSpacesRuntime(runtime: SpacesRuntime | null): void {
	override = runtime;
}
