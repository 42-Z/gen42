import { describe, expect, test } from "bun:test";
import { makeThumb, thumbKey } from "../thumbnails";
import { TINY_PNG } from "./helpers/turbo-fakes";

describe("thumbKey", () => {
	test("превью лежит в отдельном префиксе с расширением webp", () => {
		expect(thumbKey("generations/u1/123.png")).toBe(
			"thumbs/generations/u1/123.webp",
		);
		expect(thumbKey("generations/u1/456.jpg")).toBe(
			"thumbs/generations/u1/456.webp",
		);
	});
});

describe("makeThumb", () => {
	test("отдаёт WebP", async () => {
		const thumb = await makeThumb(TINY_PNG);
		const header = String.fromCharCode(
			...thumb.slice(0, 4),
			...thumb.slice(8, 12),
		);
		expect(header).toBe("RIFFWEBP");
	});
});
