import { beforeAll, describe, expect, test } from "bun:test";
import {
	evalExperimentName,
	initTracing,
	logEvalRun,
	traceSpan,
} from "../tracing";

beforeAll(() => {
	// тесты проверяют no-op-ветку: ключа быть не должно
	delete process.env.BRAINTRUST_API_KEY;
});

describe("tracing", () => {
	test("traceSpan выполняет работу и возвращает результат", async () => {
		const result = await traceSpan("test", {}, async () => 42);
		expect(result).toBe(42);
	});

	test("ошибка работы проходит наружу", async () => {
		await expect(
			traceSpan("test", {}, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
	});

	test("initTracing идемпотентен и не падает без ключа", () => {
		initTracing();
		initTracing();
	});

	test("logEvalRun — no-op без ключа", async () => {
		await logEvalRun({
			suite: "style42",
			stamp: "2026-10-11T00-00-00",
			records: [{ input: "a", output: "b", metadata: { x: 1 } }],
		});
	});

	test("имя эксперимента", () => {
		expect(evalExperimentName("turbo", "2026-10-11T00-00-00")).toBe(
			"turbo-2026-10-11T00-00-00",
		);
	});
});
