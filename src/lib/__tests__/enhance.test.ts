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

	test("429 деактивирует ключ и пробует следующий", async () => {
		deps.callPoolside
			.mockImplementationOnce(async () => {
				throw new LlmKeyExhaustedError(429, "rejected");
			})
			.mockImplementationOnce(async () => ({
				text: GOOD_TEXT.replace("cat", "hippo DJ"),
				usage: { inputTokens: 90, outputTokens: 40, totalTokens: 130 },
				rateLimit: { limit: 60, remaining: 20 },
			}));

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("бегемот", deps);
		expect(deps.deactivateKey).toHaveBeenCalledTimes(1);
		expect(result.fallback).toBe(false);
		expect(result.prompt).toContain("hippo DJ");
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
