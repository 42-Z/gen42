import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
	type CompleteGenerationParams,
	completeGeneration,
	type FailGenerationParams,
	failGeneration,
	setGenerationPhase,
} from "../generations";
import { listObjects, readObject, uploadImage } from "../storage";
import { storeThumb } from "../thumbnails";
import { initTracing } from "../tracing";
import {
	codexFetch,
	codexLanguageModel,
	createCodexAuth,
	recordCodexError,
} from "./codex-auth";
import { editImage } from "./codex-images";
import { Library } from "./library";
import type { EditFn } from "./ops";
import type { UltraPhase } from "./phase";

/**
 * Всё, что шагам воркфлоу нужно от внешнего мира. Шаги берут окружение через
 * `getUltraRuntime()`, тесты подставляют своё через `setUltraRuntime()`.
 */
export interface UltraRuntime {
	/** Библиотека читается из бакета с префиксом library/; кэш дерева живёт минуту */
	library: Library;
	/** Языковая модель агента с входом по подписке */
	agentModel(modelId: string): LanguageModelV4;
	edit: EditFn;
	storeImage(key: string, png: Uint8Array): Promise<void>;
	completeGeneration(params: CompleteGenerationParams): Promise<boolean>;
	failGeneration(params: FailGenerationParams): Promise<boolean>;
	/** Стадия прогона для анимации ожидания; сбой не роняет генерацию */
	setPhase(id: string, phase: UltraPhase): Promise<void>;
	recordCodexError(message: string): Promise<void>;
	now(): number;
}

function createDefaultRuntime(): UltraRuntime {
	// шаги воркфлоу идут отдельными вызовами функций — каждый вход инициализирует трассировку
	initTracing();
	return {
		library: new Library({ list: listObjects, read: readObject }),
		// новый менеджер входа на вызов: токены читаются из базы, а не из памяти экземпляра
		agentModel: (modelId) => codexLanguageModel(createCodexAuth(), modelId),
		edit: ({ prompt, images, signal }) =>
			editImage({
				fetch: codexFetch(createCodexAuth()),
				prompt,
				images,
				...(signal ? { signal } : {}),
			}),
		storeImage: async (key, png) => {
			await uploadImage(key, Buffer.from(png), "image/png");
			await storeThumb(key, png);
		},
		completeGeneration,
		failGeneration,
		setPhase: setGenerationPhase,
		recordCodexError: async (message) => {
			await recordCodexError(message);
		},
		now: Date.now,
	};
}

let override: UltraRuntime | null = null;
let cached: UltraRuntime | null = null;

export function getUltraRuntime(): UltraRuntime {
	if (override) return override;
	cached ??= createDefaultRuntime();
	return cached;
}

/** Для тестов: подмена окружения (null возвращает боевое) */
export function setUltraRuntime(runtime: UltraRuntime | null): void {
	override = runtime;
}
