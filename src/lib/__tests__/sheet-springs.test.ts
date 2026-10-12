// src/lib/__tests__/sheet-springs.test.ts
import { describe, expect, test } from "bun:test";
import {
	ATTACK_MS,
	SPRINGS,
	springLinear,
	springOvershoot,
	stepResponse,
} from "../sheet/springs";

describe("пружины", () => {
	test("нарастание ≤ 120 мс, спад 600–1200 мс, движение растёт с массой", () => {
		expect(ATTACK_MS).toBeLessThanOrEqual(120);
		for (const mass of ["light", "medium", "heavy"] as const) {
			expect(SPRINGS[mass].release).toBeGreaterThanOrEqual(600);
			expect(SPRINGS[mass].release).toBeLessThanOrEqual(1200);
		}
		expect(SPRINGS.light.move).toBeLessThan(SPRINGS.medium.move);
		expect(SPRINGS.medium.move).toBeLessThan(SPRINGS.heavy.move);
	});

	test("перелёт ≤ 4%: лёгкая без перелёта, средняя около 3%", () => {
		expect(springOvershoot("light")).toBe(0);
		expect(springOvershoot("medium")).toBeGreaterThan(0.02);
		expect(springOvershoot("medium")).toBeLessThanOrEqual(0.04);
		expect(springOvershoot("heavy")).toBeLessThanOrEqual(0.04);
	});

	test("отклик ступени: 0 в начале, 1 в конце, монотонен у лёгкой", () => {
		for (const zeta of [1, 0.9, 0.75]) {
			expect(stepResponse(zeta, 0)).toBe(0);
			expect(stepResponse(zeta, 1)).toBe(1);
		}
		let prev = 0;
		for (let i = 1; i <= 50; i++) {
			const v = stepResponse(1, i / 50);
			expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
			prev = v;
		}
	});

	test("springLinear: строка linear() из 24 значений от 0 до 1", () => {
		for (const mass of ["light", "medium", "heavy"] as const) {
			const s = springLinear(mass);
			expect(s.startsWith("linear(0, ")).toBe(true);
			expect(s.endsWith(", 1)")).toBe(true);
			const values = s.slice(7, -1).split(",").map(Number);
			expect(values).toHaveLength(24);
			expect(values.every(Number.isFinite)).toBe(true);
		}
		expect(springLinear("medium", 8).slice(7, -1).split(",")).toHaveLength(8);
	});

	test("средняя пружина действительно перелетает единицу в строке linear()", () => {
		const values = springLinear("medium", 48)
			.slice(7, -1)
			.split(",")
			.map(Number);
		expect(Math.max(...values)).toBeGreaterThan(1);
		expect(Math.max(...values)).toBeLessThanOrEqual(1.04);
	});
});
