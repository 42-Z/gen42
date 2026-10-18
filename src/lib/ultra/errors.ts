/** Все коды сбоев режима «Ультра»; порядок не важен */
export const ULTRA_ERROR_CODES = [
	"codex_auth_required",
	"agent_failed",
	"agent_no_generation",
	"generation_rejected",
	"agent_timeout",
] as const;

export type UltraErrorCode = (typeof ULTRA_ERROR_CODES)[number];

/** Что успело получиться до сбоя; пишется в историю для отладки */
export interface UltraErrorDetails {
	prompt?: string;
	inputImages?: string[];
}

/** Сбой режима «Ультра»: код попадает в `generations.error_message`, пользователю — общее сообщение */
export class UltraError extends Error {
	readonly details: UltraErrorDetails;

	constructor(
		public readonly code: UltraErrorCode,
		message: string,
		options: { cause?: unknown; details?: UltraErrorDetails } = {},
	) {
		super(message, { cause: options.cause });
		this.name = "UltraError";
		this.details = options.details ?? {};
	}
}

/** Единственный текст, который видит пользователь при любом сбое «Ультра» */
export const ULTRA_PUBLIC_ERROR =
	"Не удалось создать изображение, кредиты возвращены";
