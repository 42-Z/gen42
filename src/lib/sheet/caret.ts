// src/lib/sheet/caret.ts
/**
 * Положение каретки в окне просмотра. Для textarea: скрытое зеркало с теми же
 * шрифтом, отступами и шириной; текст до каретки + метка, по метке читаем
 * позицию (один замер раскладки на нажатие). Для однострочного input ширина
 * текста меряется через canvas measureText без раскладки.
 */
export interface CaretPoint {
	/** Середина каретки по горизонтали */
	x: number;
	/** Середина строки по вертикали */
	y: number;
	/** Высота строки */
	h: number;
}

export const MIRROR_PROPS = [
	"direction",
	"box-sizing",
	"width",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
	"border-style",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"font-style",
	"font-variant",
	"font-weight",
	"font-stretch",
	"font-size",
	"font-size-adjust",
	"line-height",
	"font-family",
	"text-align",
	"text-transform",
	"text-indent",
	"text-decoration",
	"letter-spacing",
	"word-spacing",
	"tab-size",
] as const;

export function caretViewportPoint(i: {
	fieldLeft: number;
	fieldTop: number;
	borderLeft: number;
	borderTop: number;
	markLeft: number;
	markTop: number;
	markHeight: number;
	scrollLeft: number;
	scrollTop: number;
}): CaretPoint {
	return {
		x: i.fieldLeft + i.borderLeft + i.markLeft - i.scrollLeft,
		y: i.fieldTop + i.borderTop + i.markTop - i.scrollTop + i.markHeight / 2,
		h: i.markHeight,
	};
}

let mirror: HTMLDivElement | null = null;

function getMirror(): HTMLDivElement {
	if (!mirror) {
		mirror = document.createElement("div");
		mirror.setAttribute("aria-hidden", "true");
		const s = mirror.style;
		s.position = "fixed";
		s.left = "-9999px";
		s.top = "0";
		s.visibility = "hidden";
		s.whiteSpace = "pre-wrap";
		s.overflowWrap = "break-word";
		document.body.appendChild(mirror);
	}
	return mirror;
}

function textareaCaret(el: HTMLTextAreaElement): CaretPoint {
	const cs = getComputedStyle(el);
	const m = getMirror();
	for (const p of MIRROR_PROPS) m.style.setProperty(p, cs.getPropertyValue(p));
	m.style.overflow = "hidden";
	m.style.height = "auto";
	const pos = el.selectionEnd ?? el.value.length;
	m.textContent = el.value.slice(0, pos);
	const mark = document.createElement("span");
	mark.textContent = el.value.slice(pos) || ".";
	m.appendChild(mark);
	const lineHeight =
		Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2;
	const r = el.getBoundingClientRect();
	return caretViewportPoint({
		fieldLeft: r.left,
		fieldTop: r.top,
		borderLeft: Number.parseFloat(cs.borderLeftWidth) || 0,
		borderTop: Number.parseFloat(cs.borderTopWidth) || 0,
		markLeft: mark.offsetLeft,
		markTop: mark.offsetTop,
		markHeight: lineHeight,
		scrollLeft: el.scrollLeft,
		scrollTop: el.scrollTop,
	});
}

let measureCtx: CanvasRenderingContext2D | null = null;

function inputCaret(el: HTMLInputElement): CaretPoint {
	const cs = getComputedStyle(el);
	measureCtx ??= document.createElement("canvas").getContext("2d");
	const r = el.getBoundingClientRect();
	// у email и number браузер не отдаёт каретку (selectionEnd = null, это норма
	// спецификации), поэтому эффект идёт к концу значения: читать больше нечего
	const pos = el.selectionEnd ?? el.value.length;
	let width = 0;
	if (measureCtx) {
		measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
		const text =
			el.type === "password" ? "•".repeat(pos) : el.value.slice(0, pos);
		width = measureCtx.measureText(text).width;
	}
	return {
		x:
			r.left +
			(Number.parseFloat(cs.borderLeftWidth) || 0) +
			(Number.parseFloat(cs.paddingLeft) || 0) +
			width -
			el.scrollLeft,
		y: r.top + r.height / 2,
		h: Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2,
	};
}

export function caretOf(
	el: HTMLInputElement | HTMLTextAreaElement,
): CaretPoint {
	return el instanceof HTMLTextAreaElement ? textareaCaret(el) : inputCaret(el);
}
