import { describe, expect, test } from "bun:test";
import { InsufficientCreditsError } from "../credits";
import { describeGenerationError } from "../generation-error";
import { KeyExhaustedError, QueueTimeoutError } from "../hf";
import { AllKeysExhaustedError } from "../keys";

describe("describeGenerationError", () => {
	test("известные ошибки получают код причины", () => {
		expect(describeGenerationError(new InsufficientCreditsError())).toBe(
			"insufficient_credits: Insufficient credits",
		);
		expect(describeGenerationError(new AllKeysExhaustedError())).toBe(
			"all_keys_exhausted: All API keys exhausted",
		);
		expect(
			describeGenerationError(new KeyExhaustedError(429, "ZeroGPU quota")),
		).toBe("key_exhausted (429): ZeroGPU quota");
		expect(describeGenerationError(new QueueTimeoutError("очередь"))).toBe(
			"queue_timeout: очередь",
		);
	});

	test("прочие ошибки сохраняют текст", () => {
		expect(
			describeGenerationError(new Error("Не удалось скачать изображение: 502")),
		).toBe("error: Не удалось скачать изображение: 502");
		expect(describeGenerationError("boom")).toBe("error: boom");
		expect(describeGenerationError(undefined)).toBe("error: unknown");
	});

	test("длинный текст обрезается", () => {
		const text = describeGenerationError(new Error("x".repeat(5000)));
		expect(text.length).toBe(2000);
	});
});
