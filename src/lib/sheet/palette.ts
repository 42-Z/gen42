// src/lib/sheet/palette.ts
/**
 * Палитра листа. Цвет есть положение: `p` ∈ [0, 1] по пути индиго → фуксия.
 * Яркость назначает роль, а не положение: опоры хребта подобраны на одной
 * относительной яркости (≈ 0,18), интерполяция идёт в линейном RGB, где яркость
 * линейна, поэтому между опорами она не плывёт.
 */
export type RGB = readonly [number, number, number];

export const BASE: RGB = [13, 11, 30]; // #0d0b1e

export const STOPS = {
	S0: [108, 92, 255], // #6c5cff
	S1: [138, 87, 232], // #8a57e8
	S2: [162, 82, 205], // #a252cd
	S3: [181, 76, 173], // #b54cad
	S4: [199, 70, 130], // #c74682
	S5: [255, 92, 168], // #ff5ca8, только спектр (без текста)
} as const satisfies Record<string, RGB>;

export const TEXT: RGB = [242, 239, 255]; // #f2efff
export const TEXT_2: RGB = [167, 159, 203]; // #a79fcb
export const ERROR: RGB = [255, 107, 129]; // #ff6b81

const RIDGE_STOPS: readonly RGB[] = [
	STOPS.S0,
	STOPS.S1,
	STOPS.S2,
	STOPS.S3,
	STOPS.S4,
];
const SPECTRUM_STOPS: readonly RGB[] = [...RIDGE_STOPS, STOPS.S5];

export function toLinear(c: number): number {
	const v = c / 255;
	return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function fromLinear(v: number): number {
	const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
	return c * 255;
}

/** Относительная яркость по WCAG */
export function relLuminance(rgb: RGB): number {
	return (
		0.2126 * toLinear(rgb[0]) +
		0.7152 * toLinear(rgb[1]) +
		0.0722 * toLinear(rgb[2])
	);
}

/** Контраст двух яркостей по WCAG */
export function contrast(l1: number, l2: number): number {
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Смешивание в линейном RGB: t = 0 — `a`, t = 1 — `b` */
export function mix(a: RGB, b: RGB, t: number): RGB {
	const channel = (i: 0 | 1 | 2) =>
		fromLinear(toLinear(a[i]) * (1 - t) + toLinear(b[i]) * t);
	return [channel(0), channel(1), channel(2)];
}

function along(stops: readonly RGB[], p: number): RGB {
	const x = Math.min(1, Math.max(0, p)) * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(x));
	return mix(stops[i]!, stops[i + 1]!, x - i);
}

/** Хребет: всё, что несёт белый текст (L ≈ 0,18) */
export const ridge = (p: number): RGB => along(RIDGE_STOPS, p);

/** Спектр: хребет с продолжением до фуксии, только заливки без текста (L до 0,32) */
export const spectrum = (p: number): RGB => along(SPECTRUM_STOPS, p);

/** Доля хребта в фоне: L фона = 0,925 · L(базы) + 0,075 · L(хребта) ≈ 0,0174 */
export const DARK_MIX = 0.075;

/**
 * Фон держится одного семейства оттенков (индиго → фиолетовый): малина и фуксия в
 * него не заходят, иначе по диагонали экрана фон плывёт от синего к бордовому и
 * читается радужной плёнкой. Малина живёт только в окнах и акцентах.
 */
const DARK_STOPS: readonly RGB[] = [STOPS.S0, STOPS.S1];

/** Тёмная полоса: фон */
export const dark = (p: number): RGB =>
	mix(BASE, along(DARK_STOPS, p), DARK_MIX);

export type Role = "dark" | "ridge" | "spectrum";

export function color(role: Role, p: number): RGB {
	return role === "dark" ? dark(p) : role === "ridge" ? ridge(p) : spectrum(p);
}

export function round(rgb: RGB): RGB {
	return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
}

export function rgbString(rgb: RGB): string {
	const r = round(rgb);
	return `rgb(${r[0]} ${r[1]} ${r[2]})`;
}

/**
 * Фаза листа вдоль диагонали, t ∈ [0, 1] на плитку. Палиндром с периодом 0,5:
 * две полные волны на плитку, поэтому плитки стыкуются без шва по обеим осям.
 */
export function phase(t: number): number {
	const f = (((t * 2) % 1) + 1) % 1;
	return f < 0.5 ? f * 2 : 2 - f * 2;
}
