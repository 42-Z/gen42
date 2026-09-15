import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalFetch = globalThis.fetch;

describe("HuggingFace client", () => {
	beforeEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("429 от HF -> KeyExhaustedError", async () => {
		globalThis.fetch = mock(
			async () => new Response("rate limited", { status: 429 }),
		) as any;
		const { generateImage, KeyExhaustedError } = await import("../hf");
		await expect(generateImage({ prompt: "cat" }, "hf_key")).rejects.toThrow(
			KeyExhaustedError,
		);
	});

	test("успешный ответ парсится в imageUrl и seed", async () => {
		const sse =
			'event: complete\ndata: [{"url": "https://img.test/1.png"}, 123456]\n';
		const calls: { url: string; body: any }[] = [];
		const fetchMock = mock(async (url: string | URL, init?: RequestInit) => {
			const u = String(url);
			calls.push({
				url: u,
				body: init?.body ? JSON.parse(String(init.body)) : null,
			});
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "abc" });
			}
			return new Response(sse, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		});
		globalThis.fetch = fetchMock as any;

		const { generateImage } = await import("../hf");
		const result = await generateImage({ prompt: "cat" }, "hf_key");
		expect(result.imageUrl).toBe("https://img.test/1.png");
		expect(result.seed).toBe(123456);

		// payload — именованные поля, без старого data-массива (иначе Space отдаёт event: error)
		expect(calls[0]!.url).toContain("/call/v2/generate");
		expect(calls[0]!.body.prompt).toBe("cat");
		expect(calls[0]!.body.data).toBeUndefined();
		expect(calls[1]!.url).toContain("/call/v2/generate/abc");
	});
});

describe("getZeroGPUQuota", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("возвращает quota при успешном ответе", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({
				base: 300,
				current: 278.5,
				resetsAt: "2026-09-15T12:00:00Z",
				overquotaUsed: 0,
			}),
		) as any;
		const { getZeroGPUQuota } = await import("../hf");
		const q = await getZeroGPUQuota("hf_test");
		expect(q).toEqual({
			base: 300,
			current: 278.5,
			resetsAt: "2026-09-15T12:00:00Z",
		});
	});

	test("возвращает null при ошибке API", async () => {
		globalThis.fetch = mock(
			async () => new Response("error", { status: 500 }),
		) as any;
		const { getZeroGPUQuota } = await import("../hf");
		const q = await getZeroGPUQuota("hf_test");
		expect(q).toBeNull();
	});

	test("возвращает null при сетевой ошибке", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("network");
		}) as any;
		const { getZeroGPUQuota } = await import("../hf");
		const q = await getZeroGPUQuota("hf_test");
		expect(q).toBeNull();
	});
});
