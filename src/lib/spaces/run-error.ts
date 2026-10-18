import type { SpaceFailure } from "./types";

/** Сбой запуска Space, брошенный кодом воркфлоу: код и ключ HF для записи истории */
export class SpaceRunError extends Error {
	constructor(
		readonly code: SpaceFailure["code"],
		message: string,
		readonly apiKeyId: string | null = null,
	) {
		super(message);
		this.name = "SpaceRunError";
	}
}

/** Что угодно, пойманное воркфлоу, превращает в данные для шага `fail` */
export function toSpaceFailure(error: unknown): SpaceFailure {
	if (error instanceof SpaceRunError) {
		return {
			code: error.code,
			message: error.message,
			apiKeyId: error.apiKeyId,
		};
	}
	return {
		code: "error",
		message: error instanceof Error ? error.message : String(error),
		apiKeyId: null,
	};
}
