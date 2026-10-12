// scripts/sheet-proto/proto.ts
import { caretOf } from "../../src/lib/sheet/caret";
import { impulse, startImpulses } from "../../src/lib/sheet/impulses";
import { type Mass, SPRINGS, springLinear } from "../../src/lib/sheet/springs";
import { isEraseInput, showTail } from "../../src/lib/sheet/tail";
import { remeasure } from "../../src/lib/sheet/windows";

/**
 * Прототип «Раздув»: вся страница на одном листе. Показывает идею во времени:
 * волну импульса, хвост каретки, резинку вкладок, массы слайдера, ожидание
 * ступенями, сдёргивание занавеса и «выдох».
 */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
	document.getElementById(id) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const WAIT_MS = Number(
	new URLSearchParams(location.search).get("wait") ?? 3600,
);

startImpulses();

// ── Печать: хвост листа за кареткой и лёгкая волна по полю ───────────────
const prompt = $<HTMLTextAreaElement>("prompt");
const field = $("field");
let lastWave = 0;
prompt.addEventListener("input", (e) => {
	const erase = isEraseInput((e as InputEvent).inputType);
	showTail(caretOf(prompt), erase ? -1 : 1);
	const now = performance.now();
	if (now - lastWave > 140) {
		lastWave = now;
		impulse({
			source: field,
			sign: erase ? -1 : 1,
			weight: 0.15,
			mass: "light",
		});
	}
});

// ── Вкладки: индикатор тянется как резинка ──────────────────────────────
const tabsEl = $("tabs");
const ind = $("ind");
const tabs = [...tabsEl.querySelectorAll<HTMLElement>(".tab")];
let at = 0;
const offsetOf = (i: number): number =>
	tabs[i]!.getBoundingClientRect().left -
	tabsEl.getBoundingClientRect().left -
	tabsEl.clientLeft;

function settleIndicator(): void {
	ind.style.width = `${tabs[at]!.offsetWidth}px`;
	ind.style.transform = `translate(${offsetOf(at)}px,0)`;
	remeasure(ind);
}
settleIndicator();

tabs.forEach((tab, i) => {
	tab.addEventListener("click", () => {
		if (i === at) return;
		const x0 = offsetOf(at);
		const x1 = offsetOf(i);
		const forward = i > at;
		const stretch = 1 + Math.min(0.9, Math.abs(x1 - x0) / tab.offsetWidth);
		at = i;
		for (const [k, t] of tabs.entries())
			t.setAttribute("aria-selected", String(k === i));
		ind.style.transform = `translate(${x1}px,0)`;
		if (!reduced) {
			for (const a of ind.getAnimations()) a.cancel();
			ind.animate(
				[
					{ transform: `translate(${x0}px,0) scaleX(1)` },
					{
						transform: `translate(${(x0 + x1) / 2}px,0) scaleX(${stretch})`,
						offset: 0.45,
					},
					{ transform: `translate(${x1}px,0) scaleX(1)` },
				],
				{ duration: 560, easing: "cubic-bezier(.3,.9,.3,1)" },
			);
		}
		window.setTimeout(() => remeasure(ind), reduced ? 0 : 580);
		impulse({
			source: tab,
			sign: forward ? 1 : -1,
			weight: forward ? 0.6 : 0.35,
		});
	});
});

// ── Слайдер «Рассуждение»: у каждого уровня своя масса ───────────────────
const slider = $("slider");
const thumb = $("thumb");
const fill = $("fill");
const NAMES = ["Среднее", "Высокое", "Очень высокое", "Максимальное"];
const MASSES: Mass[] = ["light", "medium", "medium", "heavy"];
const SNAP_MS = [180, 280, 380, 500];
let level = 1;
let pos = 0;
/** Растяжение ручки при быстром движении: scaleX в том же transform, что и сдвиг */
let stretch = 1;
let dragging = false;

const geom = () => {
	const w = slider.clientWidth;
	const tw = thumb.offsetWidth;
	return { w, tw, span: w - tw };
};
const posFor = (lv: number): number => (geom().span * lv) / 3;
const fillFor = (px: number): number => (px + geom().tw / 2) / geom().w;

function place(px: number): void {
	pos = px;
	thumb.style.transform = `translate(${px}px,0) scaleX(${stretch})`;
	fill.style.transform = `scaleX(${fillFor(px)})`;
}

function setLevel(lv: number): void {
	if (lv === level) return;
	const up = lv > level;
	level = lv;
	slider.setAttribute("aria-valuenow", String(lv));
	slider.setAttribute("aria-valuetext", NAMES[lv]!);
	impulse({
		source: thumb,
		sign: up ? 1 : -1,
		weight: 0.2 + 0.2 * lv,
		mass: MASSES[lv]!,
	});
}

function snap(from_stretch = 1): void {
	const from = pos;
	const target = posFor(level);
	place(target);
	if (!reduced) {
		const opts = {
			duration: SNAP_MS[level]!,
			easing: springLinear(MASSES[level]!),
		};
		thumb.animate(
			[
				{ transform: `translate(${from}px,0) scaleX(${from_stretch})` },
				{ transform: `translate(${target}px,0) scaleX(1)` },
			],
			opts,
		);
		fill.animate(
			[
				{ transform: `scaleX(${fillFor(from)})` },
				{ transform: `scaleX(${fillFor(target)})` },
			],
			opts,
		);
	}
	window.setTimeout(() => remeasure(thumb), reduced ? 0 : SNAP_MS[level]! + 20);
}

const pxOf = (e: PointerEvent): number => {
	const r = slider.getBoundingClientRect();
	const g = geom();
	return Math.min(g.span, Math.max(0, e.clientX - r.left - g.tw / 2));
};

function drag(e: PointerEvent): void {
	const next = pxOf(e);
	stretch = reduced ? 1 : 1 + Math.min(0.15, Math.abs(next - pos) / 60);
	place(next);
	remeasure(thumb);
	setLevel(Math.round((next / geom().span) * 3));
}

slider.addEventListener("pointerdown", (e) => {
	dragging = true;
	slider.setPointerCapture(e.pointerId);
	for (const a of [...thumb.getAnimations(), ...fill.getAnimations()])
		a.cancel();
	drag(e);
});
slider.addEventListener("pointermove", (e) => {
	if (dragging) drag(e);
});
const endDrag = (): void => {
	if (!dragging) return;
	dragging = false;
	const was = stretch;
	stretch = 1;
	snap(was);
};
slider.addEventListener("pointerup", endDrag);
slider.addEventListener("pointercancel", endDrag);
slider.addEventListener("keydown", (e) => {
	if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
	setLevel(Math.min(3, Math.max(0, level + (e.key === "ArrowRight" ? 1 : -1))));
	snap();
});

place(posFor(level));
remeasure(thumb);
window.addEventListener("resize", () => {
	place(posFor(level));
	settleIndicator();
});

// ── Баланс: старое число уходит вверх, новое приходит снизу ──────────────
const numbox = $("numbox");
const num = $("num");
let balance = 42;

function roll(next: number): void {
	if (reduced) {
		num.textContent = String(next);
		return;
	}
	const incoming = document.createElement("span");
	incoming.className = "num-in";
	incoming.textContent = String(next);
	numbox.appendChild(incoming);
	num.animate(
		[
			{ transform: "translate(0,0)", opacity: 1 },
			{ transform: "translate(0,-110%)", opacity: 0 },
		],
		{ duration: 360, easing: springLinear("light"), fill: "forwards" },
	);
	incoming
		.animate(
			[
				{ transform: "translate(0,110%)", opacity: 0 },
				{ transform: "translate(0,0)", opacity: 1 },
			],
			{ duration: 360, easing: "cubic-bezier(.3,.9,.3,1)", fill: "forwards" },
		)
		.finished.then(() => {
			num.textContent = String(next);
			for (const a of num.getAnimations()) a.cancel();
			incoming.remove();
		});
}

// ── Генерация: рамка растёт, ожидание ступенями, занавес, выдох ───────────
const go = $("go");
const frame = $("frame");
const flow = $("flow");
const pic = $("pic");
const tiles = $("tiles");
const ART = [
	"radial-gradient(circle at 25% 30%, #fde047, transparent 50%), radial-gradient(circle at 75% 70%, #22d3ee, transparent 55%), #1f2a44",
	"conic-gradient(from 120deg at 50% 50%, #fb7185, #f59e0b, #34d399, #fb7185)",
];
let busy = false;
let breath: Animation | null = null;
let made = 0;

function addTile(): void {
	const tile = document.createElement("button");
	tile.className = "tile";
	tile.setAttribute("data-sheet", "ring");
	tile.setAttribute("data-impulse", "tap");
	tile.setAttribute("data-weight", "0.3");
	tile.setAttribute("aria-label", "Открыть");
	tile.style.background = ART[made++ % ART.length]!;
	tiles.prepend(tile);
	if (!reduced) {
		tile.animate(
			[
				{ opacity: 0, transform: "scale(0.9)" },
				{ opacity: 1, transform: "scale(1)" },
			],
			{ duration: 560, easing: springLinear("medium") },
		);
	}
}

function reveal(): void {
	breath?.cancel();
	breath = null;
	pic.style.opacity = "1";
	const finish = (): void => {
		flow.style.opacity = "0";
		frame.classList.remove("waiting");
		impulse({ source: frame, sign: 1, weight: 1, mass: "heavy" });
		addTile();
		busy = false;
	};
	if (reduced) {
		finish();
		return;
	}
	pic.animate([{ transform: "scale(1.04)" }, { transform: "scale(1)" }], {
		duration: 700,
		easing: springLinear("heavy"),
	});
	const curtain = flow.animate(
		[{ transform: "translate(0,0)" }, { transform: "translate(-102%,0)" }],
		{ duration: 650, easing: springLinear("heavy"), fill: "forwards" },
	);
	curtain.finished.then(() => {
		flow.style.opacity = "0";
		curtain.cancel();
		finish();
	});
}

go.addEventListener("click", () => {
	if (busy) return;
	busy = true;
	balance -= 10;
	roll(balance);
	impulse({ source: $("pill"), sign: -1, weight: 0.25, mass: "light" });
	pic.style.opacity = "0";
	frame.dataset.ready = "true";
	frame.classList.add("waiting");
	if (!reduced) {
		frame.animate(
			[
				{ transform: "scaleY(0.16)", opacity: 0 },
				{ transform: "scaleY(1)", opacity: 1 },
			],
			{ duration: SPRINGS.heavy.move, easing: springLinear("heavy") },
		);
	}
	flow.style.opacity = "0.25";
	window.setTimeout(() => {
		flow.style.opacity = "0.4";
		impulse({ source: frame, sign: 1, weight: 0.3, mass: "heavy" });
		if (!reduced) {
			breath = flow.animate([{ opacity: 0.4 }, { opacity: 0.55 }], {
				duration: 2000,
				direction: "alternate",
				iterations: Number.POSITIVE_INFINITY,
				easing: "ease-in-out",
			});
		}
	}, 800);
	window.setTimeout(reveal, WAIT_MS);
});
