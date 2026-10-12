// src/lib/__tests__/sheet-wave.test.ts
import { describe, expect, test } from "bun:test";
import {
	BASE_SHIFT,
	MAX_SHIFT,
	planWave,
	type Target,
	WAVE_MAX_MS,
	waveDelay,
	waveGain,
	weightForCost,
} from "../sheet/wave";

const t = (id: number, x: number, y: number, isSource = false): Target => ({
	id,
	x,
	y,
	w: 100,
	h: 40,
	isSource,
});
const VIEW = { w: 1280, h: 800 };

describe("волна", () => {
	test("задержка 1 мс на 2,5 px с потолком 280 мс", () => {
		expect(waveDelay(0)).toBe(0);
		expect(waveDelay(250)).toBeCloseTo(100, 5);
		expect(waveDelay(10_000)).toBe(WAVE_MAX_MS);
	});

	test("затухание ÷ (1 + d/400)", () => {
		expect(waveGain(0)).toBe(1);
		expect(waveGain(400)).toBeCloseTo(0.5, 5);
		expect(waveGain(1200)).toBeCloseTo(0.25, 5);
	});

	test("вес по цене: Krea 1 < Ideogram 3 < Турбо 10 = 1", () => {
		expect(weightForCost(1)).toBeCloseTo(0.37, 5);
		expect(weightForCost(3)).toBeCloseTo(0.51, 5);
		expect(weightForCost(10)).toBe(1);
		expect(weightForCost(99)).toBe(1);
		expect(weightForCost(-5)).toBeCloseTo(0.3, 5);
	});
});

describe("planWave", () => {
	test("источник отвечает первым и сильнее всех, дальние позже и слабее", () => {
		const plan = planWave(
			{ x: 100, y: 100 },
			[t(1, 600, 100), t(2, 100, 100, true), t(3, 1000, 600)],
			{ weight: 1, sign: 1, viewport: VIEW },
		);
		expect(plan.map((p) => p.id)).toEqual([2, 1, 3]);
		expect(plan[0]!.delay).toBe(0);
		expect(plan[0]!.amp).toBeCloseTo(BASE_SHIFT, 5);
		expect(plan[1]!.delay).toBeGreaterThan(plan[0]!.delay);
		expect(plan[2]!.delay).toBeGreaterThanOrEqual(plan[1]!.delay);
		expect(Math.abs(plan[1]!.amp)).toBeLessThan(Math.abs(plan[0]!.amp));
		expect(Math.abs(plan[2]!.amp)).toBeLessThan(Math.abs(plan[1]!.amp));
		for (const p of plan) expect(p.delay).toBeLessThanOrEqual(WAVE_MAX_MS);
	});

	test("знак назад меняет направление, вес масштабирует амплитуду", () => {
		const back = planWave({ x: 0, y: 0 }, [t(1, 0, 0, true)], {
			weight: 0.5,
			sign: -1,
			viewport: VIEW,
		});
		expect(back[0]!.amp).toBeCloseTo(-0.5 * BASE_SHIFT, 5);
	});

	test("амплитуда не выше потолка", () => {
		const plan = planWave({ x: 0, y: 0 }, [t(1, 0, 0, true)], {
			weight: 100,
			sign: 1,
			viewport: VIEW,
		});
		expect(plan[0]!.amp).toBe(MAX_SHIFT);
	});

	test("окна за пределами экрана не участвуют", () => {
		const plan = planWave(
			{ x: 0, y: 0 },
			[t(1, 50, 50, true), t(2, 5000, 50), t(3, 50, -5000)],
			{ weight: 1, sign: 1, viewport: VIEW },
		);
		expect(plan.map((p) => p.id)).toEqual([1]);
	});

	test("лимит ближайших окон", () => {
		const targets = Array.from({ length: 40 }, (_, i) =>
			t(i, 100 + i * 10, 100),
		);
		const plan = planWave({ x: 100, y: 100 }, targets, {
			weight: 1,
			sign: 1,
			viewport: VIEW,
			limit: 5,
		});
		expect(plan).toHaveLength(5);
		expect(plan.map((p) => p.id)).toEqual([0, 1, 2, 3, 4]);
		expect(
			planWave({ x: 100, y: 100 }, targets, {
				weight: 1,
				sign: 1,
				viewport: VIEW,
			}),
		).toHaveLength(24);
	});
});
