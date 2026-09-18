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

	test("ZeroGPU quota в event: error -> KeyExhaustedError", async () => {
		const sse = `event: error\ndata: {"error": "You have exceeded your free ZeroGPU quota (82s requested vs. -41s left). Try again in 0:00:00.", "duration": 10, "visible": true, "title": "ZeroGPU quota exceeded"}\n`;
		const fetchMock = mock(async (url: string | URL) => {
			const u = String(url);
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "abc" });
			}
			return new Response(sse, { status: 200 });
		});
		globalThis.fetch = fetchMock as any;

		const { generateImage, KeyExhaustedError } = await import("../hf");
		await expect(generateImage({ prompt: "cat" }, "hf_key")).rejects.toThrow(
			KeyExhaustedError,
		);
	});

	test("ZeroGPU queue timeout -> QueueTimeoutError, не KeyExhaustedError", async () => {
		const sse = `event: error\ndata: {"error": "No GPU was available after 60s. Subscribe to Pro to get the highest priority in ZeroGPU queues.", "duration": 10, "visible": true, "title": "ZeroGPU queue timeout"}\n`;
		const fetchMock = mock(async (url: string | URL) => {
			const u = String(url);
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "abc" });
			}
			return new Response(sse, { status: 200 });
		});
		globalThis.fetch = fetchMock as any;

		const { generateImage, KeyExhaustedError, QueueTimeoutError } =
			await import("../hf");
		const promise = generateImage({ prompt: "cat" }, "hf_key");
		await expect(promise).rejects.toThrow(QueueTimeoutError);
		await expect(promise).rejects.not.toThrow(KeyExhaustedError);
	});

	test("прочий event: error -> обычная ошибка", async () => {
		const sse =
			'event: error\ndata: {"error": "GPU task aborted", "title": "Error"}\n';
		const fetchMock = mock(async (url: string | URL) => {
			const u = String(url);
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "abc" });
			}
			return new Response(sse, { status: 200 });
		});
		globalThis.fetch = fetchMock as any;

		const { generateImage, KeyExhaustedError } = await import("../hf");
		const promise = generateImage({ prompt: "cat" }, "hf_key");
		await expect(promise).rejects.toThrow("GPU task aborted");
		await expect(promise).rejects.not.toThrow(KeyExhaustedError);
	});

	test("Ideogram 4: отдельный Space и payload с mode/upsampler", async () => {
		const sse =
			'event: complete\ndata: [{"url": "https://img.test/idea.png"}, 42]\n';
		const calls: { url: string; body: any }[] = [];
		globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
			const u = String(url);
			calls.push({
				url: u,
				body: init?.body ? JSON.parse(String(init.body)) : null,
			});
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "idea" });
			}
			return new Response(sse, { status: 200 });
		}) as any;

		const { generateImage } = await import("../hf");
		const result = await generateImage(
			{ engine: "ideogram", prompt: "poster", negativePrompt: "blur" },
			"hf_key",
		);

		expect(calls[0]!.url).toContain("ideogram-ai-ideogram4.hf.space");
		expect(calls[0]!.body.prompt).toBe("poster");
		expect(calls[0]!.body.mode).toBe("Default · 20 steps");
		expect(calls[0]!.body.upsampler).toBe("Ideogram (remote)");
		expect(calls[0]!.body.randomize_seed).toBe(true);
		expect(calls[0]!.body.negative_prompt).toBeUndefined();
		expect(calls[0]!.body.steps).toBeUndefined();
		expect(result.imageUrl).toBe("https://img.test/idea.png");
		expect(result.seed).toBe(42);
	});

	test("Ideogram 4: фолбэк опроса на /call/{api}/{id} при 404", async () => {
		const sse =
			'event: complete\ndata: [{"url": "https://img.test/f.png"}, 7]\n';
		const urls: string[] = [];
		globalThis.fetch = mock(async (url: string | URL) => {
			const u = String(url);
			urls.push(u);
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "abc" });
			}
			if (u.includes("/call/v2/generate/abc")) {
				return new Response("not found", { status: 404 });
			}
			return new Response(sse, { status: 200 });
		}) as any;

		const { generateImage } = await import("../hf");
		const result = await generateImage(
			{ engine: "ideogram", prompt: "cat" },
			"hf_key",
		);

		expect(urls.some((u) => u.endsWith("/call/generate/abc"))).toBe(true);
		expect(result.imageUrl).toBe("https://img.test/f.png");
	});

	test("Ideogram 4: ZeroGPU quota в event: error -> KeyExhaustedError", async () => {
		const sse = `event: error\ndata: {"error": "You have exceeded your free ZeroGPU quota", "title": "ZeroGPU quota exceeded"}\n`;
		globalThis.fetch = mock(async (url: string | URL) => {
			const u = String(url);
			if (u.endsWith("/call/v2/generate")) {
				return Response.json({ event_id: "abc" });
			}
			return new Response(sse, { status: 200 });
		}) as any;

		const { generateImage, KeyExhaustedError } = await import("../hf");
		await expect(
			generateImage({ engine: "ideogram", prompt: "cat" }, "hf_key"),
		).rejects.toThrow(KeyExhaustedError);
	});
});

describe("getZeroGPUQuota", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("возвращает quota вместе с суточными прогонами", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({
				base: 300,
				current: 278.5,
				resetsAt: "2026-09-15T12:00:00Z",
				overquotaUsed: 0,
				runs: {
					used: 3,
					limit: 8,
					remaining: 5,
					resetsAt: "2026-09-15T12:00:04Z",
				},
			}),
		) as any;
		const { getZeroGPUQuota } = await import("../hf");
		const q = await getZeroGPUQuota("hf_test");
		expect(q).toEqual({
			base: 300,
			current: 278.5,
			resetsAt: "2026-09-15T12:00:00Z",
			runs: {
				used: 3,
				limit: 8,
				remaining: 5,
				resetsAt: "2026-09-15T12:00:04Z",
			},
		});
	});

	test("без блока runs прогоны считаются неизвестными", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ base: 300, current: 278.5, resetsAt: null }),
		) as any;
		const { getZeroGPUQuota } = await import("../hf");
		const q = await getZeroGPUQuota("hf_test");
		expect(q?.runs).toBeNull();
	});

	test("нечисловые поля runs заменяются на null", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({
				base: 300,
				current: 278.5,
				resetsAt: null,
				runs: { used: "много", limit: null, remaining: 0 },
			}),
		) as any;
		const { getZeroGPUQuota } = await import("../hf");
		const q = await getZeroGPUQuota("hf_test");
		expect(q?.runs).toEqual({
			used: null,
			limit: null,
			remaining: 0,
			resetsAt: null,
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
