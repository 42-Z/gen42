// src/lib/__tests__/sheet-palette.test.ts
import { describe, expect, test } from "bun:test";
import {
	BASE,
	color,
	contrast,
	DARK_MIX,
	dark,
	ERROR,
	mix,
	phase,
	relLuminance,
	rgbString,
	ridge,
	round,
	STOPS,
	spectrum,
	TEXT,
	TEXT_2,
} from "../sheet/palette";

const DENSE = Array.from({ length: 101 }, (_, i) => i / 100);
const SPARSE = Array.from({ length: 17 }, (_, i) => i / 16);
const lum = (rgb: readonly [number, number, number]) =>
	relLuminance(round(rgb));

describe("опорные цвета", () => {
	test("яркости опор: хребет около 0,18, фуксия 0,317", () => {
		const expected = {
			S0: 0.1806,
			S1: 0.1805,
			S2: 0.1812,
			S3: 0.1801,
			S4: 0.1813,
			S5: 0.3174,
		};
		for (const [key, value] of Object.entries(expected)) {
			expect(relLuminance(STOPS[key as keyof typeof STOPS])).toBeCloseTo(
				value,
				3,
			);
		}
	});

	test("белый на фуксии не проходит 4,5:1 (поэтому она только без текста)", () => {
		expect(contrast(1, relLuminance(STOPS.S5))).toBeLessThan(3);
	});
});

describe("роли яркости", () => {
	test("хребет: 0,178 ≤ L ≤ 0,1833 и белый текст ≥ 4,5:1 в каждой точке", () => {
		for (const p of DENSE) {
			const l = lum(ridge(p));
			expect(l).toBeGreaterThanOrEqual(0.178);
			expect(l).toBeLessThanOrEqual(0.1833);
			expect(contrast(1, l)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("фон: L ≤ 0,018 в каждой точке", () => {
		for (const p of DENSE) expect(lum(dark(p))).toBeLessThanOrEqual(0.018);
	});

	test("хребет к фону ≥ 3,3:1 в любой паре точек", () => {
		for (const p of SPARSE) {
			for (const q of SPARSE) {
				expect(contrast(lum(ridge(p)), lum(dark(q)))).toBeGreaterThanOrEqual(
					3.3,
				);
			}
		}
	});

	test("самый тёмный цвет кнопки отличается от самого светлого места фона не менее чем в 3 раза", () => {
		let maxDark = 0;
		for (const p of DENSE) maxDark = Math.max(maxDark, lum(dark(p)));
		expect(contrast(relLuminance(STOPS.S0), maxDark)).toBeGreaterThanOrEqual(3);
	});

	test("спектр: 0,178 ≤ L ≤ 0,32", () => {
		for (const p of DENSE) {
			const l = lum(spectrum(p));
			expect(l).toBeGreaterThanOrEqual(0.178);
			expect(l).toBeLessThanOrEqual(0.32);
		}
	});

	test("фон — смесь хребта с базой в линейном RGB", () => {
		expect(DARK_MIX).toBe(0.075);
		expect(dark(0)).toEqual(mix(BASE, ridge(0), DARK_MIX));
		expect(color("ridge", 0.3)).toEqual(ridge(0.3));
		expect(color("spectrum", 1)).toEqual(spectrum(1));
		expect(color("dark", 0.5)).toEqual(dark(0.5));
	});
});

describe("текст", () => {
	const bgL = 0.018;
	test("основной ≥ 12:1, вторичный и ошибка ≥ 4,5:1 к самому светлому фону", () => {
		expect(contrast(relLuminance(TEXT), bgL)).toBeGreaterThanOrEqual(12);
		expect(contrast(relLuminance(TEXT_2), bgL)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(relLuminance(ERROR), bgL)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("фаза листа", () => {
	test("палиндром с периодом 0,5", () => {
		expect(phase(0)).toBe(0);
		expect(phase(0.25)).toBe(1);
		expect(phase(0.5)).toBe(0);
		expect(phase(0.75)).toBe(1);
		expect(phase(1)).toBe(0);
		for (const t of [0.05, 0.13, 0.31, 0.44]) {
			expect(phase(t + 0.5)).toBeCloseTo(phase(t), 10);
		}
	});
});

describe("rgbString", () => {
	test("округляет в целые", () => {
		expect(rgbString([108.4, 91.6, 255])).toBe("rgb(108 92 255)");
	});
});
