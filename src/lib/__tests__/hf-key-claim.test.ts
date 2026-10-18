import { beforeEach, describe, expect, mock, test } from "bun:test";

let responses: Record<string, unknown[]> = {};

const baseSql = (strings: TemplateStringsArray, ..._values: unknown[]) => {
	const query = strings.join("?");
	for (const [pattern, result] of Object.entries(responses)) {
		if (query.includes(pattern)) return Promise.resolve(result);
	}
	return Promise.resolve([]);
};

const mockSql = mock(baseSql);
(mockSql as any).begin = mock(async (fn: (tx: unknown) => Promise<unknown>) =>
	fn(mockSql),
);

mock.module("../db", () => ({ sql: mockSql }));

const { claimHfKey } = await import("../hf-key-claim");
const { AllKeysExhaustedError } = await import("../keys");
const { GenerationClosedError } = await import("../hf-key-claim");

/** Ответ записи ключа в строку, пока запуск идёт: `RETURNING id` отдаёт её */
const ownRow = { "UPDATE generations": [{ id: "gen-1" }] };

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

const queries = () =>
	mockSql.mock.calls.map((call: any[]) => (call[0] as string[]).join("?"));

const paramsOf = (needle: string) => {
	const call = (mockSql.mock.calls as any[][]).find((c) =>
		(c[0] as string[]).join("?").includes(needle),
	);
	return call ? call.slice(1) : [];
};

describe("claimHfKey", () => {
	beforeEach(() => {
		mockSql.mockClear();
		((mockSql as any).begin as ReturnType<typeof mock>).mockClear();
		responses = {};
	});

	test("замок берётся до чтения ключей и подсчёта идущих, запись ключа в строку — последней", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1" })],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		await claimHfKey({ generationId: "gen-1", excludeIds: [] });

		const order = queries();
		const lock = order.findIndex((q) => q.includes("pg_advisory_xact_lock"));
		const keys = order.findIndex((q) => q.includes("FROM api_keys"));
		const busy = order.findIndex((q) => q.includes("GROUP BY api_key_id"));
		const update = order.findIndex((q) => q.includes("UPDATE generations"));
		expect(lock).toBeGreaterThanOrEqual(0);
		expect(lock).toBeLessThan(keys);
		expect(lock).toBeLessThan(busy);
		expect(update).toBeGreaterThan(Math.max(keys, busy));
		expect((mockSql as any).begin).toHaveBeenCalled();
	});

	test("идущие запуски на ключе уводят выбор на соседний ключ", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 250 }),
				keyRow({ id: "k2", hf_current: 240 }),
			],
			"GROUP BY api_key_id": [{ api_key_id: "k1", busy: 1 }],
			...ownRow,
		};
		const key = await claimHfKey({ generationId: "gen-1", excludeIds: [] });
		expect(key.id).toBe("k2");
	});

	test("без идущих выбирается ключ с наибольшим запасом", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 200 }),
				keyRow({ id: "k2", hf_current: 250 }),
			],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		const key = await claimHfKey({ generationId: "gen-1", excludeIds: [] });
		expect(key.id).toBe("k2");
	});

	test("выбранный ключ записывается в строку этого запуска, пока она идёт", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1" })],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		await claimHfKey({ generationId: "gen-1", excludeIds: [] });

		const update = queries().find((q) => q.includes("UPDATE generations"));
		expect(update).toContain("api_key_id");
		expect(update).toContain("status = 'running'");
		expect(paramsOf("UPDATE generations")).toEqual(["k1", "gen-1"]);
	});

	test("собственная строка запуска в подсчёт идущих не входит", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1" })],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		await claimHfKey({ generationId: "gen-1", excludeIds: [] });

		const busy = queries().find((q) => q.includes("GROUP BY api_key_id"));
		expect(busy).toContain("id <>");
		expect(paramsOf("GROUP BY api_key_id")).toContain("gen-1");
	});

	test("зависшие строки в подсчёт идущих не входят", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1" })],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		await claimHfKey({ generationId: "gen-1", excludeIds: [] });

		const busy = queries().find((q) => q.includes("GROUP BY api_key_id"));
		expect(busy).toContain("created_at >");
	});

	test("исключённые ключи не выбираются", async () => {
		responses = {
			"FROM api_keys": [
				keyRow({ id: "k1", hf_current: 290 }),
				keyRow({ id: "k2", hf_current: 100 }),
			],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		const key = await claimHfKey({
			generationId: "gen-1",
			excludeIds: ["k1"],
		});
		expect(key.id).toBe("k2");
	});

	test("нет доступных ключей: AllKeysExhaustedError, строка не трогается", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1", hf_runs_remaining: 0 })],
			"GROUP BY api_key_id": [],
			...ownRow,
		};
		await expect(
			claimHfKey({ generationId: "gen-1", excludeIds: [] }),
		).rejects.toThrow(AllKeysExhaustedError);
		expect(queries().some((q) => q.includes("UPDATE generations"))).toBe(false);
	});

	test("запуск уже закрыт: ключ не отдаётся, попытка не тратит прогон", async () => {
		responses = {
			"FROM api_keys": [keyRow({ id: "k1" })],
			"GROUP BY api_key_id": [],
			"UPDATE generations": [],
		};
		await expect(
			claimHfKey({ generationId: "gen-1", excludeIds: [] }),
		).rejects.toThrow(GenerationClosedError);
	});
});
