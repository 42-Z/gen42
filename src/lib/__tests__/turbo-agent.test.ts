import { describe, expect, test } from "bun:test";
import { buildAgentMessage, systemVersionOf } from "../turbo/agent";

describe("systemVersionOf", () => {
	test("хеш стабилен и 16 hex-символов", () => {
		expect(systemVersionOf("a")).toBe(systemVersionOf("a"));
		expect(systemVersionOf("a")).toMatch(/^[0-9a-f]{16}$/);
		expect(systemVersionOf("a")).not.toBe(systemVersionOf("b"));
	});
});

describe("buildAgentMessage", () => {
	test("запрос пользователя доходит до агента без случайных якорей", () => {
		const message = buildAgentMessage("пятёрка на троне");
		expect(message).toContain("пятёрка на троне");
		expect(message).not.toContain("ANCHORS");
	});

	test("число 42 не навязывается: «два-три раза» из общей строки в сообщении нет", () => {
		const message = buildAgentMessage("пятёрка на троне");
		expect(message).toContain("TEXT: none");
		expect(message).toContain("once or twice at most");
		expect(message).not.toContain("two or three times");
	});

	test("текстовый запрос получает строку про точный текст", () => {
		const message = buildAgentMessage("плакат с надписью «СЛАВА 42»");
		expect(message).toContain("TEXT: requested");
		expect(message).not.toContain("once or twice at most");
	});
});
