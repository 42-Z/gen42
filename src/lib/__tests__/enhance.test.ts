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

	test("без текстового запроса лозунг из ответа вырезается", async () => {
		deps.callPoolside.mockImplementation(async () => ({
			text: "A triumphant pug rides a glowing electric scooter along a neon highway while giraffes in rainbow tracksuits follow behind and a crowd of flamingos in gold chains cheers from the roadside. A neon sign flashes «НАС 42000» above the arches, confetti rains down over spilled gold bars and ruby rings, a hippopotamus DJ in a fur coat spins a diamond turntable nearby, and a zeppelin with a giant glowing 42 drifts overhead. Hyper-detailed cinematic photograph, wide-angle poster composition, physically believable materials, absurd triumphant kitsch, no watermarks.",
			usage: { inputTokens: 10, outputTokens: 40, totalTokens: 50 },
			rateLimit: { limit: 60, remaining: 10 },
		}));

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("мопс на самокате", deps);
		expect(result.fallback).toBe(false);
		expect(result.prompt).not.toContain("«");
		expect(result.prompt).not.toContain("НАС 42000");
	});

	test("повтор после потери детали сохраняет точный текст", async () => {
		deps.callPoolside
			.mockImplementationOnce(async () => ({
				text: "A pug in a leopard coat jumps over a crate in a crowded plaza while flamingos in ruby necklaces scatter confetti and a rhinoceros in a suit counts gold bars beside a diamond turntable, the whole crowd cheering under searchlights and fireworks. A golden banner carries «ЖИВИ ГРОМКО» above them. Hyper-detailed cinematic photograph, wide-angle poster composition, physically believable materials, absurd triumphant kitsch, no watermarks, no signature.",
				usage: { inputTokens: 10, outputTokens: 40, totalTokens: 50 },
				rateLimit: { limit: 60, remaining: 10 },
			}))
			.mockImplementationOnce(async () => ({
				text: "Bright laser beams shoot from the eyes of a winged humanoid figure in a split white-and-black costume while a golden banner carries «ЖИВИ ГРОМКО» above a cheering crowd of pugs, flamingos and rhinoceroses in fur coats, smoke curling from the scorched marble and gold bars spilling across the floor. Hyper-detailed cinematic photograph, wide-angle poster composition, physically believable materials, absurd triumphant kitsch, no watermarks, no signature.",
				usage: { inputTokens: 10, outputTokens: 40, totalTokens: 50 },
				rateLimit: { limit: 60, remaining: 9 },
			}));

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt(
			"человек с крыльями стреляет лазерами, плакат с надписью «ЖИВИ ГРОМКО»",
			deps,
		);
		expect(result.fallback).toBe(false);
		expect(result.prompt).toContain("laser");
		expect(result.prompt).toContain("«ЖИВИ ГРОМКО»");
		const retryCall = deps.callPoolside.mock.calls[1] as unknown as
			| [{ user: string }]
			| undefined;
		expect(retryCall?.[0].user).toContain("MISSING DETAILS");
		expect(retryCall?.[0].user).toContain("EXACT TEXT");
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
