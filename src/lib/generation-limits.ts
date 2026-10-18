/**
 * Сколько генераций одного пользователя могут идти одновременно. Четыре рамки
 * ложатся в сетку 2×2 на странице; лимиты платформы такое число не требуют.
 * Модуль без зависимостей: его читают и сервер, и страница.
 */
export const MAX_RUNNING_GENERATIONS = 4;

/** Один текст отказа и при частых запросах, и при потолке идущих: новых строк для пользователя нет */
export const TOO_MANY_REQUESTS_ERROR =
	"Слишком много запросов, подождите минуту";

/** Потолок идущих генераций достигнут; `startGeneration` бросает её до вставки строки */
export class TooManyRunningError extends Error {
	constructor() {
		super("Too many running generations");
		this.name = "TooManyRunningError";
	}
}
