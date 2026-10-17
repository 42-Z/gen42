/**
 * Уровни рассуждения агента «Ультра», которые выбирает пользователь. Замеры на
 * запросе про концерт (2026-10-10): `high` агент 111 с и 136 тыс. токенов, `xhigh`
 * 266 с и 201 тыс., `max` 335 с и 210 тыс.; `medium` не мерился.
 * Модуль без зависимостей: его читают и страница, и сервер.
 */
export const ULTRA_REASONING_LEVELS = [
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

export type UltraReasoning = (typeof ULTRA_REASONING_LEVELS)[number];

/** Уровень, с которым «Ультра» работал до выбора: запросы без поля `reasoning` идут на нём */
export const ULTRA_DEFAULT_REASONING: UltraReasoning = "high";

/**
 * Разбор поля `reasoning` из запроса: нет поля — уровень по умолчанию, неизвестное
 * значение — `null` (запрос отклоняется, а не молча меняется на другой уровень).
 */
export function parseUltraReasoning(value: unknown): UltraReasoning | null {
	if (value === undefined) return ULTRA_DEFAULT_REASONING;
	return (ULTRA_REASONING_LEVELS as readonly unknown[]).includes(value)
		? (value as UltraReasoning)
		: null;
}
