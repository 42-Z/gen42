// src/components/sheet/doodles/parts.tsx
/**
 * Общие детали дудлов в стиле Duolingo: все фигуры — скруглённые прямоугольники,
 * круги и «таблетки», без острых углов; плоская заливка без градиентов и теней.
 * Цвета — классы `f-*` (заливка) и `s-*` (штрих) из `src/doodles.css`.
 */

/** Положение зрачка внутри белка, доли свободного места: [по x, по y] */
type Look = readonly [number, number];

/**
 * Глаз как у зверей Duolingo: белый круг и тёмный круглый зрачок (около 45 %
 * диаметра) без блика. Зрачок смещён: `look` — доли радиуса по x и y. С `lid`
 * верх закрыт плоским веком цвета шерсти: тот самый «сонный» взгляд их
 * персонажей. Моргает по `d-eye`.
 */
export function EyeDot({
	cx,
	cy,
	r = 9,
	look = [0, 0.35],
	lid,
	lidH = 0.62,
}: {
	cx: number;
	cy: number;
	r?: number;
	look?: Look;
	/** Класс заливки века (цвет шерсти вокруг глаза); без него глаз открыт */
	lid?: string;
	/** Высота века в радиусах глаза */
	lidH?: number;
}) {
	const pr = r * 0.48;
	return (
		<g className="d-eye">
			<circle cx={cx} cy={cy} r={r} className="f-w" />
			<circle
				cx={cx + look[0] * (r - pr)}
				cy={cy + look[1] * (r - pr)}
				r={pr}
				className="f-n"
			/>
			{lid && (
				<rect
					x={cx - r - 0.5}
					y={cy - r - 0.5}
					width={r * 2 + 1}
					height={r * lidH}
					className={lid}
				/>
			)}
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
