import { ToolChoiceViolationError } from "ai";
import { TURBO_ERROR_CODES, TurboError, type TurboErrorCode } from "./errors";

/**
 * Сбой запуска Турбо как обычные данные: проходит границы шагов и воркфлоу без
 * потерь. Код едет не в свойствах ошибки (они не переживают границу шага), а в
 * начале текста: «код: текст», как в `generations.error_message`.
 */
export interface TurboFailure {
	code: TurboErrorCode;
	message: string;
	/** Итоговый промпт агента, если он успел его выбрать */
	prompt: string | null;
	inputImages: string[];
}

export interface FailureContext {
	prompt?: string | null;
	inputImages?: string[];
}

const CODE_PREFIX = new RegExp(`^(${TURBO_ERROR_CODES.join("|")}): `);
const NO_GENERATION_MESSAGE = "Агент завершил работу, не вызвав generateImage";

export function prefixedMessage(code: TurboErrorCode, text: string): string {
	return `${code}: ${text}`;
}

function statusOf(error: unknown): number | null {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const candidate = current as {
			statusCode?: unknown;
			lastError?: unknown;
			cause?: unknown;
		};
		if (typeof candidate.statusCode === "number") return candidate.statusCode;
		current = candidate.lastError ?? candidate.cause;
	}
	return null;
}

export function isAuthFailure(error: unknown): boolean {
	const status = statusOf(error);
	if (status === 401 || status === 403) return true;
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const code = (current as { code?: unknown }).code;
		if (
			code === "auth_required" ||
			code === "refresh_failed" ||
			code === "workspace_mismatch"
		) {
			return true;
		}
		current =
			(current as { lastError?: unknown; cause?: unknown }).lastError ??
			(current as { cause?: unknown }).cause;
	}
	return false;
}

/** Всё, что пришло из агента, шага или SDK, превращает в сбой с понятным кодом */
export function toFailure(
	error: unknown,
	context: FailureContext = {},
): TurboFailure {
	const prompt = context.prompt ?? null;
	const inputImages = context.inputImages ?? [];
	if (error instanceof TurboError) {
		return {
			code: error.code,
			message: error.message,
			prompt: error.details.prompt ?? prompt,
			inputImages: error.details.inputImages ?? inputImages,
		};
	}
	const base = { prompt, inputImages };
	const message = error instanceof Error ? error.message : String(error);
	const prefixed = CODE_PREFIX.exec(message);
	if (prefixed) {
		return {
			...base,
			code: prefixed[1] as TurboErrorCode,
			message: message.slice(prefixed[0].length),
		};
	}
	const name = (error as { name?: string } | null)?.name;
	if (
		name === "TimeoutError" ||
		name === "AbortError" ||
		/deadline expired/i.test(message)
	) {
		return { ...base, code: "agent_timeout", message };
	}
	// модель ответила без вызова инструмента при toolChoice "required"
	if (
		ToolChoiceViolationError.isInstance(error) ||
		name === "AI_ToolChoiceViolationError"
	) {
		return {
			...base,
			code: "agent_no_generation",
			message: NO_GENERATION_MESSAGE,
		};
	}
	if (isAuthFailure(error)) {
		return { ...base, code: "codex_auth_required", message };
	}
	return { ...base, code: "agent_failed", message };
}

/**
 * Сбой модели внутри шага: мёртвый вход Codex получает код в тексте ошибки,
 * чтобы воркфлоу узнал его после границы шага; остальное пробрасывается как есть.
 */
export function rethrowModelError(error: unknown): never {
	if (isAuthFailure(error)) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(prefixedMessage("codex_auth_required", message), {
			cause: error,
		});
	}
	throw error;
}
