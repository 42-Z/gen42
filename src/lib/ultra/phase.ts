// src/lib/ultra/phase.ts
/**
 * Стадии прогона «Ультры»: их видит страница, пока идёт генерация. Имена
 * короткие (колонка `phase` в базе — VARCHAR(12)), значения только эти:
 * `prepare` — собираем инструкцию и дерево библиотеки, `thinking` — агент
 * думает (вызов модели), `library` — читает файлы библиотеки, `review` —
 * проверяет аргументы кадра, `draw` — рисует. Модуль без зависимостей: его
 * читают и серверные шаги, и страница.
 */
export const ULTRA_PHASES = [
	"prepare",
	"thinking",
	"library",
	"review",
	"draw",
] as const;

export type UltraPhase = (typeof ULTRA_PHASES)[number];

/**
 * Подписи стадий для скринридера: на экране текста нет, поэтому строки живут
 * здесь, а не в компоненте — тест видимого текста не должен их видеть.
 */
export const ULTRA_PHASE_LABELS: Record<UltraPhase, string> = {
	prepare: "Готовим запуск",
	thinking: "Агент думает",
	library: "Агент читает библиотеку",
	review: "Агент проверяет кадр",
	draw: "Агент рисует кадр",
};

/** Подпись ожидания, пока стадия ещё не пришла */
export const GENERATION_STATUS_LABEL = "Идёт генерация";

export function parseUltraPhase(value: unknown): UltraPhase | null {
	return typeof value === "string" &&
		(ULTRA_PHASES as readonly string[]).includes(value)
		? (value as UltraPhase)
		: null;
}
