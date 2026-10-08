import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
	type CompleteGenerationParams,
	completeGeneration,
	type FailGenerationParams,
	failGeneration,
} from "../generations";
import { listObjects, readObject, uploadImage } from "../storage";
import {
	codexFetch,
	codexLanguageModel,
	createCodexAuth,
	recordCodexError,
} from "./codex-auth";
import { editImage } from "./codex-images";
import { Library } from "./library";
import type { EditFn } from "./ops";

/**
 * Всё, что шагам воркфлоу нужно от внешнего мира. Шаги берут окружение через
 * `getTurboRuntime()`, тесты подставляют своё через `setTurboRuntime()`.
 */
export interface TurboRuntime {
	/** Библиотека читается из бакета с префиксом library/; кэш дерева живёт минуту */
	library: Library;
	/** Языковая модель агента с входом по подписке */
	agentModel(modelId: string): LanguageModelV4;
	edit: EditFn;
	storeImage(key: string, png: Uint8Array): Promise<void>;
	completeGeneration(params: CompleteGenerationParams): Promise<boolean>;
	failGeneration(params: FailGenerationParams): Promise<boolean>;
	recordCodexError(message: string): Promise<void>;
	now(): number;
}

function createDefaultRuntime(): TurboRuntime {
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
		},
		completeGeneration,
		failGeneration,
		recordCodexError: async (message) => {
			await recordCodexError(message);
		},
		now: Date.now,
	};
}

let override: TurboRuntime | null = null;
let cached: TurboRuntime | null = null;

export function getTurboRuntime(): TurboRuntime {
	if (override) return override;
	cached ??= createDefaultRuntime();
	return cached;
}

/** Для тестов: подмена окружения (null возвращает боевое) */
export function setTurboRuntime(runtime: TurboRuntime | null): void {
	override = runtime;
}
