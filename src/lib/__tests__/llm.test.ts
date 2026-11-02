import { afterEach, describe, expect, mock, test } from "bun:test";

const originalFetch = globalThis.fetch;

function llmResponse(body: unknown, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("реестр LLM", () => {
	test("Poolside удалён, остаётся Inception", async () => {
		const { isLlmProvider, LLM_PROVIDERS } = await import("../llm");
		expect(isLlmProvider("inception")).toBe(true);
		expect(isLlmProvider("poolside")).toBe(false);
		expect(LLM_PROVIDERS).not.toHaveProperty("poolside");
		expect(Object.keys(LLM_PROVIDERS)).toEqual(["inception"]);
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
	model: "mercury-3",
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

	test("успешный вызов: mercury-3, reasoning_effort low, без rate-limit заголовков", async () => {
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
		expect(body.model).toBe("mercury-3");
		expect(body.reasoning_effort).toBe("low");
		expect(body.temperature).toBe(0.9);
		expect(body.chat_template_kwargs).toBeUndefined();
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
