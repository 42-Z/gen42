import { afterEach, describe, expect, test } from "bun:test";
import { uploadAttachment } from "../attachment-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("uploadAttachment", () => {
	test("подписывает, отправляет тело и завершает загрузку", async () => {
		const calls: { url: string; method: string; body: unknown }[] = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url = String(input);
			calls.push({ url, method: init?.method ?? "GET", body: init?.body });
			if (url === "/api/attachments/sign") {
				return Response.json({
					key: "attachments/u1/scope-01/ref.png",
					name: "ref.png",
					url: "https://s3.example/put",
				});
			}
			if (url === "https://s3.example/put") {
				return new Response(null, { status: 200 });
			}
			return Response.json({
				ok: true,
				file: { name: "ref.png", kind: "image" },
			});
		}) as typeof fetch;

		const file = new File([new Uint8Array([1, 2, 3])], "ref.png", {
			type: "image/png",
		});
		expect(await uploadAttachment(file, "scope-01")).toEqual({
			name: "ref.png",
			kind: "image",
		});
		expect(calls.map((call) => call.method)).toEqual(["POST", "PUT", "POST"]);
		expect(calls[0]?.body).toBe(
			JSON.stringify({ scope: "scope-01", name: "ref.png", size: 3 }),
		);
		expect(calls[2]?.body).toBe(
			JSON.stringify({
				scope: "scope-01",
				key: "attachments/u1/scope-01/ref.png",
			}),
		);
	});

	test("ошибка сервера поднимается с его текстом", async () => {
		globalThis.fetch = (async () =>
			Response.json(
				{ error: "Файл больше 10 МБ" },
				{ status: 413 },
			)) as unknown as typeof fetch;
		const file = new File([new Uint8Array([1])], "big.png", {
			type: "image/png",
		});
		await expect(uploadAttachment(file, "scope-01")).rejects.toThrow(
			"Файл больше 10 МБ",
		);
	});

	test("сетевой сбой даёт русский текст", async () => {
		globalThis.fetch = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		const file = new File([new Uint8Array([1])], "ref.png", {
			type: "image/png",
		});
		await expect(uploadAttachment(file, "scope-01")).rejects.toThrow(
			"Не удалось загрузить вложение",
		);
	});
});
