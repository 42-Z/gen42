// src/lib/sheet/impulses.ts
import { ATTACK_MS, type Mass, SPRINGS, springLinear } from "./springs";
import { BASE_SHIFT, planWave, type Target } from "./wave";
import { type SheetWindow, sheetWindows, startWindows } from "./windows";

/**
 * Импульс: источник отвечает первым, остальные окна позже и слабее (волна по
 * расстоянию). Окно сдвигает свой кусок листа (слой `.sheet-layer`, только
 * `transform`); источник ещё и упруго деформируется (`scale`, перелёт ≤ 4%).
 * Всё через Web Animations без постоянного цикла: после волны всё неподвижно.
 * Геометрия окон берётся из кеша `windows.ts`, раскладка в обработчике не читается.
 */
const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
/** Сколько импульсов одновременно может идти на одном окне */
const MAX_ACTIVE = 3;
/**
 * Размеры окна просмотра и прокрутка. `scrollX`/`innerWidth` в Chrome могут
 * принудительно пересчитать раскладку, поэтому читаем их по событиям
 * `scroll`/`resize`, а не в обработчике импульса.
 */
const view = { sx: 0, sy: 0, w: 0, h: 0 };
const readView = (): void => {
	view.sx = window.scrollX;
	view.sy = window.scrollY;
	view.w = window.innerWidth;
	view.h = window.innerHeight;
};
/** Слой фона берём один раз */
let backdrop: HTMLElement | null | undefined;

/** getAnimations() принудительно пересчитывает стили, поэтому активные импульсы считаем сами */
const busy = new WeakMap<Element, number>();

/** Запрос медиа создаётся один раз: `matchMedia` на каждое окно дорог */
let reducedQuery: MediaQueryList | undefined;
const reduced = (): boolean =>
	(reducedQuery ??= matchMedia("(prefers-reduced-motion: reduce)")).matches;

export interface ImpulseInput {
	source: Element;
	/** 1 — вперёд (успех, ввод, рост), -1 — назад (отмена, ошибка, трата) */
	sign?: 1 | -1;
	/** Вес по цене действия, 0..1 */
	weight?: number;
	mass?: Mass;
	/** Деформировать источник (по умолчанию да); нажатие кнопки делает это само */
	deform?: boolean;
}

export function impulse(input: ImpulseInput): void {
	const {
		source,
		sign = 1,
		weight = 0.5,
		mass = "medium",
		deform = true,
	} = input;
	const { sx, sy } = view;
	const wins = sheetWindows();
	const src = centerOf(source, wins, sx, sy);
	const targets: Target[] = wins.map((w, i) => ({
		id: i,
		x: w.x + w.w / 2 - (w.fixed ? 0 : sx),
		y: w.y + w.h / 2 - (w.fixed ? 0 : sy),
		w: w.w,
		h: w.h,
		isSource: w.el === source || w.el.contains(source),
	}));
	const plan = planWave(src, targets, {
		weight,
		sign,
		viewport: { w: view.w, h: view.h },
	});
	const now = reduced();
	for (const p of plan) {
		const win = wins[p.id]!;
		if (now || win.el === source) {
			animateWindow(win, p.amp, p.delay, mass, deform && win.el === source);
		} else {
			// остальные окна оживают, когда до них доходит волна: стоимость обработчика не растёт с их числом
			window.setTimeout(() => {
				if (win.el.isConnected) animateWindow(win, p.amp, 0, mass, false);
			}, p.delay);
		}
	}
	// фон отвечает позже окон (он слабее), поэтому и создаётся позже: обработчик остаётся коротким
	window.setTimeout(() => nudgeBackground(sign, weight), 24);
}

/** Центр источника в окне просмотра; у окна — из кеша, без чтения раскладки */
function centerOf(
	el: Element,
	wins: SheetWindow[],
	sx: number,
	sy: number,
): { x: number; y: number } {
	const win = wins.find((w) => w.el === el);
	if (win)
		return {
			x: win.x + win.w / 2 - (win.fixed ? 0 : sx),
			y: win.y + win.h / 2 - (win.fixed ? 0 : sy),
		};
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateWindow(
	win: SheetWindow,
	amp: number,
	delay: number,
	mass: Mass,
	deform: boolean,
): void {
	const layer = win.layer;
	if (!layer) return;
	if (reduced()) {
		layer.animate([{ opacity: 0.8 }, { opacity: 1 }], { duration: 150, delay });
		return;
	}
	if ((busy.get(win.el) ?? 0) >= MAX_ACTIVE) return;
	const total = ATTACK_MS + SPRINGS[mass].release;
	const attackAt = ATTACK_MS / total;
	const spring = springLinear(mass);
	const shift = Math.round(amp * win.w * 100) / 100;
	// 2D-transform: статичный translate3d сделал бы слой композитным и в покое
	const anim = layer.animate(
		[
			{ transform: "translate(0,0)", offset: 0, easing: EASE_OUT },
			{
				transform: `translate(${shift}px,0)`,
				offset: attackAt,
				easing: spring,
			},
			{ transform: "translate(0,0)", offset: 1 },
		],
		{ duration: total, delay, composite: "add" },
	);
	busy.set(win.el, (busy.get(win.el) ?? 0) + 1);
	const done = (): void => {
		busy.set(win.el, Math.max(0, (busy.get(win.el) ?? 1) - 1));
	};
	anim.onfinish = done;
	anim.oncancel = done;
	if (!deform || win.el.style.transform) return;
	const grow = 1 + Math.min(0.035, (0.03 * Math.abs(amp)) / BASE_SHIFT);
	win.el.animate(
		[
			{ scale: "1", offset: 0, easing: EASE_OUT },
			{ scale: String(grow), offset: attackAt, easing: spring },
			{ scale: "1", offset: 1 },
		],
		{ duration: total, delay },
	);
}

/** Фон отвечает слабее окон: сдвиг вдоль диагонали листа на ≤ 6% ширины экрана */
function nudgeBackground(sign: 1 | -1, weight: number): void {
	if (!backdrop?.isConnected)
		backdrop = document.querySelector<HTMLElement>('[data-slot="sheet"] > i');
	const layer = backdrop;
	if (!layer || reduced()) return;
	const d = Math.round((sign * weight * 0.3 * 0.06 * view.w) / Math.SQRT2);
	const total = ATTACK_MS + SPRINGS.heavy.release;
	layer.animate(
		[
			{ transform: "translate(0,0)", offset: 0, easing: EASE_OUT },
			{
				transform: `translate(${d}px,${d}px)`,
				offset: ATTACK_MS / total,
				easing: springLinear("heavy"),
			},
			{ transform: "translate(0,0)", offset: 1 },
		],
		{ duration: total, composite: "add" },
	);
}

/** Глобальные слушатели: `[data-impulse]` отвечает на нажатие; вес из `data-weight` */
export function startImpulses(): () => void {
	const stopWindows = startWindows();
	readView();
	window.addEventListener("scroll", readView, { passive: true });
	window.addEventListener("resize", readView, { passive: true });
	let pressed: { el: Element; squash: Animation | null } | null = null;

	function hitDisabled(x: number, y: number): Element | null {
		for (const el of document.querySelectorAll(
			"[data-impulse]:disabled, [data-impulse][aria-disabled='true']",
		)) {
			const r = el.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
		}
		return null;
	}

	function down(e: PointerEvent): void {
		if (!e.isPrimary) return;
		const el = (e.target as Element | null)?.closest?.("[data-impulse]");
		if (!el) {
			// у отключённой кнопки нажатие может прийти на обёртку: ищем её под курсором (дорогой поиск — только здесь)
			const denied = hitDisabled(e.clientX, e.clientY);
			if (denied)
				impulse({ source: denied, sign: -1, weight: 0.15, mass: "light" });
			return;
		}
		if (
			(el as HTMLButtonElement).disabled === true ||
			el.getAttribute("aria-disabled") === "true"
		) {
			impulse({ source: el, sign: -1, weight: 0.15, mass: "light" });
			return;
		}
		if (el.getAttribute("data-impulse") === "field") return;
		const weight = Number(el.getAttribute("data-weight"));
		// предвкушение: сжатие ≤ 80 мс; затем лист идёт вперёд, на отпускании выход на 1,03
		const squash = reduced()
			? null
			: el.animate([{ scale: "1" }, { scale: "0.97" }], {
					duration: 80,
					easing: EASE_OUT,
					fill: "forwards",
				});
		pressed = { el, squash };
		impulse({
			source: el,
			sign: 1,
			weight: Number.isFinite(weight) && weight > 0 ? weight : 0.5,
			deform: false,
		});
	}

	function up(): void {
		if (!pressed) return;
		const { el, squash } = pressed;
		pressed = null;
		squash?.cancel();
		if (reduced()) return;
		el.animate(
			[{ scale: "0.97" }, { scale: "1.03", offset: 0.35 }, { scale: "1" }],
			{
				duration: 460,
				easing: "cubic-bezier(.3,.9,.3,1)",
			},
		);
	}

	document.addEventListener("pointerdown", down, true);
	document.addEventListener("pointerup", up, true);
	document.addEventListener("pointercancel", up, true);
	return () => {
		document.removeEventListener("pointerdown", down, true);
		document.removeEventListener("pointerup", up, true);
		document.removeEventListener("pointercancel", up, true);
		window.removeEventListener("scroll", readView);
		window.removeEventListener("resize", readView);
		backdrop = undefined;
		stopWindows();
	};
}
