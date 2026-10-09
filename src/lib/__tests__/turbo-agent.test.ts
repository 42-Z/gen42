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
});
