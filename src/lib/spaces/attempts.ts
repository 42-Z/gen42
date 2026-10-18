import { SPACE_MAX_ATTEMPTS, SPACE_RUN_DEADLINE_MS } from "./constants";
import { SpaceRunError } from "./run-error";
import type { AttemptOutcome, AttemptSuccess } from "./types";

export interface RotationOptions {
	/** Начало воркфлоу по его часам */
	startedAt: number;
	now: () => number;
	maxAttempts?: number;
	deadlineMs?: number;
}

/**
 * Цикл попыток Space с ротацией ключей HF (код воркфлоу, детерминированный):
 * `key_exhausted` исключает ключ, `queue_timeout` повторяет тот же ключ, нет
 * ключей или прочая ошибка завершают запуск. Новые попытки не стартуют после срока.
 * Исчерпание попыток и срока даёт `all_keys_exhausted`, как у прежнего обработчика.
 */
export async function runWithRotation(
	attempt: (excludeKeyIds: string[]) => Promise<AttemptOutcome>,
	options: RotationOptions,
): Promise<AttemptSuccess> {
	const maxAttempts = options.maxAttempts ?? SPACE_MAX_ATTEMPTS;
	const deadlineMs = options.deadlineMs ?? SPACE_RUN_DEADLINE_MS;
	const exhausted: string[] = [];

	for (let n = 0; n < maxAttempts; n++) {
		if (options.now() - options.startedAt >= deadlineMs) break;
		const outcome = await attempt([...exhausted]);
		if (outcome.ok) return outcome;
		if (outcome.reason === "no_keys") break;
		if (outcome.reason === "error") {
			throw new SpaceRunError("error", outcome.message, outcome.keyId);
		}
		if (outcome.reason === "key_exhausted") exhausted.push(outcome.keyId);
	}
	throw new SpaceRunError("all_keys_exhausted", "All API keys exhausted");
}
