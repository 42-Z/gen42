import type { SpaceEngine } from "../models";

/** Вход воркфлоу Krea 2 / Ideogram 4: только сериализуемое */
export interface SpaceRunInput {
	id: string;
	userId: string;
	engine: SpaceEngine;
	prompt: string;
	negativePrompt?: string;
	model: "Turbo" | "Raw";
	width: number;
	height: number;
	steps: number;
	seed: number | null;
}

/** Вход шага `generate`: одна попытка */
export interface AttemptInput {
	/** Строка запуска: ключ HF закрепляется за ней при выборе, по этому видно, сколько запусков идёт на ключе */
	generationId: string;
	userId: string;
	engine: SpaceEngine;
	/** Промпт после обогащения */
	prompt: string;
	negativePrompt?: string;
	model: "Turbo" | "Raw";
	width: number;
	height: number;
	steps: number;
	seed: number | null;
	/** Ключи HF, исчерпавшиеся в этом запуске: в попытке не участвуют */
	excludeKeyIds: string[];
}

export interface AttemptSuccess {
	ok: true;
	/** Ключ картинки в хранилище; байты по журналу воркфлоу не ходят */
	imageKey: string;
	seed: number;
	apiKeyId: string;
	durationMs: number;
}

/**
 * Исход попытки как данные: свойства ошибок не переживают границу шага, поэтому
 * причина едет значением, а решение (повторить, взять другой ключ, сдаться)
 * принимает код воркфлоу.
 */
export type AttemptOutcome =
	| AttemptSuccess
	| { ok: false; reason: "no_keys" }
	| {
			ok: false;
			reason: "key_exhausted";
			keyId: string;
			status: number;
			message: string;
	  }
	| { ok: false; reason: "queue_timeout"; keyId: string; message: string }
	| { ok: false; reason: "error"; keyId: string | null; message: string };

/** Итоговый сбой запуска для шага `fail` */
export interface SpaceFailure {
	code: "all_keys_exhausted" | "error";
	message: string;
	apiKeyId: string | null;
}
