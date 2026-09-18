import { describe, expect, test } from "bun:test";
import { imageExtension, normalizeContentType } from "../image-format";

describe("image-format", () => {
	test("imageExtension определяет расширение по MIME", () => {
		expect(imageExtension("image/webp")).toBe("webp");
		expect(imageExtension("image/png")).toBe("png");
		expect(imageExtension("image/jpeg")).toBe("jpg");
		expect(imageExtension("image/jpg")).toBe("jpg");
		expect(imageExtension("image/gif")).toBe("gif");
	});

	test("imageExtension безопасно падает в png", () => {
		expect(imageExtension(null)).toBe("png");
		expect(imageExtension(undefined)).toBe("png");
		expect(imageExtension("application/octet-stream")).toBe("png");
	});

	test("normalizeContentType убирает параметры и проверяет префикс", () => {
		expect(normalizeContentType("image/webp; charset=utf-8")).toBe(
			"image/webp",
		);
		expect(normalizeContentType("IMAGE/PNG")).toBe("image/png");
		expect(normalizeContentType("text/html")).toBe("image/png");
		expect(normalizeContentType(null)).toBe("image/png");
	});
});
