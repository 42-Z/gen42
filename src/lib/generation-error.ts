import { InsufficientCreditsError } from "./credits";
import { KeyExhaustedError, QueueTimeoutError } from "./hf";
import { AllKeysExhaustedError } from "./keys";
import {
	TURBO_ERROR_CODES,
	TURBO_PUBLIC_ERROR,
	TurboError,
} from "./turbo/errors";

const MAX_ERROR_LENGTH = 2000;

/**
 * Причина неуспешной генерации для `generations.error_message`:
 * машинный код + исходный текст ошибки, обрезанный до разумной длины.
 */
export function describeGenerationError(error: unknown): string {
	const message =
		error instanceof Error ? error.message : String(error ?? "unknown");
	let reason: string;
	if (error instanceof InsufficientCreditsError) {
		reason = "insufficient_credits";
	} else if (error instanceof AllKeysExhaustedError) {
		reason = "all_keys_exhausted";
	} else if (error instanceof KeyExhaustedError) {
		reason = `key_exhausted (${error.status})`;
	} else if (error instanceof QueueTimeoutError) {
		reason = "queue_timeout";
	} else if (error instanceof TurboError) {
		reason = error.code;
	} else {
		reason = "error";
	}
	return `${reason}: ${message}`.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Текст `generations.error_message` для пользователя: машинный код меняется на
 * понятное сообщение. При любом сбое кредиты уже возвращены — это отражено в
 * сообщениях.
 */
export function publicGenerationError(errorMessage: string | null): string {
	const code = errorMessage?.split(":")[0];
	if (code === "insufficient_credits") return "Недостаточно кредитов";
	if (code === "all_keys_exhausted") {
		return "Все ключи исчерпаны, попробуйте позже";
	}
	if (code === "interrupted") {
		return "Генерация была прервана, кредиты возвращены";
	}
	if (code && (TURBO_ERROR_CODES as readonly string[]).includes(code)) {
		return TURBO_PUBLIC_ERROR;
	}
	return "Ошибка генерации";
}
