import { describe, expect, test } from "bun:test";
import { makePreview } from "../turbo/preview";
import { TINY_PNG } from "./helpers/turbo-fakes";

describe("makePreview", () => {
	test("отдаёт WebP", async () => {
		const preview = await makePreview(TINY_PNG);
		expect(preview.mediaType).toBe("image/webp");
		const header = String.fromCharCode(
			...preview.bytes.slice(0, 4),
			...preview.bytes.slice(8, 12),
		);
		expect(header).toBe("RIFFWEBP");
	});
});
