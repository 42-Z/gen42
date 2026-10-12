// src/lib/sheet/wave.ts
/**
 * Планировщик волны. Импульс доходит до окон с задержкой по расстоянию и
 * слабеет с ним; источник отвечает первым. Чистая функция: измерения окон и
 * сами анимации делает DOM-слой.
 */
export const WAVE_MAX_MS = 280;
/** 1 мс на 2,5 px */
const MS_PER_PX = 0.4;
/** Затухание ÷ (1 + d / 400 px) */
const FALLOFF_PX = 400;
/** Сдвиг листа у источника при весе 1, доля ширины окна */
export const BASE_SHIFT = 0.18;
export const MAX_SHIFT = 0.28;
/** Не больше стольких ближайших окон за один импульс */
export const WAVE_LIMIT = 24;
/** Окна дальше этого поля от экрана не анимируются, px */
const OFFSCREEN_MARGIN = 200;

export const waveDelay = (d: number): number =>
	Math.min(WAVE_MAX_MS, d * MS_PER_PX);
export const waveGain = (d: number): number => 1 / (1 + d / FALLOFF_PX);

/** Вес импульса по цене действия: 0,3 + 0,7 · min(цена, 10) / 10 */
export function weightForCost(cost: number): number {
	return 0.3 + (0.7 * Math.min(Math.max(cost, 0), 10)) / 10;
}

export interface Target {
	id: number;
	/** Центр окна в координатах экрана, px */
	x: number;
	y: number;
	w: number;
	h: number;
	isSource: boolean;
}

export interface WavePlan {
	id: number;
	/** Задержка начала, мс */
	delay: number;
	/** Сдвиг листа, доля ширины окна со знаком */
	amp: number;
	gain: number;
}

export function planWave(
	src: { x: number; y: number },
	targets: Target[],
	o: {
		weight: number;
		sign: 1 | -1;
		viewport: { w: number; h: number };
		limit?: number;
	},
): WavePlan[] {
	const visible = targets.filter(
		(t) =>
			t.x + t.w / 2 > -OFFSCREEN_MARGIN &&
			t.x - t.w / 2 < o.viewport.w + OFFSCREEN_MARGIN &&
			t.y + t.h / 2 > -OFFSCREEN_MARGIN &&
			t.y - t.h / 2 < o.viewport.h + OFFSCREEN_MARGIN,
	);
	const measured = visible
		.map((t) => ({
			t,
			d: t.isSource ? 0 : Math.hypot(t.x - src.x, t.y - src.y),
		}))
		.sort((a, b) => a.d - b.d);
	return measured.slice(0, o.limit ?? WAVE_LIMIT).map(({ t, d }) => {
		const gain = waveGain(d);
		const raw = o.sign * o.weight * BASE_SHIFT * gain;
		return {
			id: t.id,
			delay: waveDelay(d),
			amp: Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, raw)),
			gain,
		};
	});
}
