import { describe, expect, test } from "bun:test";
import * as thumbnails from "../thumbnails";
import { TINY_PNG } from "./helpers/ultra-fakes";

const { makeThumb, thumbKey } = thumbnails;

async function pngFixture(width: number, height: number) {
	return new Bun.Image(TINY_PNG).resize(width, height).png().bytes();
}

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

describe("previewKey", () => {
	test("крупное превью использует версионированный префикс, не ключ сетки", () => {
		expect(thumbnails.previewKey).toBeFunction();
		for (const [original, expected] of [
			["generations/u1/123.png", "previews/v1/generations/u1/123.webp"],
			["generations/u1/456.jpg", "previews/v1/generations/u1/456.webp"],
			[
				"generations/u.1/без расширения",
				"previews/v1/generations/u.1/без расширения.webp",
			],
			["generations/u1/a.b.png", "previews/v1/generations/u1/a.b.webp"],
		]) {
			expect(thumbnails.previewKey(original!)).toBe(expected!);
		}
	});
});

describe("makeThumb", () => {
	test("сохраняет качество 80 для сетки", async () => {
		const original = await pngFixture(320, 200);
		const expected = await new Bun.Image(original)
			.webp({ quality: 80 })
			.bytes();
		expect(await makeThumb(original)).toEqual(expected);
	});

	test("отдаёт WebP", async () => {
		const thumb = await makeThumb(TINY_PNG);
		const header = String.fromCharCode(
			...thumb.slice(0, 4),
			...thumb.slice(8, 12),
		);
		expect(header).toBe("RIFFWEBP");
	});

	test.each([
		[2400, 1200, 640, 320],
		[1200, 2400, 320, 640],
		[320, 200, 320, 200],
	])(
		"сетка %i×%i → %i×%i без растяжения",
		async (width, height, wantWidth, wantHeight) => {
			const original = await pngFixture(width, height);
			const thumb = await makeThumb(original);
			expect(await new Bun.Image(thumb).metadata()).toMatchObject({
				width: wantWidth,
				height: wantHeight,
				format: "webp",
			});
		},
	);
});

describe("makePreview", () => {
	test("кодирует с качеством 90, не меняя оригинал", async () => {
		expect(thumbnails.makePreview).toBeFunction();
		const original = await pngFixture(320, 200);
		const unchanged = original.slice();
		const expected = await new Bun.Image(original)
			.webp({ quality: 90 })
			.bytes();
		expect(await thumbnails.makePreview(original)).toEqual(expected);
		expect(original).toEqual(unchanged);
	});

	test.each([
		[2400, 1200, 1600, 800],
		[1200, 2400, 800, 1600],
		[1600, 1600, 1600, 1600],
		[1200, 800, 1200, 800],
		[1, 1, 1, 1],
	])(
		"просмотр %i×%i → %i×%i без растяжения",
		async (width, height, wantWidth, wantHeight) => {
			expect(thumbnails.makePreview).toBeFunction();
			const original = await pngFixture(width, height);
			const preview = await thumbnails.makePreview(original);
			expect(await new Bun.Image(preview).metadata()).toMatchObject({
				width: wantWidth,
				height: wantHeight,
				format: "webp",
			});
		},
	);
});
