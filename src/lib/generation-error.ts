import { InsufficientCreditsError } from "./credits";
import { KeyExhaustedError, QueueTimeoutError } from "./hf";
import { AllKeysExhaustedError } from "./keys";

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
	} else {
		reason = "error";
	}
	return `${reason}: ${message}`.slice(0, MAX_ERROR_LENGTH);
}
