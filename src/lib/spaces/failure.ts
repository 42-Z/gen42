import { AllKeysExhaustedError } from "../keys";
import type { SpaceFailure } from "./types";

/**
 * Данные сбоя → ошибка для `describeGenerationError`: так `error_message` остаётся в
 * прежнем формате `<код>: <текст>` (код определяет класс ошибки).
 */
export function errorFromFailure(failure: SpaceFailure): Error {
	return failure.code === "all_keys_exhausted"
		? new AllKeysExhaustedError()
		: new Error(failure.message);
}
