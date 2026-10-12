// src/lib/sheet/doodles.ts
/**
 * Дудлы вместо логотипа: время от времени слово «gen42» уступает место
 * маленькому персонажу про 42, который показывает номер и уходит. Здесь только
 * чистая логика показа (виды, паузы, выбор без повтора подряд); рисунки лежат в
 * `src/components/sheet/doodles/`, движение — в `src/doodles.css`.
 */
export const DOODLES = ["pug", "hippo", "giraffe", "pig"] as const;
export type DoodleKind = (typeof DOODLES)[number];

/** Длина показа, мс: выход слова, появление, игра, уход, возвращение слова */
export const DOODLE_MS = 3800;

/** Пауза до первого показа после открытия страницы, мс [от, до) */
export const FIRST_DELAY_MS = [12_000, 20_000] as const;
/** Пауза между показами (после окончания предыдущего), мс [от, до) */
export const GAP_MS = [28_000, 48_000] as const;

/** Ключ localStorage: значение `off` выключает показ по таймеру (ручной запуск работает) */
export const DOODLES_STORAGE_KEY = "gen42-doodles";

/** Событие на корне знака: запуск показа вручную, `detail` — вид (необязательно) */
export const DOODLE_PLAY_EVENT = "doodle:play";

export function isDoodleKind(value: unknown): value is DoodleKind {
	return DOODLES.includes(value as DoodleKind);
}

/** Следующий вид: любой, кроме показанного только что */
export function pickDoodle(
	last: DoodleKind | null,
	rand: () => number = Math.random,
): DoodleKind {
	const pool = DOODLES.filter((kind) => kind !== last);
	return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
}

/** Пауза до следующего показа, мс */
export function nextDelay(
	first: boolean,
	rand: () => number = Math.random,
): number {
	const [from, to] = first ? FIRST_DELAY_MS : GAP_MS;
	return Math.round(from + rand() * (to - from));
}
