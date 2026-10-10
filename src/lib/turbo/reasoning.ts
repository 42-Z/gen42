/**
 * Уровни рассуждения агента Турбо, которые выбирает пользователь. Замеры на
 * запросе про концерт (2026-10-10): `high` агент 111 с и 136 тыс. токенов, `xhigh`
 * 266 с и 201 тыс., `max` 335 с и 210 тыс.; `medium` не мерился.
 * Модуль без зависимостей: его читают и страница, и сервер.
 */
export const TURBO_REASONING_LEVELS = [
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

export type TurboReasoning = (typeof TURBO_REASONING_LEVELS)[number];

/** Уровень, с которым Турбо работал до выбора: запросы без поля `reasoning` идут на нём */
export const TURBO_DEFAULT_REASONING: TurboReasoning = "high";

/**
 * Разбор поля `reasoning` из запроса: нет поля — уровень по умолчанию, неизвестное
 * значение — `null` (запрос отклоняется, а не молча меняется на другой уровень).
 */
export function parseTurboReasoning(value: unknown): TurboReasoning | null {
	if (value === undefined) return TURBO_DEFAULT_REASONING;
	return (TURBO_REASONING_LEVELS as readonly unknown[]).includes(value)
		? (value as TurboReasoning)
		: null;
}
