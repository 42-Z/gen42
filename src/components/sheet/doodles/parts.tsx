// src/components/sheet/doodles/parts.tsx
/**
 * Общие детали дудлов в стиле Duolingo: все фигуры — скруглённые прямоугольники,
 * круги и «таблетки», без острых углов; плоская заливка без градиентов и теней.
 * Цвета — классы `f-*` (заливка) и `s-*` (штрих) из `src/doodles.css`.
 */

/** Положение зрачка внутри белка, доли свободного места: [по x, по y] */
type Look = readonly [number, number];

interface EyeProps {
	x: number;
	y: number;
	w?: number;
	h?: number;
	/** Зрачок не по центру по вертикали: у Duolingo он сидит в нижней части */
	look?: Look;
}

/** Глаз-«таблетка»: белок, зрачок и блик в верхнем левом углу; моргает по `d-eye` */
export function Eye({ x, y, w = 18, h = 22, look = [0.5, 0.7] }: EyeProps) {
	const pw = w * 0.54;
	const ph = h * 0.56;
	const px = x + (w - pw) * look[0];
	const py = y + (h - ph) * look[1];
	return (
		<g className="d-eye">
			<rect x={x} y={y} width={w} height={h} rx={w / 2} className="f-w" />
			<rect x={px} y={py} width={pw} height={ph} rx={pw / 2} className="f-n" />
			<circle
				cx={px + pw * 0.32}
				cy={py + ph * 0.3}
				r={pw * 0.17}
				className="f-w"
			/>
		</g>
	);
}

/**
 * Цифры «42» толстым штрихом со скруглёнными концами. Габарит в единицах до
 * масштаба: 92 × 62; `s` — масштаб, `x`/`y` — левый верхний угол.
 */
export function Digits42({
	x,
	y,
	s,
	className = "s-n",
	weight = 10,
}: {
	x: number;
	y: number;
	s: number;
	className?: string;
	weight?: number;
}) {
	return (
		<g
			transform={`translate(${x} ${y}) scale(${s})`}
			className={className}
			fill="none"
			strokeWidth={weight}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M32 57 V6 L6 40 H48" />
			<path d="M58 17 C58 3 87 3 87 18 C87 33 62 43 58 57 H90" />
		</g>
	);
}

/** Тень-«таблетка» под персонажем (овал подразумевал бы перспективу) */
export function Shadow({
	x = 42,
	w = 86,
	y = 90,
}: {
	x?: number;
	w?: number;
	y?: number;
}) {
	return (
		<rect x={x} y={y} width={w} height={8} rx={4} className="f-n d-shadow" />
	);
}

/** Цепь с кулоном «42»: кулон качается на `d-swing` */
export function Pendant({
	cx,
	top,
	w = 30,
}: {
	cx: number;
	top: number;
	w?: number;
}) {
	const h = w * 0.64;
	const s = (w - 8) / 92;
	return (
		<g className="d-swing">
			<rect
				x={cx - w / 2}
				y={top}
				width={w}
				height={h}
				rx={h * 0.32}
				className="f-w"
			/>
			<Digits42 x={cx - 48 * s} y={top + h / 2 - 31.5 * s} s={s} weight={11} />
		</g>
	);
}
