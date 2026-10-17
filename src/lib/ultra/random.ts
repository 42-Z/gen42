/**
 * Инструмент random: случайный элемент списка. Модель, выбирая сама, раз за разом
 * берёт самый вероятный вариант (корона, бархат, ночь с малиновым в каждом кадре),
 * поэтому решения кадра агент разыгрывает: выписывает варианты и получает один.
 *
 * В воркфлоу инструмент выполняется без "use step": `Math.random()` там зависит от
 * зерна прогона, поэтому у каждого прогона свой выбор, а при воспроизведении
 * прогона тот же самый (docs/foundations/workflows-and-steps.mdx пакета workflow).
 */
export type RandomOutput =
	| { ok: true; value: string }
	| { ok: false; retryable: true; error: string };

export function pickRandom(
	options: readonly string[],
	random: () => number = Math.random,
): RandomOutput {
	if (options.length < 2) {
		return {
			ok: false,
			retryable: true,
			error: "Нужно хотя бы два варианта",
		};
	}
	const index = Math.min(
		options.length - 1,
		Math.floor(random() * options.length),
	);
	return { ok: true, value: options[index] as string };
}
