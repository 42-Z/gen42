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
