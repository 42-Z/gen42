// src/lib/sheet/windows.ts
/**
 * Окна в лист. Элемент с `data-sheet` показывает кусок общего листа: его
 * дочерний слой `.sheet-layer` несёт текстуру, выровненную по координатам
 * страницы переменными --wx/--wy. Положение и размер измеряются при монтировании
 * и при изменении раскладки (ResizeObserver, MutationObserver) и кешируются:
 * импульс не читает раскладку. Слой — настоящий элемент, а не псевдоэлемент:
 * анимация псевдоэлемента через Web Animations в ≈ 9 раз дороже (замер: 0,9 мс
 * против 0,1 мс на 14 окон).
 */
export interface SheetWindow {
	el: HTMLElement;
	layer: HTMLElement | null;
	/** Левый верхний угол на странице (для `data-sheet-fixed` — в окне просмотра), px */
	x: number;
	y: number;
	w: number;
	h: number;
	fixed: boolean;
}

const known = new Map<HTMLElement, SheetWindow>();

export function measure(el: HTMLElement): void {
	const r = el.getBoundingClientRect();
	const fixed = el.hasAttribute("data-sheet-fixed");
	const x = Math.round(r.left + (fixed ? 0 : window.scrollX));
	const y = Math.round(r.top + (fixed ? 0 : window.scrollY));
	const px = `${x}px`;
	const py = `${y}px`;
	if (el.style.getPropertyValue("--wx") !== px)
		el.style.setProperty("--wx", px);
	if (el.style.getPropertyValue("--wy") !== py)
		el.style.setProperty("--wy", py);
	const win = known.get(el);
	if (win) {
		win.x = x;
		win.y = y;
		win.w = r.width;
		win.h = r.height;
		win.fixed = fixed;
	}
}

export function remeasure(el?: HTMLElement): void {
	if (el) measure(el);
	else for (const w of known.keys()) if (w.isConnected) measure(w);
}

/** Массив окон кешируется: импульс читает его на каждое событие, а набор окон меняется редко */
let cached: SheetWindow[] | null = null;

export function sheetWindows(): SheetWindow[] {
	cached ??= [...known.values()].filter((w) => w.el.isConnected);
	return cached;
}

export function startWindows(): () => void {
	const sizes = new ResizeObserver((entries) => {
		for (const e of entries) measure(e.target as HTMLElement);
	});
	const page = new ResizeObserver(() => remeasure());
	let timer = 0;

	function add(el: HTMLElement): void {
		if (known.has(el)) return;
		known.set(el, {
			el,
			layer: el.querySelector<HTMLElement>(":scope > .sheet-layer"),
			x: 0,
			y: 0,
			w: 0,
			h: 0,
			fixed: false,
		});
		cached = null;
		sizes.observe(el);
		measure(el);
	}

	function scan(root: ParentNode): void {
		for (const el of root.querySelectorAll<HTMLElement>("[data-sheet]"))
			add(el);
	}

	function prune(): void {
		for (const el of known.keys()) {
			if (!el.isConnected) {
				known.delete(el);
				cached = null;
				sizes.unobserve(el);
			}
		}
	}

	function later(): void {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			prune();
			remeasure();
		}, 80);
	}

	// getBoundingClientRect читает положение вместе с transform, а у меню и списков
	// анимация входа (zoom, slide) идёт, пока окна внутри впервые измеряются; когда
	// она кончилась, ни ResizeObserver, ни мутации не срабатывают, и текстура
	// оставалась бы сдвинутой на 5–9 px. Поэтому по концу CSS-анимации окна внутри
	// анимированного узла измеряются заново.
	function settled(e: AnimationEvent): void {
		const target = e.target;
		if (!(target instanceof HTMLElement)) return;
		for (const el of known.keys()) if (target.contains(el)) measure(el);
	}

	const mutations = new MutationObserver((records) => {
		for (const r of records) {
			for (const node of r.addedNodes) {
				if (node instanceof HTMLElement) {
					if (node.matches("[data-sheet]")) add(node);
					scan(node);
				}
			}
		}
		later();
	});

	scan(document);
	page.observe(document.documentElement);
	mutations.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
	window.addEventListener("resize", later);
	document.addEventListener("animationend", settled, true);
	return () => {
		window.clearTimeout(timer);
		window.removeEventListener("resize", later);
		document.removeEventListener("animationend", settled, true);
		mutations.disconnect();
		page.disconnect();
		sizes.disconnect();
		known.clear();
		cached = null;
	};
}
