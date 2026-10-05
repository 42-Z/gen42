/** Типы обмена админки с входом Codex: без серверных импортов, чтобы фронтенд мог их использовать */

export interface CodexStatus {
	loggedIn: boolean;
	planType: string | null;
	updatedAt: string | null;
	lastError: string | null;
}

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
