import { describe, test, expect, mock, beforeEach } from "bun:test";

const originalFetch = globalThis.fetch;

describe("HuggingFace client", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("429 от HF -> KeyExhaustedError", async () => {
    globalThis.fetch = mock(async () =>
      new Response("rate limited", { status: 429 }),
    ) as any;
    const { generateImage, KeyExhaustedError } = await import("../hf");
    await expect(generateImage({ prompt: "cat" }, "hf_key"))
      .rejects.toThrow(KeyExhaustedError);
  });

  test("успешный ответ парсится в imageUrl и seed", async () => {
    const sse = 'event: complete\ndata: [{"url": "https://img.test/1.png"}, 123456]\n';
    const fetchMock = mock(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/call/generate")) {
        return Response.json({ event_id: "abc" });
      }
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    globalThis.fetch = fetchMock as any;

    const { generateImage } = await import("../hf");
    const result = await generateImage({ prompt: "cat" }, "hf_key");
    expect(result.imageUrl).toBe("https://img.test/1.png");
    expect(result.seed).toBe(123456);
  });
});
