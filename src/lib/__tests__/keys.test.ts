import { beforeEach, describe, expect, mock, test } from "bun:test";

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
	deactivateKey,
	updateKeyRateLimit,
} = await import("../keys");

describe("API Keys", () => {
	beforeEach(() => {
		mockSql.mockClear();
		responses = {};
	});

	test("getAvailableKey возвращает ключ с наибольшим hf_current", async () => {
		responses = {
			"FROM api_keys": [
				{
					id: "k1",
					name: "top1",
					key: "hf_x",
					is_active: true,
					hf_base: 300,
					hf_current: 250,
					hf_resets_at: null,
					hf_checked_at: null,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k1");
	});

	test("getAvailableKey пропускает ключи с hf_current < 60", async () => {
		// Мок возвращает пустой результат — ключ с hf_current=30 отфильтрован WHERE
		responses = { "FROM api_keys": [] };
		await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
	});

	test("getAvailableKey допускает ключи с hf_current IS NULL (фоллбэк)", async () => {
		responses = {
			"FROM api_keys": [
				{
					id: "k3",
					name: "unknown",
					key: "hf_z",
					is_active: true,
					hf_base: null,
					hf_current: null,
					hf_resets_at: null,
					hf_checked_at: null,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k3");
	});

	test("getAvailableKey бросает AllKeysExhaustedError без доступных ключей", async () => {
		responses = { "FROM api_keys": [] };
		await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
	});

	test("updateKeyQuota записывает данные через SQL", async () => {
		await updateKeyQuota("k1", {
			base: 300,
			current: 200,
			resetsAt: "2026-09-15T12:00:00Z",
		});
		expect(mockSql).toHaveBeenCalled();
		const call = mockSql.mock.calls[0];
		const strings = call![0] as TemplateStringsArray;
		const query = strings.join("?");
		expect(query).toContain("hf_base");
		expect(query).toContain("hf_current");
		expect(query).toContain("hf_resets_at");
		expect(query).toContain("hf_checked_at");
	});

	test("getAvailableKey('poolside') фильтрует по provider и остатку", async () => {
		responses = {
			"provider = 'poolside'": [
				{
					id: "p1",
					name: "poolside-1",
					key: "sky_x",
					provider: "poolside",
					is_active: true,
					rl_limit: 60,
					rl_remaining: 30,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableKey("poolside");
		expect(key.id).toBe("p1");
		const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join("?");
		expect(query).toContain("provider = 'poolside'");
		expect(query).toContain("rl_remaining");
	});

	test("getAvailableKey('poolside') бросает AllKeysExhaustedError без ключей", async () => {
		responses = { "provider = 'poolside'": [] };
		await expect(getAvailableKey("poolside")).rejects.toThrow(
			AllKeysExhaustedError,
		);
	});

	test("getAvailableKey() по умолчанию ищет только huggingface", async () => {
		responses = { "FROM api_keys": [] };
		await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
		const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join("?");
		expect(query).toContain("provider = 'huggingface'");
	});

	test("deactivateKey пишет причину", async () => {
		await deactivateKey("p1", "Poolside key rejected: 429");
		const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join("?");
		expect(query).toContain("is_active = FALSE");
		expect(query).toContain("last_error");
	});

	test("updateKeyRateLimit инкрементит счётчики", async () => {
		await updateKeyRateLimit("p1", {
			limit: 60,
			remaining: 29,
			inputTokens: 1200,
			outputTokens: 300,
		});
		const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join("?");
		expect(query).toContain("rl_remaining");
		expect(query).toContain("requests_total = requests_total + 1");
		expect(query).toContain("tokens_total = tokens_total +");
	});
});
