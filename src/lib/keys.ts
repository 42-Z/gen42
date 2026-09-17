import { sql } from "./db";
import type { ZeroGPUQuota } from "./hf";

export type KeyProvider = "huggingface" | "poolside";

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
	if (provider === "poolside") {
		const keys = (await sql`
      SELECT * FROM api_keys
      WHERE provider = 'poolside'
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

	const available = keys
		.filter((key) => !excluded.has(key.id))
		.filter(isKeyAvailable)
		.sort((a, b) => (b.hf_current ?? -1) - (a.hf_current ?? -1));

	if (available.length === 0) {
		throw new AllKeysExhaustedError();
	}
	return available[0]!;
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
	const prefix = keyPrefixFor(provider);
	return prefix !== null && key.startsWith(prefix);
}
