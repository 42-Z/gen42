import { sql } from "./db";

export interface ApiKeyRow {
  id: string;
  name: string;
  key: string;
  daily_limit: number;
  used_today: number;
  is_active: boolean;
  last_used_at: Date | null;
  last_reset_at: Date;
  created_at: Date;
}

export class AllKeysExhaustedError extends Error {
  constructor() {
    super("All API keys exhausted");
  }
}

async function resetStaleKeys(): Promise<void> {
  await sql`
    UPDATE api_keys
    SET used_today = 0, last_reset_at = NOW(), is_active = TRUE
    WHERE last_reset_at < DATE_TRUNC('day', NOW())
  `;
}

export async function getAvailableKey(): Promise<ApiKeyRow> {
  await resetStaleKeys();

  const keys = await sql`
    SELECT * FROM api_keys
    WHERE is_active = TRUE AND used_today < daily_limit
    ORDER BY (daily_limit - used_today) DESC
    LIMIT 1
  `;

  if (keys.length === 0) {
    throw new AllKeysExhaustedError();
  }
  return keys[0];
}

export async function deactivateKey(keyId: string): Promise<void> {
  await sql`
    UPDATE api_keys
    SET is_active = FALSE
    WHERE id = ${keyId}
  `;
}

export async function incrementKeyUsage(keyId: string): Promise<void> {
  await sql`
    UPDATE api_keys
    SET used_today = used_today + 1, last_used_at = NOW()
    WHERE id = ${keyId}
  `;
}

export async function importKeysFromCsv(csvPath: string): Promise<number> {
  const text = await Bun.file(csvPath).text();
  const rows: { name: string; key: string }[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, key] = trimmed.split(";");
    if (name && key?.startsWith("hf_")) {
      rows.push({ name: name.trim(), key: key.trim() });
    }
  }

  if (rows.length === 0) return 0;

  await sql`INSERT INTO api_keys (id, name, key) ${sql(rows.map(r => ({ id: crypto.randomUUID(), ...r })))}
    ON CONFLICT (key) DO NOTHING`;

  return rows.length;
}
