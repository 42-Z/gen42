import { afterEach, describe, expect, mock, test } from "bun:test";

const originalFetch = globalThis.fetch;

function llmResponse(body: unknown, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json", ...headers },
	});
}

const COMPLETION = {
	id: "chatcmpl-1",
	object: "chat.completion",
	model: "poolside/laguna-xs-2.1",
	choices: [
		{
			index: 0,
			message: { role: "assistant", content: "An ultra-detailed scene." },
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
};

describe("Poolside client", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("успешный вызов: текст, usage, заголовки, thinking выключен", async () => {
		let body: any = null;
		globalThis.fetch = mock(async (_url: string | URL, init?: RequestInit) => {
			body = JSON.parse(String(init?.body));
			return llmResponse(COMPLETION, {
				"x-ratelimit-limit-requests": "60",
				"x-ratelimit-remaining-requests": "30",
			});
		}) as any;

		const { callLlm } = await import("../llm");
		const result = await callLlm({
			provider: "poolside",
			system: "system rules",
			user: "кот",
			apiKey: "sky_test",
		});

		expect(result.text).toBe("An ultra-detailed scene.");
		expect(result.usage).toEqual({
			inputTokens: 1200,
			outputTokens: 300,
			totalTokens: 1500,
		});
		expect(result.rateLimit).toEqual({ limit: 60, remaining: 30 });
		expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(body.messages[0]).toEqual({
			role: "system",
			content: "system rules",
		});
		expect(body.messages[1].role).toBe("user");
	});

	test("429 -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ error: "rate limited" }), {
					status: 429,
					headers: { "content-type": "application/json" },
				}),
		) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "poolside",
				system: "s",
				user: "u",
				apiKey: "sky_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("401 -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ error: "unauthorized" }), {
					status: 401,
					headers: { "content-type": "application/json" },
				}),
		) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "poolside",
				system: "s",
				user: "u",
				apiKey: "sky_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("500 -> LlmCallError", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ error: "server" }), {
					status: 500,
					headers: { "content-type": "application/json" },
				}),
		) as any;
		const { callLlm, LlmCallError } = await import("../llm");
		await expect(
			callLlm({
				provider: "poolside",
				system: "s",
				user: "u",
				apiKey: "sky_test",
			}),
		).rejects.toThrow(LlmCallError);
	});
});

function llmError(status: number) {
	return new Response(JSON.stringify({ error: { message: "boom" } }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const INCEPTION_COMPLETION = {
	id: "chatcmpl-2",
	object: "chat.completion",
	model: "mercury-2.5",
	choices: [
		{
			index: 0,
			message: { role: "assistant", content: "A neon-soaked scene." },
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 1100, completion_tokens: 200, total_tokens: 1300 },
};

describe("Inception client", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("успешный вызов: mercury-2.5, reasoning_effort low, без rate-limit заголовков", async () => {
		let body: any = null;
		let url = "";
		globalThis.fetch = mock(async (input: string | URL, init?: RequestInit) => {
			url = String(input);
			body = JSON.parse(String(init?.body));
			return llmResponse(INCEPTION_COMPLETION);
		}) as any;

		const { callLlm } = await import("../llm");
		const result = await callLlm({
			provider: "inception",
			system: "system rules",
			user: "кот",
			apiKey: "sk_test",
		});

		expect(result.text).toBe("A neon-soaked scene.");
		expect(result.usage).toEqual({
			inputTokens: 1100,
			outputTokens: 200,
			totalTokens: 1300,
		});
		expect(result.rateLimit).toEqual({ limit: null, remaining: null });
		expect(url).toBe("https://api.inceptionlabs.ai/v1/chat/completions");
		expect(body.model).toBe("mercury-2.5");
		expect(body.reasoning_effort).toBe("low");
		expect(body.temperature).toBe(0.9);
		expect(body.messages[0]).toEqual({
			role: "system",
			content: "system rules",
		});
		expect(body.messages[1].role).toBe("user");
	});

	test("429 -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(async () => llmError(429)) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("402 (биллинг) -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(async () => llmError(402)) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("401 -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(async () => llmError(401)) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("500 -> LlmCallError", async () => {
		globalThis.fetch = mock(async () => llmError(500)) as any;
		const { callLlm, LlmCallError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmCallError);
	});
});
