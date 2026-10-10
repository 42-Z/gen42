import { describe, expect, test } from "bun:test";
import {
	parseTurboReasoning,
	TURBO_DEFAULT_REASONING,
	TURBO_REASONING_LEVELS,
} from "../turbo/reasoning";

describe("parseTurboReasoning", () => {
	test("четыре уровня от medium до max, по возрастанию", () => {
		expect([...TURBO_REASONING_LEVELS]).toEqual([
			"medium",
			"high",
			"xhigh",
			"max",
		]);
	});

	test("каждый уровень принимается как есть", () => {
		for (const level of TURBO_REASONING_LEVELS) {
			expect(parseTurboReasoning(level)).toBe(level);
		}
	});

	test("поля нет: уровень, на котором Турбо работал до выбора", () => {
		expect(parseTurboReasoning(undefined)).toBe("high");
		expect(TURBO_DEFAULT_REASONING).toBe("high");
	});

	test("неизвестное значение отклоняется, а не заменяется другим уровнем", () => {
		for (const bad of ["low", "ultra", "MAX", "", null, 3, ["max"], {}]) {
			expect(parseTurboReasoning(bad)).toBeNull();
		}
	});
});
