import { sql } from "./db";
import type { ZeroGPUQuota } from "./hf";
import { isLlmProvider, type LlmProviderId } from "./llm";

export { isLlmProvider };

export type KeyProvider = "huggingface" | LlmProviderId;

export interface ApiKeyRow {
	id: string;
	name: string;
	key: string;
	provider: KeyProvider;
	is_active: boolean;
	hf_base: number | null;
	hf_current: number | null;
	hf_resets_at: Date | null;
	hf_checked_at: Date | null;
	hf_runs_remaining: number | null;
	hf_runs_limit: number | null;
	hf_runs_resets_at: Date | null;
	rl_limit: number | null;
	rl_remaining: number | null;
	rl_checked_at: Date | null;
	requests_total: number;
	tokens_total: number;
	last_error: string | null;
	created_at: Date;
}

export const HF_MIN_SECONDS = 60;

/**
 * Сколько секунд GPU уходит на один запуск, когда прикидывается, на сколько запусков
 * хватит ключа. Замер dev 2026-10-18: `top1` потерял 82 с на четыре запуска Krea 2
 * (около 20 с на запуск); у Ideogram 4 больше, отдельно не мерилось. Оценка влияет только
 * на порядок выбора, а не на допуск ключа: допуск остаётся за `HF_MIN_SECONDS`.
 */
export const HF_RUN_SECONDS_ESTIMATE = 30;

export class AllKeysExhaustedError extends Error {
	constructor() {
		super("All API keys exhausted");
	}
}

export interface GetAvailableKeyOptions {
	excludeIds?: string[];
}

function resetPassed(value: Date | string | null): boolean {
	if (value == null) return false;
	const time = new Date(value).getTime();
	return Number.isFinite(time) && time <= Date.now();
}

export function hasRemainingQuota(quota: {
	current: number | null;
	runsRemaining: number | null;
}): boolean {
	const secondsOk = quota.current == null || quota.current >= HF_MIN_SECONDS;
	const runsOk = quota.runsRemaining == null || quota.runsRemaining > 0;
	return secondsOk && runsOk;
}

export function hasConfirmedQuota(quota: {
	current: number | null;
	runsRemaining: number | null;
}): boolean {
	return (
		quota.current != null &&
		quota.current >= HF_MIN_SECONDS &&
		quota.runsRemaining != null &&
		quota.runsRemaining > 0
	);
}

function isKeyAvailable(key: ApiKeyRow): boolean {
	return hasRemainingQuota({
		current: resetPassed(key.hf_resets_at) ? null : key.hf_current,
		runsRemaining: resetPassed(key.hf_runs_resets_at)
			? null
			: key.hf_runs_remaining,
	});
}

/** Секунд GPU у ключа сейчас: после сброса окна квоты ключ снова свободен целиком (`hf_base`) */
function secondsLeft(key: ApiKeyRow): number | null {
	return resetPassed(key.hf_resets_at) ? (key.hf_base ?? null) : key.hf_current;
}

/** Прогонов у ключа сейчас: после сброса суточного окна их снова `hf_runs_limit` */
function runsLeft(key: ApiKeyRow): number | null {
	return resetPassed(key.hf_runs_resets_at)
		? (key.hf_runs_limit ?? null)
		: key.hf_runs_remaining;
}

/** На сколько запусков хватит ключа по более скудному из двух счётчиков; null — замеров нет */
function capacityOf(key: ApiKeyRow): number | null {
	const seconds = secondsLeft(key);
	const runs = runsLeft(key);
	const bySeconds =
		seconds == null ? null : Math.floor(seconds / HF_RUN_SECONDS_ESTIMATE);
	if (bySeconds == null) return runs;
	return runs == null ? bySeconds : Math.min(runs, bySeconds);
}

/**
 * Ключи HF в порядке предпочтения. Предпочтителен ключ, у которого после вычета уже
 * идущих на нём запусков остаётся больше всего запаса; при равенстве — тот, у кого
 * больше секунд. Ключи без замеров идут последними. Занятый ключ не отклоняется: если
 * заняты все, лучший из них остаётся первым, поэтому запуск не отказывает из-за
 * «занятости». Недоступные по квоте и исключённые ключи не участвуют.
 */
export function rankHfKeys(
	keys: ApiKeyRow[],
	inFlight: ReadonlyMap<string, number> = new Map(),
	excludeIds: ReadonlySet<string> = new Set(),
): ApiKeyRow[] {
	return keys
		.filter((key) => !excludeIds.has(key.id))
		.filter(isKeyAvailable)
		.map((key) => {
			const busy = inFlight.get(key.id) ?? 0;
			const capacity = capacityOf(key);
			return {
				key,
				busy,
				room: capacity === null ? null : capacity - busy,
				seconds: secondsLeft(key) ?? -1,
			};
		})
		.sort((a, b) => {
			if (a.room === null || b.room === null) {
				return a.room === b.room ? 0 : a.room === null ? 1 : -1;
			}
			return b.room - a.room || b.seconds - a.seconds || a.busy - b.busy;
		})
		.map((ranked) => ranked.key);
}

export function isKeyQuotaStale(
	key: Pick<
		ApiKeyRow,
		"hf_checked_at" | "hf_runs_limit" | "hf_resets_at" | "hf_runs_resets_at"
	>,
): boolean {
	if (!key.hf_checked_at || key.hf_runs_limit == null) return true;
	return resetPassed(key.hf_resets_at) || resetPassed(key.hf_runs_resets_at);
}

export async function getAvailableKey(
	provider: KeyProvider = "huggingface",
	options: GetAvailableKeyOptions = {},
): Promise<ApiKeyRow> {
	if (isLlmProvider(provider)) {
		const keys = (await sql`
      SELECT * FROM api_keys
      WHERE provider = ${provider}
        AND is_active = TRUE
        AND (
          rl_remaining IS NULL
          OR rl_remaining > 0
          OR rl_checked_at IS NULL
          OR rl_checked_at < NOW() - INTERVAL '2 minutes'
        )
      ORDER BY rl_remaining DESC NULLS LAST
      LIMIT 1
    `) as ApiKeyRow[];

		if (keys.length === 0) {
			throw new AllKeysExhaustedError();
		}
		return keys[0]!;
	}

	const excluded = new Set(options.excludeIds ?? []);
	const keys = (await sql`
    SELECT * FROM api_keys
    WHERE provider = 'huggingface'
      AND is_active = TRUE
  `) as ApiKeyRow[];

	const [best] = rankHfKeys(keys, new Map(), excluded);
	if (!best) {
		throw new AllKeysExhaustedError();
	}
	return best;
}

export async function getAvailableLlmKey(): Promise<ApiKeyRow> {
	const keys = (await sql`
    SELECT * FROM api_keys
    WHERE provider IN ('poolside', 'inception')
      AND is_active = TRUE
      AND (
        rl_remaining IS NULL
        OR rl_remaining > 0
        OR rl_checked_at IS NULL
        OR rl_checked_at < NOW() - INTERVAL '2 minutes'
      )
    ORDER BY rl_remaining DESC NULLS LAST
    LIMIT 1
  `) as ApiKeyRow[];

	if (keys.length === 0) {
		throw new AllKeysExhaustedError();
	}
	return keys[0]!;
}

export async function deactivateKey(
	keyId: string,
	reason?: string,
): Promise<void> {
	await sql`
    UPDATE api_keys
    SET is_active = FALSE,
        last_error = ${reason ?? null}
    WHERE id = ${keyId}
  `;
}

export async function updateKeyQuota(
	keyId: string,
	quota: ZeroGPUQuota,
	options: { lastError?: string | null } = {},
): Promise<void> {
	await sql`
    UPDATE api_keys
    SET hf_base = ${quota.base},
        hf_current = ${quota.current},
        hf_resets_at = ${quota.resetsAt},
        hf_runs_remaining = ${quota.runs?.remaining ?? null},
        hf_runs_limit = ${quota.runs?.limit ?? null},
        hf_runs_resets_at = ${quota.runs?.resetsAt ?? null},
        hf_checked_at = NOW(),
        last_error = ${options.lastError ?? null}
    WHERE id = ${keyId}
  `;
}

export async function updateKeyRateLimit(
	keyId: string,
	patch: {
		limit: number | null;
		remaining: number | null;
		inputTokens: number | null;
		outputTokens: number | null;
		error?: string | null;
	},
): Promise<void> {
	const tokens = (patch.inputTokens ?? 0) + (patch.outputTokens ?? 0);
	await sql`
    UPDATE api_keys
    SET rl_limit = ${patch.limit},
        rl_remaining = ${patch.remaining},
        rl_checked_at = NOW(),
        requests_total = requests_total + 1,
        tokens_total = tokens_total + ${tokens},
        last_error = ${patch.error ?? null}
    WHERE id = ${keyId}
  `;
}

export function keyPrefixFor(provider: string): "hf_" | "sky_" | null {
	if (provider === "huggingface") return "hf_";
	if (provider === "poolside") return "sky_";
	return null;
}

export function isValidKeyForProvider(provider: string, key: string): boolean {
	if (provider === "inception") {
		return key.trim().length > 0;
	}
	const prefix = keyPrefixFor(provider);
	return prefix !== null && key.startsWith(prefix);
}
