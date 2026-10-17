/** Типы обмена админки с входом Codex: без серверных импортов, чтобы фронтенд мог их использовать */

export interface CodexStatus {
	loggedIn: boolean;
	planType: string | null;
	updatedAt: string | null;
	lastError: string | null;
}

/** Окно лимита подписки Codex (5 часов или неделя): сколько осталось и когда сброс */
export interface CodexQuotaWindow {
	/** Длина окна в секундах */
	windowSeconds: number;
	/** Остаток лимита, % */
	remainingPercent: number;
	/** Момент сброса окна, ISO */
	resetAt: string;
}

export interface CodexUsage {
	windows: CodexQuotaWindow[];
}

/** Ответ GET /api/admin/codex: состояние входа и остатки лимита подписки */
export type CodexAdminState = CodexStatus & { usage: CodexUsage | null };

/**
 * События потока входа по коду (NDJSON, по одному JSON в строке). `ping` — служебный
 * сигнал, пока админ вводит код: без него сервер и прокси закрывают молчащее соединение
 */
export type CodexLoginEvent =
	| {
			type: "code";
			userCode: string;
			verificationUrl: string;
			expiresAt: number;
	  }
	| { type: "ping" }
	| { type: "done"; planType: string | null }
	| { type: "error"; message: string };

export type CodexCheckResult =
	| { ok: true; models: string[] }
	| { ok: false; models: string[]; error: string };
