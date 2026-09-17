import { sql } from "./db";

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
	rl_limit: number | null;
	rl_remaining: number | null;
	rl_checked_at: Date | null;
	requests_total: number;
	tokens_total: number;
	last_error: string | null;
	created_at: Date;
}

export class AllKeysExhaustedError extends Error {
	constructor() {
		super("All API keys exhausted");
	}
}

export async function getAvailableKey(
	provider: KeyProvider = "huggingface",
): Promise<ApiKeyRow> {
	const keys =
		provider === "poolside"
			? ((await sql`
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
        `) as ApiKeyRow[])
			: ((await sql`
          SELECT * FROM api_keys
          WHERE provider = 'huggingface'
            AND is_active = TRUE
            AND (hf_current IS NULL OR hf_current >= 60)
          ORDER BY hf_current DESC NULLS LAST
          LIMIT 1
        `) as ApiKeyRow[]);

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
	quota: { base: number; current: number; resetsAt: string | null },
): Promise<void> {
	await sql`
    UPDATE api_keys
    SET hf_base = ${quota.base},
        hf_current = ${quota.current},
        hf_resets_at = ${quota.resetsAt},
        hf_checked_at = NOW()
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
