import { useEffect, useRef } from "react";
import { SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";
import { SheetLayer } from "./SheetLayer";

interface HoverWindowProps {
	/** Селектор пунктов внутри родителя (родитель должен быть позиционирован) */
	item: string;
	/** `pointer` — следует за курсором (таблицы); `highlight` — за `data-highlighted` Radix (меню, списки) */
	mode: "pointer" | "highlight";
}

const OPACITY = 0.16;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Одно скользящее окно наведения: вместо подсветки каждого пункта по отдельности
 * один кусок листа переезжает к пункту под курсором (или к выбранному с клавиатуры)
 * и растягивается по пути. Только `transform` и `opacity`; положение читается
 * при смене пункта, а не на каждое движение мыши.
 */
export function HoverWindow({ item, mode }: HoverWindowProps) {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const el = ref.current;
		const host = el?.parentElement;
		if (!el || !host) return;
		let at: { y: number; h: number } | null = null;
		let current: Element | null = null;

		function hide() {
			current = null;
			at = null;
			if (!el) return;
			el.animate([{ opacity: OPACITY }, { opacity: 0 }], {
				duration: 150,
				fill: "forwards",
			});
		}

		function moveTo(target: HTMLElement) {
			if (!el || target === current) return;
			current = target;
			const y = target.offsetTop;
			const h = target.offsetHeight;
			const x = target.offsetLeft;
			const w = target.offsetWidth;
			const was = at;
			at = { y, h };
			el.style.left = `${x}px`;
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
			el.style.transform = `translate(0,${y}px)`;
			el.style.opacity = String(OPACITY);
			for (const a of el.getAnimations()) a.cancel();
			remeasure(el);
			if (reduced()) return;
			if (!was) {
				el.animate([{ opacity: 0 }, { opacity: OPACITY }], { duration: 150 });
				return;
			}
			// резинка: окно растягивается на оба пункта и сжимается к новому
			const span = (Math.abs(y - was.y) + Math.max(h, was.h)) / h;
			el.animate(
				[
					{ transform: `translate(0,${was.y}px) scaleY(${was.h / h})` },
					{
						transform: `translate(0,${Math.min(y, was.y)}px) scaleY(${span})`,
						offset: 0.45,
					},
					{ transform: `translate(0,${y}px) scaleY(1)` },
				],
				{
					duration: SPRINGS.light.move + 120,
					easing: springLinear("light"),
				},
			).onfinish = () => remeasure(el);
		}

		const onMove = (e: Event) => {
			const row = (e.target as Element | null)?.closest<HTMLElement>(item);
			if (row && host.contains(row)) moveTo(row);
		};
		let mo: MutationObserver | undefined;
		if (mode === "pointer") {
			host.addEventListener("pointermove", onMove, { passive: true });
			host.addEventListener("pointerleave", hide);
		} else {
			mo = new MutationObserver(() => {
				const lit = host.querySelector<HTMLElement>(
					`${item}[data-highlighted]`,
				);
				if (lit) moveTo(lit);
				else if (current) hide();
			});
			mo.observe(host, {
				subtree: true,
				attributes: true,
				attributeFilter: ["data-highlighted"],
			});
		}
		return () => {
			host.removeEventListener("pointermove", onMove);
			host.removeEventListener("pointerleave", hide);
			mo?.disconnect();
		};
	}, [item, mode]);

	return (
		<i
			ref={ref}
			data-sheet="ridge"
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 -z-10 rounded-xl opacity-0"
			style={{ transformOrigin: "0 0" }}
		>
			<SheetLayer />
		</i>
	);
}
