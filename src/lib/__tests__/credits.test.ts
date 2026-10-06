import { beforeEach, describe, expect, mock, test } from "bun:test";

let responses: Record<string, unknown[]> = {};

const mockSql = mock((strings: TemplateStringsArray, ..._values: unknown[]) => {
	const query = strings.join("?");
	for (const [pattern, result] of Object.entries(responses)) {
		if (query.includes(pattern)) return Promise.resolve(result);
	}
	return Promise.resolve([]);
});
(mockSql as any).begin = mock(async (fn: (tx: any) => Promise<void>) => {
	await fn(mockSql);
});

mock.module("../db", () => ({ sql: mockSql }));

const {
	getCredits,
	addCredits,
	deductCredits,
	refundCredits,
	grantDailyCredits,
	grantSignupCredits,
	DAILY_GRANT_CREDITS,
	InsufficientCreditsError,
} = await import("../credits");

describe("Credits", () => {
	beforeEach(() => {
		mockSql.mockClear();
		responses = {};
	});

	test("getCredits возвращает баланс через UPSERT RETURNING", async () => {
		responses = { "RETURNING balance": [{ balance: 5 }] };
		const balance = await getCredits("user-123");
		expect(balance).toBe(5);
	});

	test("addCredits добавляет кредиты через UPSERT", async () => {
		responses = { "DO UPDATE SET balance": [{ balance: 10 }] };
		const newBalance = await addCredits("user-123", 10);
		expect(newBalance).toBe(10);
		expect(mockSql).toHaveBeenCalled();
	});

	test("deductCredits бросает InsufficientCreditsError при пустом результате", async () => {
		responses = { "balance >= ?": [] };
		await expect(deductCredits("user-123", 3)).rejects.toThrow(
			InsufficientCreditsError,
		);
	});

	test("deductCredits списывает сумму и сравнивает баланс с ней", async () => {
		responses = { "balance >= ?": [{ balance: 2 }] };
		const balance = await deductCredits("user-123", 3);
		expect(balance).toBe(2);

		const strings = mockSql.mock.calls[0]![0] as TemplateStringsArray;
		const values = mockSql.mock.calls[0]!.slice(1);
		expect(strings.join("?")).toContain("balance >= ?");
		expect(values).toContain(3);
		expect(values).toContain("user-123");
	});

	test("deductCredits отклоняет неположительную сумму", async () => {
		await expect(deductCredits("user-123", 0)).rejects.toThrow(
			"Invalid credit amount",
		);
		await expect(deductCredits("user-123", 1.5)).rejects.toThrow(
			"Invalid credit amount",
		);
	});

	test("refundCredits возвращает списанную сумму", async () => {
		await refundCredits("user-123", 3);
		const strings = mockSql.mock.calls[0]![0] as TemplateStringsArray;
		const values = mockSql.mock.calls[0]!.slice(1);
		expect(strings.join("?")).toContain("balance = balance + ?");
		expect(values).toContain(3);
	});

	test("grantDailyCredits начисляет 42 и дату МСК каждому ещё не получившему за день", async () => {
		expect(DAILY_GRANT_CREDITS).toBe(42);
		responses = {
			"RETURNING user_id": [{ user_id: "u1" }, { user_id: "u2" }],
		};

		const granted = await grantDailyCredits();
		expect(granted).toBe(2);

		const strings = mockSql.mock.calls[0]![0] as TemplateStringsArray;
		const values = mockSql.mock.calls[0]!.slice(1);
		expect(strings.join("?")).toContain("Europe/Moscow");
		expect(strings.join("?")).toContain("NOT EXISTS");
		expect(strings.join("?")).toContain("last_grant_date");
		expect(values).toContain(42);
	});

	test("grantDailyCredits идемпотентен: начислённый за день пользователь не возвращается", async () => {
		responses = { "RETURNING user_id": [] };

		const granted = await grantDailyCredits();
		expect(granted).toBe(0);

		const strings = mockSql.mock.calls[0]![0] as TemplateStringsArray;
		// защита от двойной выдачи при одновременных вызовах крона
		expect(strings.join("?")).toContain("IS DISTINCT FROM");
	});

	test("grantSignupCredits выдаёт стартовый баланс с датой МСК", async () => {
		await grantSignupCredits("user-123");

		const strings = mockSql.mock.calls[0]![0] as TemplateStringsArray;
		const values = mockSql.mock.calls[0]!.slice(1);
		expect(strings.join("?")).toContain("DO NOTHING");
		expect(strings.join("?")).toContain("last_grant_date");
		expect(strings.join("?")).toContain("Europe/Moscow");
		expect(values).toContain("user-123");
		expect(values).toContain(DAILY_GRANT_CREDITS);
	});
});
