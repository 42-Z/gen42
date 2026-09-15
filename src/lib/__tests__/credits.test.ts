import { beforeEach, describe, expect, mock, test } from "bun:test";

let responses: Record<string, unknown[]> = {};

const mockSql = mock((strings: TemplateStringsArray, ...values: unknown[]) => {
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

const { getCredits, addCredits, deductCredit, InsufficientCreditsError } =
	await import("../credits");

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

	test("deductCredit бросает InsufficientCreditsError при пустом результате", async () => {
		responses = { "balance >= 1": [] };
		await expect(deductCredit("user-123")).rejects.toThrow(
			InsufficientCreditsError,
		);
	});
});
