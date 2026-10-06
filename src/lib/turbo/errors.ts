/** Все коды сбоев режима «Турбо»; порядок не важен */
export const TURBO_ERROR_CODES = [
	"codex_auth_required",
	"agent_failed",
	"agent_no_generation",
	"generation_rejected",
	"agent_timeout",
] as const;

export type TurboErrorCode = (typeof TURBO_ERROR_CODES)[number];

/** Что успело получиться до сбоя; пишется в историю для отладки */
export interface TurboErrorDetails {
	prompt?: string;
	inputImages?: string[];
}

/** Сбой режима «Турбо»: код попадает в `generations.error_message`, пользователю — общее сообщение */
export class TurboError extends Error {
	readonly details: TurboErrorDetails;

	constructor(
		public readonly code: TurboErrorCode,
		message: string,
		options: { cause?: unknown; details?: TurboErrorDetails } = {},
	) {
		super(message, { cause: options.cause });
		this.name = "TurboError";
		this.details = options.details ?? {};
	}
}

/** Единственный текст, который видит пользователь при любом сбое Турбо */
export const TURBO_PUBLIC_ERROR =
	"Не удалось создать изображение, кредиты возвращены";
