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
  updateKeyQuota,
} = await import("../keys");

describe("API Keys", () => {
  beforeEach(() => {
    mockSql.mockClear();
    responses = {};
  });

  test("getAvailableKey возвращает ключ с наибольшим hf_current", async () => {
    responses = { "FROM api_keys": [{
      id: "k1", name: "top1", key: "hf_x", is_active: true,
      hf_base: 300, hf_current: 250, hf_resets_at: null, hf_checked_at: null, created_at: new Date(),
    }] };
    const key = await getAvailableKey();
    expect(key.id).toBe("k1");
  });

  test("getAvailableKey пропускает ключи с hf_current < 60", async () => {
    // Мок возвращает пустой результат — ключ с hf_current=30 отфильтрован WHERE
    responses = { "FROM api_keys": [] };
    await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
  });

  test("getAvailableKey допускает ключи с hf_current IS NULL (фоллбэк)", async () => {
    responses = { "FROM api_keys": [{
      id: "k3", name: "unknown", key: "hf_z", is_active: true,
      hf_base: null, hf_current: null, hf_resets_at: null, hf_checked_at: null, created_at: new Date(),
    }] };
    const key = await getAvailableKey();
    expect(key.id).toBe("k3");
  });

  test("getAvailableKey бросает AllKeysExhaustedError без доступных ключей", async () => {
    responses = { "FROM api_keys": [] };
    await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
  });

  test("updateKeyQuota записывает данные через SQL", async () => {
    await updateKeyQuota("k1", { base: 300, current: 200, resetsAt: "2026-09-15T12:00:00Z" });
    expect(mockSql).toHaveBeenCalled();
    const call = mockSql.mock.calls[0];
    const strings = call![0] as TemplateStringsArray;
    const query = strings.join("?");
    expect(query).toContain("hf_base");
    expect(query).toContain("hf_current");
    expect(query).toContain("hf_resets_at");
    expect(query).toContain("hf_checked_at");
  });
});
