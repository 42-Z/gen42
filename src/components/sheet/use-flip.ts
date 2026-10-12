// src/components/sheet/use-flip.ts
import { type RefObject, useLayoutEffect, useRef } from "react";
import { type Mass, SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";

interface Box {
	left: number;
	width: number;
}

/**
 * Элемент переехал или изменил длину (DOM уже новый): анимация «из старого
 * положения в новое» только через transform (FLIP) пружиной своей массы. Для
 * `origin: "left"` (заливка) масштабируется длина, для `"center"` (ручка) —
 * сдвиг с растяжением. Раскладка читается один раз в layout-эффекте, не в
 * обработчике события.
 */
export function useFlip(
	ref: RefObject<HTMLElement | null>,
	dep: unknown,
	options: { mass: Mass; origin: "left" | "center" },
): void {
	const prev = useRef<Box | null>(null);
	const { mass, origin } = options;
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		// идущая анимация искажает рамку: сначала снимаем её, меряем положение в раскладке
		for (const running of el.getAnimations()) running.cancel();
		const r = el.getBoundingClientRect();
		const now: Box = { left: r.left, width: r.width };
		const was = prev.current;
		prev.current = now;
		remeasure(el);
		if (!was || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const dx =
			origin === "left"
				? was.left - now.left
				: was.left + was.width / 2 - (now.left + now.width / 2);
		const sx = now.width > 1 ? was.width / now.width : 1;
		if (Math.abs(dx) < 0.5 && Math.abs(sx - 1) < 0.01) return;
		el.style.transformOrigin = origin === "left" ? "0 50%" : "50% 50%";
		const stretch =
			origin === "center" ? 1 + Math.min(0.15, Math.abs(dx) / 120) : 1;
		const anim = el.animate(
			[
				{ transform: `translate(${dx}px,0) scaleX(${sx * stretch})` },
				{ transform: "translate(0,0) scaleX(1)" },
			],
			{ duration: SPRINGS[mass].move, easing: springLinear(mass) },
		);
		anim.onfinish = () => remeasure(el);
	}, [dep, mass, origin, ref]);
}

const KEY = "data-key";

/**
 * Список элементов (`data-key`) переставляется: старые плавно переезжают на новое
 * место, новые приходят из `from` (например, из рамки готовой картинки) или
 * проявляются из масштаба 0,9; каждый следующий стартует на 30 мс позже. Положения
 * хранятся в координатах страницы, чтобы прокрутка между обновлениями не мешала.
 * Только `transform` и `opacity`.
 */
export function useFlipList(
	ref: RefObject<HTMLElement | null>,
	signature: string,
	from?: () => HTMLElement | null,
): void {
	const prev = useRef<Map<string, { x: number; y: number }>>(new Map());
	useLayoutEffect(() => {
		const host = ref.current;
		if (!host) return;
		const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
		const items = [...host.querySelectorAll<HTMLElement>(`[${KEY}]`)];
		for (const el of items) for (const a of el.getAnimations()) a.cancel();
		const source = from?.()?.getBoundingClientRect() ?? null;
		const next = new Map<string, { x: number; y: number }>();
		const animate = prev.current.size > 0 && !reduce;
		items.forEach((el, i) => {
			const r = el.getBoundingClientRect();
			const at = { x: r.left + window.scrollX, y: r.top + window.scrollY };
			next.set(el.getAttribute(KEY) ?? "", at);
			remeasure(el);
			if (!animate) return;
			const was = prev.current.get(el.getAttribute(KEY) ?? "");
			const opts = {
				duration: SPRINGS.medium.move + 320,
				delay: i * 30,
				easing: springLinear("medium"),
				fill: "backwards" as const,
			};
			if (was) {
				const dx = was.x - at.x;
				const dy = was.y - at.y;
				if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
					el.animate(
						[
							{ transform: `translate(${dx}px,${dy}px)` },
							{ transform: "translate(0,0)" },
						],
						opts,
					);
				}
			} else if (source && r.width > 0) {
				const dx = source.left + source.width / 2 - (r.left + r.width / 2);
				const dy = source.top + source.height / 2 - (r.top + r.height / 2);
				const k = source.width / r.width;
				el.animate(
					[
						{ transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0 },
						{ opacity: 1, offset: 0.3 },
						{ transform: "translate(0,0) scale(1)", opacity: 1 },
					],
					{
						...opts,
						duration: SPRINGS.heavy.move + 500,
						easing: springLinear("heavy"),
					},
				);
			} else {
				el.animate(
					[
						{ transform: "scale(0.9)", opacity: 0 },
						{ transform: "scale(1)", opacity: 1 },
					],
					opts,
				);
			}
		});
		prev.current = next;
	}, [signature]);
}
