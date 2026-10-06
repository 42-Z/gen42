import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let responses: Record<string, unknown[]> = {};

const mockSql = mock((strings: TemplateStringsArray, ..._values: unknown[]) => {
	const query = strings.join("?");
	for (const [pattern, result] of Object.entries(responses)) {
		if (query.includes(pattern)) return Promise.resolve(result);
	}
	return Promise.resolve([]);
});

mock.module("../../lib/db", () => ({ sql: mockSql }));

const { cronRoutes } = await import("../cron");

const ROUTE = cronRoutes["/api/cron/daily-credits"];
const CRON_URL = "https://example.com/api/cron/daily-credits";

describe("Cron daily-credits", () => {
	beforeEach(() => {
		mockSql.mockClear();
		responses = {};
		delete process.env.CRON_SECRET;
	});

	afterEach(() => {
		delete process.env.CRON_SECRET;
	});

	test("без CRON_SECRET возвращает 401 и не начисляет", async () => {
		const res = await ROUTE.GET(new Request(CRON_URL));

		expect(res.status).toBe(401);
		expect(mockSql).not.toHaveBeenCalled();
	});

	test("с неверным секретом возвращает 401 и не начисляет", async () => {
		process.env.CRON_SECRET = "s3cret";

		const res = await ROUTE.GET(
			new Request(CRON_URL, {
				headers: { authorization: "Bearer wrong" },
			}),
		);

		expect(res.status).toBe(401);
		expect(mockSql).not.toHaveBeenCalled();
	});

	test("с верным секретом начисляет дневные кредиты и возвращает их число", async () => {
		process.env.CRON_SECRET = "s3cret";
		responses = {
			"RETURNING user_id": [
				{ user_id: "u1" },
				{ user_id: "u2" },
				{ user_id: "u3" },
			],
		};

		const res = await ROUTE.GET(
			new Request(CRON_URL, {
				headers: { authorization: "Bearer s3cret" },
			}),
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ granted: 3 });
	});
});
