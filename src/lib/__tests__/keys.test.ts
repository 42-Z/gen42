import { describe, test, expect, mock, beforeEach } from "bun:test";

let responses: Record<string, unknown[]> = {};

const mockSql = mock((strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.join("?");
  for (const [pattern, result] of Object.entries(responses)) {
    if (query.includes(pattern)) return Promise.resolve(result);
  }
  return Promise.resolve([]);
});

mock.module("../db", () => ({ sql: mockSql }));

const {
  getAvailableKey,
  AllKeysExhaustedError,
  incrementKeyUsage,
} = await import("../keys");

describe("API Keys", () => {
  beforeEach(() => {
    mockSql.mockClear();
    responses = {};
  });

  test("getAvailableKey возвращает ключ с наибольшим остатком", async () => {
    responses = { "FROM api_keys": [{
      id: "k1", name: "top1", key: "hf_x", daily_limit: 100,
      used_today: 10, is_active: true, last_reset_at: new Date(), created_at: new Date(),
    }] };
    const key = await getAvailableKey();
    expect(key.id).toBe("k1");
  });

  test("getAvailableKey бросает AllKeysExhaustedError без доступных ключей", async () => {
    responses = { "FROM api_keys": [] };
    await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
  });

  test("incrementKeyUsage инкрементирует атомарно через SQL", async () => {
    await incrementKeyUsage("k1");
    expect(mockSql).toHaveBeenCalled();
    const query = mockSql.mock.calls[0][0].join("?");
    expect(query).toContain("used_today + 1");
  });
});
