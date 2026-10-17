import { describe, expect, test } from "bun:test";
import {
	parseUltraReasoning,
	ULTRA_DEFAULT_REASONING,
	ULTRA_REASONING_LEVELS,
} from "../ultra/reasoning";

describe("parseUltraReasoning", () => {
	test("четыре уровня от medium до max, по возрастанию", () => {
		expect([...ULTRA_REASONING_LEVELS]).toEqual([
			"medium",
			"high",
			"xhigh",
			"max",
		]);
	});

	test("каждый уровень принимается как есть", () => {
		for (const level of ULTRA_REASONING_LEVELS) {
			expect(parseUltraReasoning(level)).toBe(level);
		}
	});

	test("поля нет: уровень, на котором «Ультра» работал до выбора", () => {
		expect(parseUltraReasoning(undefined)).toBe("high");
		expect(ULTRA_DEFAULT_REASONING).toBe("high");
	});

	test("неизвестное значение отклоняется, а не заменяется другим уровнем", () => {
		for (const bad of ["low", "ultra", "MAX", "", null, 3, ["max"], {}]) {
			expect(parseUltraReasoning(bad)).toBeNull();
		}
	});
});
