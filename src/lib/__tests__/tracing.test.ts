import { beforeAll, describe, expect, test } from "bun:test";
import { initTracing, traceSpan } from "../tracing";

describe("tracing требует ключ", () => {
	beforeAll(() => {
		delete process.env.BRAINTRUST_API_KEY;
	});

	test("initTracing без ключа завершает работу понятной ошибкой", () => {
		expect(() => initTracing()).toThrow(/BRAINTRUST_API_KEY/);
	});

	test("traceSpan без ключа не начинает работу", async () => {
		await expect(traceSpan("test", {}, async () => 42)).rejects.toThrow(
			/BRAINTRUST_API_KEY/,
		);
	});
});

describe("tracing с ключом", () => {
	beforeAll(() => {
		process.env.BRAINTRUST_API_KEY = "test-key-not-real";
	});

	test("initTracing идемпотентен", () => {
		initTracing();
		initTracing();
	});

	test("traceSpan выполняет работу и прокидывает её ошибки", async () => {
		const result = await traceSpan("test", {}, async () => 42);
		expect(result).toBe(42);
		await expect(
			traceSpan("test", {}, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
	});
});
