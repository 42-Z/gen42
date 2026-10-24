import { describe, expect, test } from "bun:test";
import { isClientId } from "../generation-id";

describe("isClientId", () => {
	test("принимает id клиента", () => {
		expect(isClientId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
		expect(isClientId("abc_DEF-123")).toBe(true);
	});

	test("отклоняет чужие значения", () => {
		for (const value of [
			undefined,
			null,
			42,
			"",
			"short",
			"../etc",
			"a".repeat(65),
			"id with space",
		]) {
			expect(isClientId(value)).toBe(false);
		}
	});
});
