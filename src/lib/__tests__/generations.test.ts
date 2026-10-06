import { beforeEach, describe, expect, mock, test } from "bun:test";
import { InsufficientCreditsError } from "../credits";

let responses: Record<string, unknown[]> = {};

const baseSql = (strings: TemplateStringsArray, ..._values: unknown[]) => {
	const query = strings.join("?");
	for (const [pattern, result] of Object.entries(responses)) {
		if (query.includes(pattern)) return Promise.resolve(result);
	}
	return Promise.resolve([]);
};

const mockSql = mock(baseSql);
(mockSql as any).array = (values: unknown[], oid: number) => ({ values, oid });
(mockSql as any).begin = mock(async (fn: (tx: unknown) => Promise<unknown>) =>
	fn(mockSql),
);

mock.module("../db", () => ({ sql: mockSql }));

const {
	chargeGeneration,
	completeGeneration,
	failGeneration,
	getActiveGeneration,
	getGeneration,
	startGeneration,
	INTERRUPTED_MESSAGE,
} = await import("../generations");

const BASE = {
	userId: "u1",
	prompt: "пятёрка на троне",
	engine: "krea",
	model: "Turbo",
	width: 1024,
	height: 1024,
	steps: 8,
};

const queries = () =>
	mockSql.mock.calls.map((call: any[]) => (call[0] as string[]).join("?"));

const paramsOf = (needle: string) => {
	const call = (mockSql.mock.calls as any[][]).find((c) =>
		(c[0] as string[]).join("?").includes(needle),
	);
	return call ? call.slice(1) : [];
};

function reset() {
	mockSql.mockClear();
	((mockSql as any).begin as ReturnType<typeof mock>).mockClear();
	mockSql.mockImplementation(baseSql);
	responses = {};
}

describe("startGeneration", () => {
	beforeEach(reset);

	test("клиентский id становится id записи", async () => {
		responses = { "ON CONFLICT (id) DO NOTHING": [{ id: "client-id-42" }] };
		const id = await startGeneration({ ...BASE, id: "client-id-42" });
		expect(id).toBe("client-id-42");
	});

	test("занятый id заменяется свежим", async () => {
		// первый INSERT ничего не вернул — конфликт по PK
		mockSql.mockImplementation(async (strings, ...values: any[]) => {
			const query = strings.join("?");
			if (query.includes("INSERT INTO generations")) {
				return values[0] === "client-id-42" ? [] : [{ id: values[0] }];
			}
			return [];
		});

		const id = await startGeneration({ ...BASE, id: "client-id-42" });
		expect(id).not.toBe("client-id-42");
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("без id и с мусорным id создаётся UUID", async () => {
		mockSql.mockImplementation(async (strings, ...values: any[]) => {
			const query = strings.join("?");
			if (query.includes("INSERT INTO generations")) {
				return [{ id: values[0] }];
			}
			return [];
		});

		const generated = await startGeneration(BASE);
		expect(generated).toMatch(/^[0-9a-f-]{36}$/);
		const rejected = await startGeneration({ ...BASE, id: "'; DROP TABLE--" });
		expect(rejected).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("строка появляется до списания: running и нулевой cost", async () => {
		responses = { "ON CONFLICT (id) DO NOTHING": [{ id: "gen-1" }] };
		await startGeneration({ ...BASE, id: "gen-1" });
		expect(queries()[0]).toContain("INSERT INTO generations");
		expect(queries()[0]).toContain("0, 'running'");
	});
});

describe("chargeGeneration", () => {
	beforeEach(reset);

	test("списание и отметка на строке идут одной транзакцией", async () => {
		responses = {
			"balance = balance -": [{ balance: 5 }],
			"UPDATE generations SET cost = ?": [{ id: "gen-1" }],
		};
		await chargeGeneration({ id: "gen-1", userId: "u1", cost: 3 });

		expect((mockSql as any).begin).toHaveBeenCalled();
		expect(queries()).toEqual([
			expect.stringContaining("balance = balance -"),
			expect.stringContaining("UPDATE generations SET cost = ?"),
		]);
	});

	test("нехватка кредитов: строка не помечается списанной", async () => {
		responses = { "balance = balance -": [] };
		await expect(
			chargeGeneration({ id: "gen-1", userId: "u1", cost: 3 }),
		).rejects.toThrow(InsufficientCreditsError);
		expect(queries().some((q) => q.includes("UPDATE generations"))).toBe(false);
	});
});

describe("completeGeneration и failGeneration", () => {
	beforeEach(reset);

	test("complete закрывает строку и сообщает об этом", async () => {
		responses = { "SET status = 'completed'": [{ id: "gen-1" }] };
		const closed = await completeGeneration({
			id: "gen-1",
			imageKey: "generations/u1/1.png",
			seed: 7,
			width: 1024,
			height: 1024,
			durationMs: 1000,
		});
		expect(closed).toBe(true);
		expect(queries()[0]).toContain("status = 'running'");
	});

	test("complete при чужом закрытии возвращает false", async () => {
		responses = { "SET status = 'completed'": [] };
		const closed = await completeGeneration({
			id: "gen-1",
			imageKey: "generations/u1/1.png",
			seed: 7,
			width: 1024,
			height: 1024,
			durationMs: 1000,
		});
		expect(closed).toBe(false);
	});

	test("fail закрывает строку и возвращает списанные кредиты", async () => {
		responses = {
			"WHERE id = ? AND status = 'running'": [
				{ id: "gen-1", user_id: "u1", cost: 3 },
			],
		};
		const closed = await failGeneration({
			id: "gen-1",
			error: new Error("сбой"),
			durationMs: 1000,
		});

		expect(closed).toBe(true);
		expect((mockSql as any).begin).toHaveBeenCalled();
		expect(paramsOf("WHERE id = ? AND status = 'running'")).toContain(
			"error: сбой",
		);
		expect(queries()).toEqual([
			expect.stringContaining("SET status = 'failed'"),
			expect.stringContaining("balance = balance +"),
			expect.stringContaining("UPDATE generations SET cost = 0"),
		]);
	});

	test("fail без списанных кредитов ничего не возвращает", async () => {
		responses = {
			"WHERE id = ? AND status = 'running'": [
				{ id: "gen-1", user_id: "u1", cost: 0 },
			],
		};
		await failGeneration({
			id: "gen-1",
			error: new Error("сбой"),
			durationMs: 1,
		});
		expect(queries().some((q) => q.includes("balance = balance +"))).toBe(
			false,
		);
	});

	test("fail повторно не закрывает строку и не возвращает кредиты", async () => {
		responses = { "WHERE id = ? AND status = 'running'": [] };
		const closed = await failGeneration({
			id: "gen-1",
			error: new Error("сбой"),
			durationMs: 1,
		});
		expect(closed).toBe(false);
		expect(queries().some((q) => q.includes("balance = balance +"))).toBe(
			false,
		);
	});
});

describe("чтение генераций", () => {
	beforeEach(reset);

	const row = {
		id: "gen-1",
		user_id: "u1",
		prompt: "пятёрка на троне",
		engine: "krea",
		model: "Turbo",
		seed: 7,
		width: 1024,
		height: 1024,
		steps: 8,
		cost: 3,
		image_key: null,
		status: "running",
		error_message: null,
		duration_ms: null,
		created_at: "2026-10-06 12:00:00",
	};

	test("getGeneration отдаёт запись пользователя", async () => {
		responses = { "WHERE id = ? AND user_id = ?": [row] };
		const record = await getGeneration("u1", "gen-1");
		expect(record).toMatchObject({
			id: "gen-1",
			userId: "u1",
			status: "running",
			seed: 7,
		});
	});

	test("getGeneration не отдаёт чужие записи", async () => {
		responses = { "WHERE id = ? AND user_id = ?": [] };
		expect(await getGeneration("u2", "gen-1")).toBeNull();
	});

	test("getActiveGeneration возвращает идущую генерацию", async () => {
		responses = { "ORDER BY created_at DESC": [row] };
		const record = await getActiveGeneration("u1");
		expect(record?.id).toBe("gen-1");
	});

	test("зависшие генерации закрываются с возвратом кредитов", async () => {
		responses = {
			"AND created_at <": [{ id: "gen-1", user_id: "u1", cost: 3 }],
			"ORDER BY created_at DESC": [{ ...row, id: "gen-2" }],
		};
		const record = await getActiveGeneration("u1");

		expect(paramsOf("AND created_at <")).toContain(INTERRUPTED_MESSAGE);
		expect(queries().some((q) => q.includes("balance = balance +"))).toBe(true);
		expect(record?.id).toBe("gen-2");
	});

	test("бесплатные зависшие не приводят к возврату", async () => {
		responses = {
			"AND created_at <": [{ id: "gen-1", user_id: "u1", cost: 0 }],
			"ORDER BY created_at DESC": [],
		};
		await getActiveGeneration("u1");
		expect(queries().some((q) => q.includes("balance = balance +"))).toBe(
			false,
		);
	});
});
