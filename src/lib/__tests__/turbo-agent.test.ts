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

	test("знак сообщества не слова: ставится на вещах мира, а не «два-три раза» по плану", () => {
		const message = buildAgentMessage("пятёрка на троне");
		expect(message).toContain("TEXT: not specified");
		// слова бывают, когда сцена их требует, и придумывает их агент
		expect(message).toContain("invent them yourself");
		expect(message).toContain("in the language of the request");
		expect(message).toContain("are not words");
		expect(message).toContain("one per object");
		expect(message).not.toContain("two or three times");
		expect(message).not.toContain("once or twice at most");
	});

	test("текстовый запрос получает строку про точный текст", () => {
		const message = buildAgentMessage("плакат с надписью «СЛАВА 42»");
		expect(message).toContain("TEXT: requested");
		expect(message).not.toContain("one per object");
	});
});
