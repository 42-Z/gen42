// src/lib/sheet/tail.ts
import type { CaretPoint } from "./caret";

/**
 * Хвост листа за кареткой: узкая полоса спектра под строкой, растянутая назад
 * по скорости печати (длина 10–48 px) с мягкой маской без плашки. Ввод тянет
 * хвост за кареткой, удаление — вперёд (хвост идёт вспять). Анимируются только
 * `transform` и `opacity`; стили `.caret-tail` лежат в CSS страницы.
 */
const FULL = 48;
const MIN = 10;
const SLOW_MS = 400;

export function isEraseInput(inputType: string | undefined): boolean {
	return !!inputType && inputType.startsWith("delete");
}

/** Чем короче пауза между нажатиями, тем длиннее хвост */
export function tailLength(sinceMs: number): number {
	const v = FULL * (1 - Math.max(0, sinceMs) / SLOW_MS);
	return Math.round(Math.min(FULL, Math.max(MIN, v)));
}

let el: HTMLDivElement | null = null;
let lastAt = 0;

function ensure(): HTMLDivElement {
	if (!el) {
		el = document.createElement("div");
		el.className = "caret-tail";
		el.setAttribute("aria-hidden", "true");
		document.body.appendChild(el);
	}
	return el;
}

export function showTail(
	p: CaretPoint,
	dir: 1 | -1,
	now: number = performance.now(),
): void {
	const tail = ensure();
	const len = tailLength(now - lastAt);
	lastAt = now;
	const x = Math.round(dir === 1 ? p.x - FULL : p.x);
	const y = Math.round(p.y + p.h / 2 - 2);
	tail.dataset.dir = dir === 1 ? "fwd" : "back";
	tail.style.transformOrigin = dir === 1 ? "100% 50%" : "0 50%";
	// текстура листа выравнивается по координатам страницы: хвост «вырезан» из того же листа
	tail.style.backgroundPosition = `${-(x + window.scrollX)}px ${-(y + window.scrollY)}px`;
	for (const a of tail.getAnimations()) a.cancel();
	const base = `translate(${x}px, ${y}px)`;
	tail.style.transform = base;
	tail.style.visibility = "visible";
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	// после затухания хвост скрыт совсем: невидимый fixed-элемент держал бы слой композитора
	const anim = tail.animate(
		[
			{ opacity: 1, transform: `${base} scaleX(${len / FULL})` },
			{ opacity: 0, transform: `${base} scaleX(0.2)` },
		],
		{ duration: 600, easing: "ease-out" },
	);
	anim.onfinish = () => {
		tail.style.visibility = "hidden";
	};
}
