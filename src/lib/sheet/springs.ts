// src/lib/sheet/springs.ts
/**
 * Три массы пружин, один закон: отклик ступени демпфированного осциллятора,
 * нормированный на время установления. Перелёт зависит только от коэффициента
 * демпфирования ζ: лёгкая и тяжёлая почти не перелетают, средняя ≈ 3%.
 * Те же значения уходят в CSS `linear()` и в Web Animations.
 */
export type Mass = "light" | "medium" | "heavy";

export interface SpringSpec {
	/** Коэффициент демпфирования */
	zeta: number;
	/** Длительность движения к цели, мс */
	move: number;
	/** Длительность спада импульса, мс */
	release: number;
}

export const SPRINGS: Record<Mass, SpringSpec> = {
	light: { zeta: 1, move: 180, release: 600 },
	medium: { zeta: 0.75, move: 280, release: 800 },
	heavy: { zeta: 0.9, move: 500, release: 1100 },
};

/** Нарастание импульса, мс (не больше 120) */
export const ATTACK_MS = 120;

/** ζ·ω·T = 6: за время T отклик устанавливается до ≈ 98% */
const K = 6;

/** Отклик ступени: tau — доля времени установления (0..1), результат 0..1 с перелётом */
export function stepResponse(zeta: number, tau: number): number {
	if (tau <= 0) return 0;
	if (tau >= 1) return 1;
	const w = (K / zeta) * tau;
	if (zeta >= 1) return 1 - Math.exp(-w) * (1 + w);
	const s = Math.sqrt(1 - zeta * zeta);
	const wd = w * s;
	return 1 - Math.exp(-zeta * w) * (Math.cos(wd) + (zeta / s) * Math.sin(wd));
}

const fmt = (v: number): string => String(Number(v.toFixed(3)));

/** Строка CSS `linear(0, …, 1)`: кривая пружины, n точек по равным долям времени */
export function springLinear(mass: Mass, n = 24): string {
	const { zeta } = SPRINGS[mass];
	const values: string[] = [];
	for (let i = 0; i < n; i++) values.push(fmt(stepResponse(zeta, i / (n - 1))));
	return `linear(${values.join(", ")})`;
}

/** Перелёт: максимум отклика минус 1 (не меньше нуля) */
export function springOvershoot(mass: Mass): number {
	const { zeta } = SPRINGS[mass];
	let max = 0;
	for (let i = 0; i <= 2000; i++)
		max = Math.max(max, stepResponse(zeta, i / 2000));
	return Math.max(0, max - 1);
}
