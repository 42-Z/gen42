import { sql } from "./db";

export interface ApiKeyRow {
	id: string;
	name: string;
	key: string;
	is_active: boolean;
	hf_base: number | null;
	hf_current: number | null;
	hf_resets_at: Date | null;
	hf_checked_at: Date | null;
	created_at: Date;
}

export class AllKeysExhaustedError extends Error {
	constructor() {
		super("All API keys exhausted");
	}
}

export async function getAvailableKey(): Promise<ApiKeyRow> {
	const keys = (await sql`
    SELECT * FROM api_keys
    WHERE is_active = TRUE
      AND (hf_current IS NULL OR hf_current >= 60)
    ORDER BY hf_current DESC NULLS LAST
    LIMIT 1
  `) as ApiKeyRow[];

	if (keys.length === 0) {
		throw new AllKeysExhaustedError();
	}
	return keys[0]!;
}

export async function deactivateKey(keyId: string): Promise<void> {
	await sql`
    UPDATE api_keys
    SET is_active = FALSE
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
