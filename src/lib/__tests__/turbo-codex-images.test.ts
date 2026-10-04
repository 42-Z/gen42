import { describe, expect, mock, test } from "bun:test";
import { CodexImageError, editImage } from "../turbo/codex-images";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function fakeFetch(response: Response) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = mock(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return response;
	});
	return { fetch: fn as unknown as typeof fetch, calls };
}

describe("editImage", () => {
	test("с изображениями — /images/edits, inline data URL в порядке массива", async () => {
		const ok = Response.json({
			created: 1,
			data: [{ b64_json: Buffer.from(PNG).toString("base64") }],
			size: "1024x1536",
			quality: "medium",
		});
		const { fetch, calls } = fakeFetch(ok);
		const result = await editImage({
			fetch,
			prompt: "Image 1 on a throne",
			images: [
				{ mediaType: "image/png", bytes: new Uint8Array([1, 2]) },
				{ mediaType: "image/jpeg", bytes: new Uint8Array([3]) },
			],
		});

		expect(calls[0]!.url).toBe(
			"https://chatgpt.com/backend-api/codex/images/edits",
		);
		const body = JSON.parse(String(calls[0]!.init.body));
		expect(body).toEqual({
			prompt: "Image 1 on a throne",
			model: "gpt-image-2",
			n: 1,
			quality: "medium",
			size: "1024x1024",
			images: [
				{ image_url: "data:image/png;base64,AQI=" },
				{ image_url: "data:image/jpeg;base64,Aw==" },
			],
		});
		expect(calls[0]!.init.method).toBe("POST");
		expect(result.png).toEqual(PNG);
		expect(result.size).toBe("1024x1536");
		expect(result.quality).toBe("medium");
	});

	test("без изображений — /images/generations без поля images", async () => {
		const ok = Response.json({
			data: [{ b64_json: Buffer.from(PNG).toString("base64") }],
		});
		const { fetch, calls } = fakeFetch(ok);
		const result = await editImage({ fetch, prompt: "a cat", images: [] });
		expect(calls[0]!.url).toBe(
			"https://chatgpt.com/backend-api/codex/images/generations",
		);
		expect(JSON.parse(String(calls[0]!.init.body)).images).toBeUndefined();
		expect(result.size).toBeNull();
	});

	test("не-2xx превращается в CodexImageError со статусом и текстом", async () => {
		const { fetch } = fakeFetch(
			new Response("content policy", { status: 400 }),
		);
		const error = await editImage({ fetch, prompt: "x", images: [] }).catch(
			(e) => e,
		);
		expect(error).toBeInstanceOf(CodexImageError);
		expect(error.status).toBe(400);
		expect(error.message).toContain("content policy");
	});

	test("ответ без картинки — ошибка", async () => {
		const { fetch } = fakeFetch(Response.json({ data: [] }));
		await expect(editImage({ fetch, prompt: "x", images: [] })).rejects.toThrow(
			"не вернул изображение",
		);
	});

	test("сетевая ошибка оборачивается, отмена пробрасывается как есть", async () => {
		const network = (async () => {
			throw new Error("socket closed");
		}) as unknown as typeof fetch;
		const wrapped = await editImage({
			fetch: network,
			prompt: "x",
			images: [],
		}).catch((e) => e);
		expect(wrapped).toBeInstanceOf(CodexImageError);
		expect(wrapped.status).toBeNull();

		const controller = new AbortController();
		controller.abort();
		const aborted = await editImage({
			fetch: network,
			prompt: "x",
			images: [],
			signal: controller.signal,
		}).catch((e) => e);
		expect(aborted).not.toBeInstanceOf(CodexImageError);
	});
});
