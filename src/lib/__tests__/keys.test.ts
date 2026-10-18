import { beforeEach, describe, expect, mock, test } from "bun:test";

let responses: Record<string, unknown[]> = {};

const mockSql = mock((strings: TemplateStringsArray, ..._values: unknown[]) => {
	const query = strings.join("?");
	for (const [pattern, result] of Object.entries(responses)) {
		if (query.includes(pattern)) return Promise.resolve(result);
	}
	return Promise.resolve([]);
});

mock.module("../db", () => ({ sql: mockSql }));

const {
	getAvailableKey,
	getAvailableLlmKey,
	AllKeysExhaustedError,
	hasConfirmedQuota,
	hasRemainingQuota,
	isKeyQuotaStale,
	rankHfKeys,
	updateKeyQuota,
	deactivateKey,
	updateKeyRateLimit,
} = await import("../keys");

function keyRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "k",
		name: "key",
		key: "hf_x",
		provider: "huggingface",
		is_active: true,
		hf_base: 300,
		hf_current: 200,
		hf_resets_at: null,
		hf_checked_at: new Date(),
		hf_runs_remaining: 5,
		hf_runs_limit: 8,
		hf_runs_resets_at: null,
		created_at: new Date(),
		...overrides,
	};
}

describe("API Keys", () => {
	beforeEach(() => {
		mockSql.mockClear();
		responses = {};
	});

	test("getAvailableKey возвращает ключ с наибольшим hf_current", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 250 }),
				keyRow({ id: "k2", hf_current: 200 }),
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k1");
	});

	test("getAvailableKey пропускает ключи с исчерпанными прогонами", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 250, hf_runs_remaining: 0 }),
				keyRow({ id: "k2", hf_current: 200, hf_runs_remaining: 3 }),
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k2");
	});

	test("getAvailableKey пропускает ключи с hf_current < 60", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 30 }),
				keyRow({ id: "k2", hf_current: 120 }),
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k2");
	});

	test("после сброса прогонов ключ с runs = 0 снова доступен", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({
					id: "k1",
					hf_runs_remaining: 0,
					hf_runs_resets_at: new Date(Date.now() - 60_000),
				}),
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k1");
	});

	test("getAvailableKey допускает ключи без замеров (NULL, фоллбэк)", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({
					id: "k3",
					hf_base: null,
					hf_current: null,
					hf_runs_remaining: null,
					hf_runs_limit: null,
					hf_runs_resets_at: null,
				}),
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k3");
	});

	test("граница секунд: 60 доступно, 59.9 — нет", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 59.9 }),
				keyRow({ id: "k2", hf_current: 60 }),
			],
		};
		const key = await getAvailableKey();
		expect(key.id).toBe("k2");
	});

	test("excludeIds исключает перебравшие ключи", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 250 }),
				keyRow({ id: "k2", hf_current: 200 }),
			],
		};
		const key = await getAvailableKey("huggingface", { excludeIds: ["k1"] });
		expect(key.id).toBe("k2");
	});

	test("excludeIds со всеми ключами даёт AllKeysExhaustedError", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1" }), keyRow({ id: "k2" })],
		};
		await expect(
			getAvailableKey("huggingface", { excludeIds: ["k1", "k2"] }),
		).rejects.toThrow(AllKeysExhaustedError);
	});

	test("getAvailableKey бросает AllKeysExhaustedError без доступных ключей", async () => {
		responses = { "FROM api_keys": [] };
		await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
	});

	test("getAvailableKey бросает AllKeysExhaustedError, когда прогоны кончились у всех", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1", hf_runs_remaining: 0 })],
		};
		await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
	});

	test("hasRemainingQuota требует и секунды, и прогоны", () => {
		expect(hasRemainingQuota({ current: 100, runsRemaining: 3 })).toBe(true);
		expect(hasRemainingQuota({ current: 30, runsRemaining: 3 })).toBe(false);
		expect(hasRemainingQuota({ current: 100, runsRemaining: 0 })).toBe(false);
		expect(hasRemainingQuota({ current: null, runsRemaining: null })).toBe(
			true,
		);
	});

	test("hasConfirmedQuota для реактивации требует оба счётчика", () => {
		expect(hasConfirmedQuota({ current: 100, runsRemaining: 3 })).toBe(true);
		expect(hasConfirmedQuota({ current: 30, runsRemaining: 3 })).toBe(false);
		expect(hasConfirmedQuota({ current: 100, runsRemaining: 0 })).toBe(false);
		expect(hasConfirmedQuota({ current: null, runsRemaining: 3 })).toBe(false);
		expect(hasConfirmedQuota({ current: 100, runsRemaining: null })).toBe(
			false,
		);
	});

	test("isKeyQuotaStale: без замеров и без прогонов — устарела", () => {
		expect(isKeyQuotaStale(keyRow({ hf_runs_limit: null }))).toBe(true);
		expect(isKeyQuotaStale(keyRow({ hf_checked_at: null }))).toBe(true);
		expect(isKeyQuotaStale(keyRow())).toBe(false);
		expect(
			isKeyQuotaStale(
				keyRow({ hf_runs_resets_at: new Date(Date.now() - 60_000) }),
			),
		).toBe(true);
	});

	test("updateKeyQuota записывает данные через SQL", async () => {
		await updateKeyQuota("k1", {
			base: 300,
			current: 200,
			resetsAt: "2026-09-15T12:00:00Z",
			runs: {
				used: 3,
				limit: 8,
				remaining: 5,
				resetsAt: "2026-09-15T12:00:00Z",
			},
		});
		expect(mockSql).toHaveBeenCalled();
		const call = mockSql.mock.calls[0];
		const strings = call![0] as TemplateStringsArray;
		const query = strings.join("?");
		expect(query).toContain("hf_base");
		expect(query).toContain("hf_current");
		expect(query).toContain("hf_resets_at");
		expect(query).toContain("hf_checked_at");
		expect(query).toContain("hf_runs_remaining");
		expect(query).toContain("hf_runs_limit");
		expect(query).toContain("hf_runs_resets_at");
		expect(query).toContain("last_error");
	});

	test("getAvailableKey('poolside') фильтрует по provider и остатку", async () => {
		responses = {
			"provider = ?": [
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
		const strings = mockSql.mock.calls[0]![0] as TemplateStringsArray;
		const providerArg = mockSql.mock.calls[0]![1] as string;
		const query = strings.join("?");
		expect(query).toContain("provider = ?");
		expect(providerArg).toBe("poolside");
		expect(query).toContain("rl_remaining > 0");
		expect(query).toContain("rl_checked_at < NOW() - INTERVAL '2 minutes'");
		expect(query).toContain("ORDER BY rl_remaining DESC NULLS LAST");
	});

	test("getAvailableKey('inception') фильтрует по provider и остатку", async () => {
		responses = {
			"provider = ?": [
				{
					id: "i1",
					name: "inception-1",
					key: "sk_x",
					provider: "inception",
					is_active: true,
					rl_limit: null,
					rl_remaining: null,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableKey("inception");
		expect(key.id).toBe("i1");
		const providerArg = mockSql.mock.calls[0]![1] as string;
		expect(providerArg).toBe("inception");
	});

	test("getAvailableKey('poolside') бросает AllKeysExhaustedError без ключей", async () => {
		responses = { "provider = ?": [] };
		await expect(getAvailableKey("poolside")).rejects.toThrow(
			AllKeysExhaustedError,
		);
	});

	test("getAvailableLlmKey берёт из единого пула poolside+inception", async () => {
		responses = {
			"provider IN ('poolside', 'inception')": [
				{
					id: "i1",
					name: "inception-1",
					key: "sk_x",
					provider: "inception",
					is_active: true,
					rl_limit: null,
					rl_remaining: null,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableLlmKey();
		expect(key.id).toBe("i1");
		const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join("?");
		expect(query).toContain("provider IN ('poolside', 'inception')");
		expect(query).toContain("rl_remaining > 0");
		expect(query).toContain("ORDER BY rl_remaining DESC NULLS LAST");
	});

	test("getAvailableLlmKey бросает AllKeysExhaustedError без ключей", async () => {
		responses = { "provider IN ('poolside', 'inception')": [] };
		await expect(getAvailableLlmKey()).rejects.toThrow(AllKeysExhaustedError);
	});

	test("getAvailableKey() по умолчанию ищет только huggingface", async () => {
		responses = { "FROM api_keys": [] };
		await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
		const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join("?");
		expect(query).toContain("provider = 'huggingface'");
		expect(query).toContain("is_active = TRUE");
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

describe("rankHfKeys: выбор ключа с учётом идущих запусков", () => {
	const ids = (keys: ReturnType<typeof rankHfKeys>) => keys.map((k) => k.id);
	const row = (over: Record<string, unknown> = {}) =>
		keyRow(over) as unknown as Parameters<typeof rankHfKeys>[0][number];

	test("без идущих запусков порядок прежний: больше секунд первым", () => {
		const ranked = rankHfKeys([
			row({ id: "k1", hf_current: 200 }),
			row({ id: "k2", hf_current: 250 }),
		]);
		expect(ids(ranked)).toEqual(["k2", "k1"]);
	});

	test("идущий запуск уводит следующий на соседний ключ с таким же запасом", () => {
		const keys = [
			row({ id: "k1", hf_current: 250 }),
			row({ id: "k2", hf_current: 240 }),
		];
		expect(ids(rankHfKeys(keys, new Map([["k1", 1]])))).toEqual(["k2", "k1"]);
	});

	test("ключ с большим запасом берёт несколько запусков подряд, пока запас не сравняется", () => {
		const keys = [
			row({ id: "big", hf_current: 290, hf_runs_remaining: 8 }),
			row({ id: "small", hf_current: 120, hf_runs_remaining: 3 }),
		];
		// запас: big 8, small 3 (по прогонам; секунд хватает на 4)
		expect(ids(rankHfKeys(keys, new Map([["big", 3]])))[0]).toBe("big");
		// при равном остатке (3 и 3) решают секунды: big всё ещё первый
		expect(ids(rankHfKeys(keys, new Map([["big", 5]])))[0]).toBe("big");
		expect(ids(rankHfKeys(keys, new Map([["big", 6]])))[0]).toBe("small");
	});

	test("запас считается по более скудному из двух счётчиков", () => {
		const keys = [
			// прогонов много, секунд на два запуска
			row({ id: "few-seconds", hf_current: 70, hf_runs_remaining: 8 }),
			// секунд много, прогонов на три
			row({ id: "few-runs", hf_current: 290, hf_runs_remaining: 3 }),
		];
		expect(ids(rankHfKeys(keys))[0]).toBe("few-runs");
	});

	test("сброшенное окно квоты возвращает ключу полный запас", () => {
		const past = new Date(Date.now() - 60_000);
		const keys = [
			row({ id: "fresh", hf_current: 100, hf_runs_remaining: 1 }),
			// счётчики устарели: окно сброшено, значит снова 300 с и 8 прогонов
			row({
				id: "reset",
				hf_current: 70,
				hf_runs_remaining: 1,
				hf_resets_at: past,
				hf_runs_resets_at: past,
			}),
		];
		expect(ids(rankHfKeys(keys))[0]).toBe("reset");
	});

	test("занятые ключи не отклоняются: если все заняты, берётся лучший из них", () => {
		const keys = [
			row({ id: "k1", hf_current: 100, hf_runs_remaining: 2 }),
			row({ id: "k2", hf_current: 100, hf_runs_remaining: 2 }),
		];
		const ranked = rankHfKeys(
			keys,
			new Map([
				["k1", 4],
				["k2", 3],
			]),
		);
		expect(ids(ranked)).toEqual(["k2", "k1"]);
	});

	test("исчерпанные и исключённые ключи не участвуют", () => {
		const keys = [
			row({ id: "gone", hf_runs_remaining: 0 }),
			row({ id: "low", hf_current: 30 }),
			row({ id: "skip", hf_current: 290 }),
			row({ id: "ok", hf_current: 100 }),
		];
		expect(ids(rankHfKeys(keys, new Map(), new Set(["skip"])))).toEqual(["ok"]);
	});

	test("ключи без замеров идут последними", () => {
		const keys = [
			row({
				id: "unknown",
				hf_base: null,
				hf_current: null,
				hf_runs_remaining: null,
				hf_runs_limit: null,
			}),
			row({ id: "known", hf_current: 100, hf_runs_remaining: 2 }),
		];
		expect(ids(rankHfKeys(keys))).toEqual(["known", "unknown"]);
	});
});
