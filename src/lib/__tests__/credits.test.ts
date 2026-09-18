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
});
