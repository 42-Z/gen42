import { describe, expect, test } from "bun:test";
import { parseUltraPhase, ULTRA_PHASES } from "../ultra/phase";

describe("стадии «Ультры»", () => {
	test("каждая известная стадия читается", () => {
		for (const phase of ULTRA_PHASES) {
			expect(parseUltraPhase(phase)).toBe(phase);
		}
	});

	test("старое и мусорное значение не приписывается", () => {
		expect(parseUltraPhase(null)).toBeNull();
		expect(parseUltraPhase(undefined)).toBeNull();
		expect(parseUltraPhase("generating")).toBeNull();
		expect(parseUltraPhase("")).toBeNull();
		expect(parseUltraPhase(42)).toBeNull();
	});
});
