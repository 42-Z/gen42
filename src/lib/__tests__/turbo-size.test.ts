import { describe, expect, test } from "bun:test";
import { parseImageSize } from "../turbo/size";

describe("parseImageSize", () => {
	test("разбирает размер сервера, остальное — квадрат", () => {
		expect(parseImageSize("1024x1536")).toEqual({ width: 1024, height: 1536 });
		expect(parseImageSize(null)).toEqual({ width: 1024, height: 1024 });
		expect(parseImageSize("auto")).toEqual({ width: 1024, height: 1024 });
	});
});
