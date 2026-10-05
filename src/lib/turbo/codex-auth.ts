import { createOpenAIOAuthProvider } from "openai-oauth-ai-provider/ai-sdk";
import { codex } from "openai-oauth-ai-provider/codex";
import {
	createAuthenticatedFetch,
	DEFAULT_ORIGINATOR,
	type DeviceAuthorization,
	OpenAIOAuth,
	type OpenAIOAuthTokens,
	type TokenStore,
} from "openai-oauth-ai-provider/core";
import { sql as defaultSql } from "../db";
import type {
	CodexCheckResult,
	CodexLoginEvent,
	CodexQuotaWindow,
	CodexStatus,
	CodexUsage,
} from "./codex-events";
import { TURBO_AGENT_MODEL } from "./constants";

type Sql = typeof defaultSql;

/**
 * Заголовок originator для запросов подписки. Если Codex перестанет принимать значение
 * пакета, задайте CODEX_ORIGINATOR в окружении (клиент Codex шлёт `codex_cli_rs`).
 */
export const CODEX_ORIGINATOR =
	process.env.CODEX_ORIGINATOR ?? DEFAULT_ORIGINATOR;

/**
 * Версия клиента для запроса списка моделей. Бэкенд Codex фильтрует модели по версии
 * клиента: с версией пакета (0.1.0) список пуст, с версией текущего Codex CLI приходят
 * все. Если «Проверить» перестанет находить модель агента, поднимите значение до версии
 * актуального Codex CLI (или задайте CODEX_CLIENT_VERSION в окружении).
 */
export const CODEX_CLIENT_VERSION =
	process.env.CODEX_CLIENT_VERSION || "0.160.0";

/** Ключ блокировки Postgres: обновление токена идёт строго по одному, во всех экземплярах функции */
const REFRESH_LOCK_KEY = 4_200_042;

function isTokens(value: unknown): value is OpenAIOAuthTokens {
	if (typeof value !== "object" || value === null) return false;
	const tokens = value as Partial<OpenAIOAuthTokens>;
	return (
		typeof tokens.accessToken === "string" &&
		tokens.accessToken.length > 0 &&
		typeof tokens.idToken === "string" &&
		typeof tokens.refreshToken === "string" &&
		tokens.refreshToken.length > 0 &&
		typeof tokens.updatedAt === "number"
	);
}

/** Токены подписки в таблице `codex_auth` (одна строка). Наружу не отдаются. */
export class DbTokenStore implements TokenStore {
	constructor(private readonly db: Sql = defaultSql) {}

	async load(): Promise<OpenAIOAuthTokens | undefined> {
		const rows = await this.db`SELECT tokens FROM codex_auth WHERE id = 1`;
		const tokens = rows[0]?.tokens;
		return isTokens(tokens) ? tokens : undefined;
	}

	async save(tokens: OpenAIOAuthTokens): Promise<void> {
		const json = this.db.json(tokens as unknown as Parameters<Sql["json"]>[0]);
		await this.db`
      INSERT INTO codex_auth (id, tokens, account_id, plan_type, last_error, updated_at)
      VALUES (1, ${json}, ${tokens.accountId ?? null}, ${tokens.planType ?? null}, NULL, NOW())
      ON CONFLICT (id) DO UPDATE SET
        tokens = EXCLUDED.tokens,
        account_id = EXCLUDED.account_id,
        plan_type = EXCLUDED.plan_type,
        last_error = NULL,
        updated_at = NOW()
    `;
	}

	async clear(): Promise<void> {
		await this.db`DELETE FROM codex_auth WHERE id = 1`;
	}

	async withLock<T>(operation: () => Promise<T>): Promise<T> {
		const result = await this.db.begin(async (tx) => {
			await tx`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_KEY}::bigint)`;
			return operation();
		});
		return result as T;
	}
}

/**
 * Новый менеджер входа на каждое использование: он помнит токены только в
 * пределах своей жизни, поэтому чужое обновление или выход подхватываются
 * из базы, а не из памяти давно живущего экземпляра функции.
 */
export function createCodexAuth(db: Sql = defaultSql): OpenAIOAuth {
	return new OpenAIOAuth({ tokenStore: new DbTokenStore(db) });
}

/** fetch для запросов к Codex с подставленным входом (заголовки, обновление токена) */
export function codexFetch(auth: OpenAIOAuth): typeof globalThis.fetch {
	return createAuthenticatedFetch(auth, { originator: CODEX_ORIGINATOR });
}

/** Языковая модель агента через подписку */
export function codexLanguageModel(auth: OpenAIOAuth, modelId: string) {
	return createOpenAIOAuthProvider({ auth, originator: CODEX_ORIGINATOR })(
		modelId,
	);
}

export async function getCodexStatus(
	db: Sql = defaultSql,
): Promise<CodexStatus> {
	const rows = await db`
    SELECT plan_type, last_error, updated_at, tokens IS NOT NULL AS logged_in
    FROM codex_auth WHERE id = 1
  `;
	const row = rows[0];
	if (!row) {
		return {
			loggedIn: false,
			planType: null,
			updatedAt: null,
			lastError: null,
		};
	}
	return {
		loggedIn: Boolean(row.logged_in),
		planType: row.plan_type ?? null,
		updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
		lastError: row.last_error ?? null,
	};
}

/** Турбо существует для пользователей, пока есть вход и он не помечен нерабочим */
export async function isTurboAvailable(db: Sql = defaultSql): Promise<boolean> {
	const rows = await db`
    SELECT 1 FROM codex_auth
    WHERE id = 1 AND tokens IS NOT NULL AND last_error IS NULL
  `;
	return rows.length > 0;
}

export async function recordCodexError(
	message: string,
	db: Sql = defaultSql,
): Promise<void> {
	await db`
    UPDATE codex_auth SET last_error = ${message.slice(0, 1000)}, updated_at = NOW()
    WHERE id = 1
  `;
}

async function clearCodexError(db: Sql): Promise<void> {
	await db`UPDATE codex_auth SET last_error = NULL WHERE id = 1`;
}

/** «Проверить»: вход жив и на аккаунте есть модель агента */
export async function checkCodex(
	auth: OpenAIOAuth,
	db: Sql = defaultSql,
): Promise<CodexCheckResult> {
	const client = codex({
		auth,
		originator: CODEX_ORIGINATOR,
		clientVersion: CODEX_CLIENT_VERSION,
	});
	let slugs: string[];
	try {
		slugs = (await client.listCodexModels()).map((model) => model.slug);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await recordCodexError(message, db);
		return { ok: false, models: [], error: message };
	}
	if (!slugs.includes(TURBO_AGENT_MODEL)) {
		const message = `Модель ${TURBO_AGENT_MODEL} недоступна на этом аккаунте`;
		await recordCodexError(message, db);
		return { ok: false, models: slugs, error: message };
	}
	await clearCodexError(db);
	return { ok: true, models: slugs };
}

/** Окно лимита из ответа /wham/usage; непонятное поле — null, окно пропускается */
function quotaWindow(value: unknown): CodexQuotaWindow | null {
	if (typeof value !== "object" || value === null) return null;
	const entry = value as Record<string, unknown>;
	const used = entry.used_percent;
	const resetAt = entry.reset_at;
	const length = entry.limit_window_seconds;
	if (
		typeof used !== "number" ||
		typeof resetAt !== "number" ||
		typeof length !== "number"
	) {
		return null;
	}
	return {
		windowSeconds: length,
		remainingPercent: Math.max(0, Math.min(100, Math.round(100 - used))),
		resetAt: new Date(resetAt * 1000).toISOString(),
	};
}

/** Разбирает ответ /wham/usage в окна лимита подписки; нет данных — null */
export function parseCodexUsage(raw: unknown): CodexUsage | null {
	if (typeof raw !== "object" || raw === null) return null;
	const rateLimit = (raw as { rate_limit?: unknown }).rate_limit;
	if (typeof rateLimit !== "object" || rateLimit === null) return null;
	const source = rateLimit as {
		primary_window?: unknown;
		secondary_window?: unknown;
	};
	const windows = [source.primary_window, source.secondary_window]
		.map(quotaWindow)
		.filter((window): window is CodexQuotaWindow => window !== null);
	return windows.length > 0 ? { windows } : null;
}

/**
 * Остатки лимита подписки для админки. Сбой или незнакомый формат — null:
 * состояние входа важнее, страница из-за лимитов падать не должна.
 */
export async function getCodexUsage(
	auth: OpenAIOAuth,
): Promise<CodexUsage | null> {
	try {
		const client = codex({
			auth,
			originator: CODEX_ORIGINATOR,
			clientVersion: CODEX_CLIENT_VERSION,
		});
		return parseCodexUsage(await client.getCodexUsage());
	} catch (error) {
		console.error("Не удалось получить лимиты подписки Codex:", error);
		return null;
	}
}

export interface DeviceLogin {
	loginWithDeviceCode(options: {
		onVerification?: (
			authorization: DeviceAuthorization,
		) => void | Promise<void>;
		signal?: AbortSignal;
	}): Promise<OpenAIOAuthTokens>;
}

/** Bun закрывает ответ, молчащий дольше 10 с (`idleTimeout`), — пинг идёт вдвое чаще */
export const LOGIN_KEEPALIVE_MS = 5_000;

/**
 * Вход по коду как поток NDJSON: сначала код и ссылка, затем итог. Пакет держит
 * ожидание подтверждения в памяти этого вызова, поэтому ответ живёт, пока админ
 * вводит код; чтобы соединение не оборвалось от простоя, поток шлёт `ping`.
 */
export function codexLoginStream(
	auth: DeviceLogin,
	signal?: AbortSignal,
	keepAliveMs = LOGIN_KEEPALIVE_MS,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let timer: ReturnType<typeof setInterval> | undefined;
	let open = true;
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			// Клиент мог уйти: запись и закрытие закрытого потока бросают исключение
			const send = (event: CodexLoginEvent) => {
				if (open) {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				}
			};
			timer = setInterval(() => send({ type: "ping" }), keepAliveMs);
			try {
				const tokens = await auth.loginWithDeviceCode({
					...(signal ? { signal } : {}),
					onVerification: ({ userCode, verificationUrl, expiresAt }) =>
						send({ type: "code", userCode, verificationUrl, expiresAt }),
				});
				send({ type: "done", planType: tokens.planType ?? null });
			} catch (error) {
				send({
					type: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			} finally {
				clearInterval(timer);
				if (open) controller.close();
				open = false;
			}
		},
		cancel() {
			open = false;
			clearInterval(timer);
		},
	});
}
