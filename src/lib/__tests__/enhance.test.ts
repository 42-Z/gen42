import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EnhanceDeps } from "../enhance";
import { AllKeysExhaustedError } from "../keys";
import { LlmKeyExhaustedError } from "../poolside";

const GOOD_TEXT =
	"A colossal cat on a diamond throne, gold chains with a «42» medallion, pugs in leopard coats, fireworks spelling 42, neon banners reading «СЛАВА 42», confetti rain, hyper-detailed cinematic photograph, wide-angle poster composition, epic scale, absurd triumphant kitsch, no watermarks, no signature at all.";

const KEY = {
	id: "p1",
	name: "poolside-1",
	key: "sky_test",
} as Awaited<ReturnType<EnhanceDeps["getAvailableKey"]>>;

function makeDeps() {
	const deps = {
		getAvailableKey: mock(async () => KEY),
		deactivateKey: mock(async () => {}),
		updateKeyRateLimit: mock(async () => {}),
		callPoolside: mock(async () => ({
			text: GOOD_TEXT,
			usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
			rateLimit: { limit: 60, remaining: 29 },
		})),
		deadlineMs: 35_000,
	};
	return deps as unknown as EnhanceDeps & typeof deps;
}

describe("enhancePrompt", () => {
	let deps: ReturnType<typeof makeDeps>;

	beforeEach(() => {
		deps = makeDeps();
	});

	test("успешный путь: чистит текст, пишет метрики", async () => {
		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("кот", deps);
		expect(result.fallback).toBe(false);
		expect(result.keyId).toBe("p1");
		expect(result.prompt.startsWith("A colossal cat")).toBe(true);
		expect(result.inputTokens).toBe(100);
		expect(result.outputTokens).toBe(50);
		expect(deps.updateKeyRateLimit).toHaveBeenCalledTimes(1);
	});

	test("429 не деактивирует ключ, а обнуляет остаток и пробует следующий", async () => {
		deps.callPoolside
			.mockImplementationOnce(async () => {
				throw new LlmKeyExhaustedError(429, "rate limited");
			})
			.mockImplementationOnce(async () => ({
				text: GOOD_TEXT.replace("cat", "hippopotamus DJ"),
				usage: { inputTokens: 90, outputTokens: 40, totalTokens: 130 },
				rateLimit: { limit: 60, remaining: 20 },
			}));

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("бегемот", deps);
		expect(deps.deactivateKey).not.toHaveBeenCalled();
		expect(deps.updateKeyRateLimit).toHaveBeenCalledWith(
			"p1",
			expect.objectContaining({ remaining: 0 }),
		);
		expect(result.fallback).toBe(false);
		expect(result.prompt).toContain("hippopotamus DJ");
	});

	test("401 деактивирует ключ с причиной", async () => {
		deps.callPoolside
			.mockImplementationOnce(async () => {
				throw new LlmKeyExhaustedError(401, "invalid key");
			})
			.mockImplementationOnce(async () => ({
				text: GOOD_TEXT,
				usage: { inputTokens: 90, outputTokens: 40, totalTokens: 130 },
				rateLimit: { limit: 60, remaining: 20 },
			}));

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("кот", deps);
		expect(deps.deactivateKey).toHaveBeenCalledWith("p1", "invalid key");
		expect(result.fallback).toBe(false);
	});

	test("повтор после брака контракта приходит с причиной отказа", async () => {
		deps.callPoolside.mockImplementation(async () => ({
			text: "too short",
			usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
			rateLimit: { limit: 60, remaining: 10 },
		}));

		const { enhancePrompt } = await import("../enhance");
		await enhancePrompt("кот", deps);
		const prompts = deps.callPoolside.mock.calls.map(
			(call: any) => call[0].user as string,
		);
		expect(prompts).toHaveLength(2);
		expect(prompts[1]).toContain("PREVIOUS ATTEMPT WAS REJECTED");
		expect(prompts[1]).toContain("too short");
	});

	test("битый контракт -> повтор, затем fallback", async () => {
		deps.callPoolside.mockImplementation(async () => ({
			text: "too short",
			usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
			rateLimit: { limit: 60, remaining: 10 },
		}));

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("кот", deps);
		expect(result.fallback).toBe(true);
		expect(result.keyId).toBeNull();
		expect(result.prompt).toContain("кот");
		expect(deps.callPoolside).toHaveBeenCalledTimes(2);
	});

	test("дедлайн обрывает попытки и уходит в fallback", async () => {
		deps.deadlineMs = 25;
		deps.callPoolside.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 40));
			throw new Error("transport failure");
		});

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("кот", deps);
		expect(result.fallback).toBe(true);
		expect(result.error).toContain("deadline");
		expect(deps.callPoolside).toHaveBeenCalledTimes(1);
	});

	test("нет ключей -> сразу fallback", async () => {
		deps.getAvailableKey.mockImplementationOnce(async () => {
			throw new AllKeysExhaustedError();
		});

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("кот", deps);
		expect(result.fallback).toBe(true);
		expect(deps.callPoolside).not.toHaveBeenCalled();
	});
});
