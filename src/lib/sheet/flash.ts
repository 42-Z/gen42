import { SPRINGS, springLinear } from "./springs";

/**
 * Вспышка на пике «выдоха»: по нижней кромке шапки проходит полоса спектра, а
 * логотип упруго подпрыгивает. Без текста и без постоянной анимации: два
 * элемента шапки (`data-flash="band"` и `data-flash="logo"`) оживают один раз.
 * Только `transform` и `opacity`.
 */
export function flash(): void {
	const band = document.querySelector<HTMLElement>('[data-flash="band"]');
	const logo = document.querySelector<HTMLElement>('[data-flash="logo"]');
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
		band?.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
			duration: 150,
		});
		return;
	}
	band?.animate(
		[
			{ transform: "translate(-100%,0)", opacity: 1 },
			{ transform: "translate(0,0)", opacity: 1, offset: 0.55 },
			{ transform: "translate(100%,0)", opacity: 0 },
		],
		{ duration: SPRINGS.heavy.move + 500, easing: springLinear("heavy") },
	);
	logo?.animate(
		[
			{ transform: "scale(1)" },
			{ transform: "scale(1.14)", offset: 0.3 },
			{ transform: "scale(1)" },
		],
		{ duration: SPRINGS.heavy.release, easing: springLinear("heavy") },
	);
}
