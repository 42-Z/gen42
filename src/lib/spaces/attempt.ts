import type { generateImage } from "../hf";
import { KeyExhaustedError, QueueTimeoutError } from "../hf";
import { imageExtension } from "../image-format";
import type { ApiKeyRow } from "../keys";
import { AllKeysExhaustedError } from "../keys";
import type { AttemptInput, AttemptOutcome } from "./types";

type HfKey = Pick<ApiKeyRow, "id" | "name" | "key">;

/** Внешний мир одной попытки; боевые реализации собирает `workflow-runtime.ts`, тесты подставляют свои */
export interface AttemptDeps {
	/** Выбирает ключ и закрепляет его за запуском (`generationId`); бросает AllKeysExhaustedError */
	getAvailableKey(options: {
		excludeIds: string[];
		generationId: string;
	}): Promise<HfKey>;
	generateImage: typeof generateImage;
	/** Обновляет квоту ключа после использования */
	refreshQuota(key: HfKey, lastError?: string): Promise<void>;
	download(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
	/** Картинка и превью в хранилище */
	store(
		imageKey: string,
		bytes: Uint8Array,
		contentType: string,
	): Promise<void>;
	now(): number;
}

/**
 * Одна попытка: ключ HF → Space → скачивание → хранилище → квота. Все исходы,
 * включая отказы, возвращаются данными (`AttemptOutcome`): ошибки не пересекают
 * границу шага, решение о повторе принимает воркфлоу.
 */
export async function runAttempt(
	deps: AttemptDeps,
	input: AttemptInput,
): Promise<AttemptOutcome> {
	const startedAt = deps.now();
	let key: HfKey | null = null;
	/** Где оборвалась попытка: по тексту непредвиденной ошибки этого не понять, а в журнал нужно */
	let stage = "выбор ключа";

	/** Квота нужна для выбора следующего ключа, но сбой её обновления не отменяет исход попытки */
	const refreshQuota = async (used: HfKey, lastError?: string) => {
		try {
			if (lastError === undefined) await deps.refreshQuota(used);
			else await deps.refreshQuota(used, lastError);
		} catch (error) {
			console.error(`Не удалось обновить квоту ключа ${used.name}:`, error);
		}
	};

	try {
		key = await deps.getAvailableKey({
			excludeIds: input.excludeKeyIds,
			generationId: input.generationId,
		});
		stage = "Space";
		const result = await deps.generateImage(
			{
				engine: input.engine,
				prompt: input.prompt,
				negativePrompt: input.negativePrompt,
				model: input.model,
				width: input.width,
				height: input.height,
				steps: input.steps,
				seed: input.seed,
			},
			key.key,
		);
		stage = "скачивание";
		const { bytes, contentType } = await deps.download(result.imageUrl);
		const imageKey = `generations/${input.userId}/${deps.now()}.${imageExtension(contentType)}`;
		stage = "хранилище";
		await deps.store(imageKey, bytes, contentType);
		await refreshQuota(key);
		return {
			ok: true,
			imageKey,
			seed: result.seed,
			apiKeyId: key.id,
			durationMs: deps.now() - startedAt,
		};
	} catch (error) {
		if (error instanceof AllKeysExhaustedError) {
			return { ok: false, reason: "no_keys" };
		}
		if (key && error instanceof QueueTimeoutError) {
			await refreshQuota(key, error.message);
			return {
				ok: false,
				reason: "queue_timeout",
				keyId: key.id,
				message: error.message,
			};
		}
		if (key && error instanceof KeyExhaustedError) {
			await refreshQuota(key, error.message);
			return {
				ok: false,
				reason: "key_exhausted",
				keyId: key.id,
				status: error.status,
				message: error.message,
			};
		}
		console.error(`Попытка Space оборвалась на этапе «${stage}»:`, error);
		if (key) await refreshQuota(key);
		return {
			ok: false,
			reason: "error",
			keyId: key?.id ?? null,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
