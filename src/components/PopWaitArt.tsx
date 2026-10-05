import { type CSSProperties, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Ожидание генерации: хрустальные осколки и лучи. Ни буквы, ни цифры —
 * только грани, свет и блики. Композиция процедурная: при каждом монтировании
 * заново разыгрываются углы, размеры, задержки и доли палитры, поэтому два
 * запуска подряд выглядят по-разному. Вся анимация — CSS keyframes: сцена
 * рисуется один раз, дальше браузер сам крутит transform и opacity.
 * При prefers-reduced-motion движение выключается медиазапросом, а композиция
 * остаётся нарядной статикой (базовые стили — это и есть «парадный» кадр).
 */

/* Палитра поп-темы */
const INDIGO = "#6c5cff";
const FUCHSIA = "#ff5ca8";
const GOLD = "#ffd54a";
const PEARL = "#f2efff";
const VOID = "#0d0b1e";

/** Инлайн-стиль с CSS-переменными: их нет в CSSProperties, но они нужны keyframes */
type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Случайное число в диапазоне; округляем, чтобы стили в DOM оставались читаемыми */
const rand = (min: number, max: number) =>
	Math.round((min + Math.random() * (max - min)) * 100) / 100;
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
/** Округление до сотых: проценты в стилях не должны расползаться в длинные дроби */
const round2 = (value: number) => Math.round(value * 100) / 100;
const chance = (probability: number) => Math.random() < probability;
const sign = (): 1 | -1 => (chance(0.5) ? 1 : -1);

/** Собирает shorthand-анимацию: имя, длительность, смягчение, отрицательная задержка */
function anim(
	name: string,
	duration: number,
	easing: string,
	delay: number,
	extra = "",
): string {
	return `${name} ${duration}s ${easing} ${-delay}s infinite${extra ? ` ${extra}` : ""}`;
}

function hexToRgb(hex: string): [number, number, number] {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	];
}

/** Смешивает два цвета палитры: 0 — первый, 1 — второй */
function mixColor(from: string, to: string, share: number): string {
	const [r1, g1, b1] = hexToRgb(from);
	const [r2, g2, b2] = hexToRgb(to);
	const part = (a: number, b: number) => Math.round(a + (b - a) * share);
	return `rgb(${part(r1, r2)} ${part(g1, g2)} ${part(b1, b2)})`;
}

/** Тот же цвет с прозрачностью — для свечений, граней и обводок */
function alpha(hex: string, value: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgb(${r} ${g} ${b} / ${value})`;
}

/* ── Геометрия осколков ───────────────────────────────────────────────
   Квадрат 100×100, центроид каждой формы — в его середине, поэтому
   вращение вокруг собственного центра не сбивает композицию. */

interface ShardShape {
	/** Контур кристалла */
	body: string;
	/** Грани поверх контура: светлая и «глухая» */
	facets: { points: string; tone: "light" | "deep" }[];
	/** Блик у вершины */
	glint: string;
}

const SHARD_KITE: ShardShape = {
	body: "50 2 78 34 50 98 22 34",
	facets: [
		{ points: "50 2 78 34 50 98", tone: "light" },
		{ points: "50 2 22 34 50 98", tone: "deep" },
	],
	glint: "50 14 61 30 50 46 39 30",
};

const SHARD_SLIVER: ShardShape = {
	body: "64 4 90 32 38 96 14 64",
	facets: [
		{ points: "64 4 90 32 38 96", tone: "light" },
		{ points: "64 4 14 64 38 96", tone: "deep" },
	],
	glint: "66 18 75 32 63 48 54 34",
};

const SHARD_PRISM: ShardShape = {
	body: "50 4 89.8 73 10.2 73",
	facets: [
		{ points: "50 4 89.8 73 50 50", tone: "light" },
		{ points: "50 4 10.2 73 50 50", tone: "deep" },
	],
	glint: "50 20 59 36 50 52 41 36",
};

function pickShardShape(): ShardShape {
	const roll = Math.random();
	if (roll < 0.42) return SHARD_KITE;
	if (roll < 0.74) return SHARD_SLIVER;
	return SHARD_PRISM;
}

/** Наклон градиентной заливки: вектор внутри objectBoundingBox */
function gradientVector(angleDeg: number) {
	const rad = (angleDeg * Math.PI) / 180;
	const dx = Math.cos(rad) / 2;
	const dy = Math.sin(rad) / 2;
	return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

/* ── Процедурные параметры ─────────────────────────────────────────── */

const SHARD_COUNT = 6;

/** Четырёхлучевая искра с прямыми рёбрами — «блик» кристалла */
const SPARK_STAR =
	"M24 2 29.2 18.8 46 24 29.2 29.2 24 46 18.8 29.2 2 24 18.8 18.8Z";

const OCTAGON =
	"60 6 98.2 21.8 114 60 98.2 98.2 60 114 21.8 98.2 6 60 21.8 21.8";
const HEXAGON = "60 18 96.4 39 96.4 81 60 102 23.6 81 23.6 39";
const DIAMOND = "60 30 90 60 60 90 30 60";
const HEART = "60 46 74 60 60 74 46 60";

const RAYS_MASK =
	"radial-gradient(closest-side, transparent 8%, #000 32%, #000 60%, transparent 86%)";
const FINE_RAYS_MASK =
	"radial-gradient(closest-side, transparent 14%, #000 38%, #000 58%, transparent 80%)";
const ORBIT_MASK =
	"radial-gradient(closest-side, transparent 93%, #000 95%, #000 99%, transparent 100%)";

/** Широкие лучи: три лепестка через 120° */
function raysGradient(from: number): string {
	return `conic-gradient(from ${from}deg, ${alpha(INDIGO, 0)} 0deg, ${alpha(INDIGO, 0.18)} 9deg, ${alpha(INDIGO, 0)} 26deg, ${alpha(INDIGO, 0)} 120deg, ${alpha(FUCHSIA, 0.16)} 129deg, ${alpha(FUCHSIA, 0)} 146deg, ${alpha(INDIGO, 0)} 240deg, ${alpha(GOLD, 0.13)} 249deg, ${alpha(GOLD, 0)} 266deg, ${alpha(INDIGO, 0)} 360deg)`;
}

/** Тонкие лучи: четыре узких блика через 90° */
function fineRaysGradient(from: number): string {
	return `conic-gradient(from ${from}deg, ${alpha(PEARL, 0)} 0deg, ${alpha(PEARL, 0.16)} 2.6deg, ${alpha(PEARL, 0)} 7deg, ${alpha(PEARL, 0)} 90deg, ${alpha(PEARL, 0.13)} 92.6deg, ${alpha(PEARL, 0)} 97deg, ${alpha(PEARL, 0)} 180deg, ${alpha(PEARL, 0.15)} 182.6deg, ${alpha(PEARL, 0)} 187deg, ${alpha(PEARL, 0)} 270deg, ${alpha(PEARL, 0.12)} 272.6deg, ${alpha(PEARL, 0)} 277deg, ${alpha(PEARL, 0)} 360deg)`;
}

interface ShardSpec {
	shape: ShardShape;
	/** Положение на кольце */
	angle: number;
	radius: number;
	size: number;
	/** Собственный наклон и вращение вокруг своей оси */
	tilt: number;
	spin: number;
	spinDelay: number;
	dir: 1 | -1;
	/** Дыхание объёма */
	breathe: number;
	breatheDelay: number;
	breatheDepth: number;
	opacity: number;
	from: string;
	to: string;
	gradient: { x1: number; y1: number; x2: number; y2: number };
	facet: string;
	facetOpacity: number;
	deepOpacity: number;
	glintOpacity: number;
	stroke: string;
	glow: string;
}

interface SparkSpec {
	x: number;
	y: number;
	size: number;
	rot: number;
	color: string;
	duration: number;
	delay: number;
	lo: number;
	hi: number;
}

interface HaloSpec {
	x: number;
	y: number;
	size: number;
	color: string;
	opacity: number;
	duration: number;
	delay: number;
	drift: "a" | "b" | "c";
}

interface CoreRing {
	points: string;
	fill: string;
	stroke: string;
	width: number;
	spin: number;
	dir: 1 | -1;
	delay: number;
	tilt: number;
}

interface Variant {
	seed: string;
	shards: ShardSpec[];
	sparks: SparkSpec[];
	halos: HaloSpec[];
	core: {
		glow: {
			duration: number;
			delay: number;
			lo: number;
			hi: number;
			depth: number;
		};
		flare: {
			duration: number;
			delay: number;
			lo: number;
			hi: number;
			depth: number;
			wide: number;
			tall: number;
		};
		heart: {
			duration: number;
			delay: number;
			lo: number;
			hi: number;
			depth: number;
		};
		rings: CoreRing[];
	};
	rays: { from: number; duration: number; delay: number; reverse: boolean };
	fineRays: { from: number; duration: number; delay: number; reverse: boolean };
	orbit: { from: number; duration: number; delay: number; reverse: boolean };
	sweep: {
		duration: number;
		delay: number;
		rotate: number;
		hi: number;
		staticOpacity: number;
	};
	scene: { duration: number; delay: number; depth: number };
}

function makeShard(index: number, ringTilt: number): ShardSpec {
	const mix = rand(0.18, 0.85);
	const golden = chance(0.35);
	const from = mixColor(INDIGO, FUCHSIA, mix);
	const to = mixColor(FUCHSIA, golden ? GOLD : INDIGO, rand(0.05, 0.42));
	const size = rand(15, 26);
	/* Внутренний край осколка не заходит на ядро, внешний может уйти за кадр */
	const radius = Math.max(rand(27, 37), round2(size / 2 + 21));
	return {
		shape: pickShardShape(),
		angle: ringTilt + (360 / SHARD_COUNT) * index + rand(-8, 8),
		radius,
		size,
		tilt: rand(-34, 34),
		spin: rand(34, 68),
		spinDelay: rand(0, 60),
		dir: sign(),
		breathe: rand(5.5, 10.5),
		breatheDelay: rand(0, 9),
		breatheDepth: rand(1.06, 1.16),
		opacity: rand(0.62, 0.95),
		from,
		to,
		gradient: gradientVector(rand(0, 360)),
		facet: golden || chance(0.4) ? GOLD : PEARL,
		facetOpacity: rand(0.1, 0.22),
		deepOpacity: rand(0.16, 0.32),
		glintOpacity: rand(0.3, 0.55),
		stroke: chance(0.5) ? PEARL : GOLD,
		glow: mixColor(from, to, 0.5),
	};
}

function makeSpark(index: number, count: number): SparkSpec {
	/* Кольцо вокруг ядра: ровные углы со сдвигом, чтобы композиция оставалась собранной */
	const angle = (360 / count) * index + rand(-20, 20);
	const radius = rand(26, 46);
	const rad = (angle * Math.PI) / 180;
	const roll = Math.random();
	const color =
		roll < 0.42 ? GOLD : roll < 0.72 ? PEARL : roll < 0.88 ? FUCHSIA : INDIGO;
	return {
		x: 50 + Math.cos(rad) * radius,
		y: 50 + Math.sin(rad) * radius,
		size: rand(9, 21),
		rot: rand(0, 90),
		color,
		duration: rand(3.4, 6.6),
		delay: rand(0, 18),
		lo: rand(0.08, 0.2),
		hi: rand(0.72, 0.95),
	};
}

/** Разыгрывает весь рисунок заново: два монтирования не совпадают */
function makeVariant(): Variant {
	const ringTilt = rand(0, 360);
	const sparkCount = randInt(8, 12);
	return {
		seed: Math.random().toString(36).slice(2, 8),
		shards: Array.from({ length: SHARD_COUNT }, (_, index) =>
			makeShard(index, ringTilt),
		),
		sparks: Array.from({ length: sparkCount }, (_, index) =>
			makeSpark(index, sparkCount),
		),
		halos: [
			{
				x: rand(14, 30),
				y: rand(12, 26),
				size: rand(58, 76),
				color: INDIGO,
				opacity: rand(0.28, 0.42),
				duration: rand(22, 34),
				delay: rand(0, 18),
				drift: "a",
			},
			{
				x: rand(68, 88),
				y: rand(70, 88),
				size: rand(50, 70),
				color: FUCHSIA,
				opacity: rand(0.2, 0.32),
				duration: rand(26, 40),
				delay: rand(0, 22),
				drift: "b",
			},
			{
				x: rand(70, 86),
				y: rand(8, 22),
				size: rand(26, 40),
				color: GOLD,
				opacity: rand(0.1, 0.18),
				duration: rand(18, 28),
				delay: rand(0, 14),
				drift: "c",
			},
		],
		core: {
			glow: {
				duration: rand(4.6, 7.4),
				delay: rand(0, 6),
				lo: rand(0.62, 0.78),
				hi: rand(0.92, 1),
				depth: rand(1.05, 1.12),
			},
			flare: {
				duration: rand(5.4, 8.6),
				delay: rand(0, 7),
				lo: rand(0.28, 0.42),
				hi: rand(0.68, 0.88),
				depth: rand(1.02, 1.06),
				wide: rand(34, 46),
				tall: rand(30, 42),
			},
			heart: {
				duration: rand(3.8, 6.2),
				delay: rand(0, 5),
				lo: rand(0.5, 0.7),
				hi: rand(0.88, 1),
				depth: rand(1.08, 1.18),
			},
			rings: [
				{
					points: OCTAGON,
					fill: alpha(INDIGO, 0.1),
					stroke: alpha(PEARL, 0.32),
					width: 1.1,
					spin: rand(46, 74),
					dir: sign(),
					delay: rand(0, 40),
					tilt: rand(0, 45),
				},
				{
					points: HEXAGON,
					fill: alpha(FUCHSIA, 0.1),
					stroke: alpha(GOLD, 0.34),
					width: 1.2,
					spin: rand(30, 52),
					dir: sign(),
					delay: rand(0, 30),
					tilt: rand(0, 30),
				},
				{
					points: DIAMOND,
					fill: alpha(PEARL, 0.14),
					stroke: alpha(FUCHSIA, 0.4),
					width: 1.3,
					spin: rand(20, 36),
					dir: sign(),
					delay: rand(0, 20),
					tilt: rand(0, 20),
				},
			],
		},
		rays: {
			from: rand(0, 360),
			duration: rand(72, 128),
			delay: rand(0, 90),
			reverse: chance(0.5),
		},
		fineRays: {
			from: rand(0, 360),
			duration: rand(110, 180),
			delay: rand(0, 120),
			reverse: chance(0.5),
		},
		orbit: {
			from: rand(0, 360),
			duration: rand(46, 84),
			delay: rand(0, 60),
			reverse: chance(0.5),
		},
		sweep: {
			duration: rand(11, 17),
			delay: rand(0, 12),
			rotate: rand(14, 26) * sign(),
			hi: rand(0.72, 0.95),
			staticOpacity: rand(0.34, 0.5),
		},
		scene: {
			duration: rand(22, 34),
			delay: rand(0, 20),
			depth: rand(1.015, 1.035),
		},
	};
}

/* ── CSS: одни и те же keyframes, различие — в инлайн-переменных ────── */

const PWS_STYLES = `
@keyframes pws-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* Вращение от собственного наклона: осколки и грани ядра */
@keyframes pws-turn {
	from { transform: rotate(var(--tilt)); }
	to { transform: rotate(calc(var(--tilt) + 360deg * var(--dir))); }
}

@keyframes pws-shard-breathe {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(var(--breath)); }
}

@keyframes pws-scene-breathe {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(var(--breath)); }
}

@keyframes pws-pulse {
	0%, 100% { opacity: var(--lo); transform: scale(1); }
	50% { opacity: var(--hi); transform: scale(var(--breath)); }
}

@keyframes pws-twinkle {
	0%, 100% { opacity: var(--lo); transform: scale(0.5); }
	50% { opacity: var(--hi); transform: scale(1); }
}

@keyframes pws-drift-a {
	0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
	50% { transform: translate3d(5%, -6%, 0) scale(1.08); }
}

@keyframes pws-drift-b {
	0%, 100% { transform: translate3d(0, 0, 0) scale(1.04); }
	50% { transform: translate3d(-6%, 5%, 0) scale(0.96); }
}

@keyframes pws-drift-c {
	0%, 100% { transform: translate3d(0, 0, 0) scale(0.94); }
	50% { transform: translate3d(4%, 6%, 0) scale(1.06); }
}

@keyframes pws-sweep {
	0% { transform: translate3d(-82%, 0, 0) rotate(var(--rot)); opacity: 0; }
	16% { opacity: var(--hi); }
	46% { transform: translate3d(82%, 0, 0) rotate(var(--rot)); opacity: var(--hi); }
	62%, 100% { transform: translate3d(82%, 0, 0) rotate(var(--rot)); opacity: 0; }
}

/* Отключённое движение: keyframes замирают, базовые стили дают парадный кадр */
@media (prefers-reduced-motion: reduce) {
	.pws-root,
	.pws-root * {
		animation: none !important;
	}
}
`;

/* ── Компонент ─────────────────────────────────────────────────────── */

export function PopWaitArt({ className }: { className?: string }) {
	const [variant] = useState(makeVariant);
	const { core, sweep } = variant;

	return (
		<div
			className={cn(
				"pws-root pointer-events-none relative isolate size-full overflow-hidden",
				className,
			)}
			aria-hidden="true"
		>
			{/* React 19 выносит стили в head и дедуплицирует их по href */}
			<style href="pop-wait-shards" precedence="default">
				{PWS_STYLES}
			</style>

			{/* Сцена дышит целиком — очень медленно и почти незаметно */}
			<div
				className="absolute inset-0"
				style={
					{
						transform: "scale(1)",
						animation: anim(
							"pws-scene-breathe",
							variant.scene.duration,
							"ease-in-out",
							variant.scene.delay,
						),
						"--breath": variant.scene.depth,
					} as Vars
				}
			>
				{/* Мягкие цветные дымки на фоне */}
				{variant.halos.map((halo, index) => (
					<div
						key={index}
						className="absolute rounded-full"
						style={{
							left: `${round2(halo.x - halo.size / 2)}%`,
							top: `${round2(halo.y - halo.size / 2)}%`,
							width: `${halo.size}%`,
							height: `${halo.size}%`,
							background: `radial-gradient(circle at 50% 50%, ${alpha(halo.color, halo.opacity)}, ${alpha(halo.color, 0)} 70%)`,
							animation: anim(
								`pws-drift-${halo.drift}`,
								halo.duration,
								"ease-in-out",
								halo.delay,
							),
						}}
					/>
				))}

				{/* Широкие лучи: медленно поворачиваются вокруг ядра */}
				<div
					className="absolute"
					style={{
						inset: "-22%",
						background: raysGradient(variant.rays.from),
						maskImage: RAYS_MASK,
						WebkitMaskImage: RAYS_MASK,
						animation: anim(
							"pws-spin",
							variant.rays.duration,
							"linear",
							variant.rays.delay,
							variant.rays.reverse ? "reverse" : "",
						),
					}}
				/>

				{/* Тонкие лучи-блики: свой ход и своё направление */}
				<div
					className="absolute"
					style={{
						inset: "-14%",
						background: fineRaysGradient(variant.fineRays.from),
						maskImage: FINE_RAYS_MASK,
						WebkitMaskImage: FINE_RAYS_MASK,
						opacity: 0.7,
						animation: anim(
							"pws-spin",
							variant.fineRays.duration,
							"linear",
							variant.fineRays.delay,
							variant.fineRays.reverse ? "reverse" : "",
						),
					}}
				/>

				{/* Спокойное кольцо-орбита и бегущая по нему золотая искра */}
				<div
					className="absolute rounded-full border"
					style={{ inset: "11%", borderColor: alpha(INDIGO, 0.14) }}
				/>
				<div
					className="absolute rounded-full"
					style={{
						inset: "11%",
						background: `conic-gradient(from ${variant.orbit.from}deg, ${alpha(GOLD, 0)} 0deg, ${alpha(GOLD, 0.5)} 16deg, ${alpha(PEARL, 0.36)} 34deg, ${alpha(FUCHSIA, 0)} 64deg, ${alpha(FUCHSIA, 0)} 360deg)`,
						maskImage: ORBIT_MASK,
						WebkitMaskImage: ORBIT_MASK,
						opacity: 0.75,
						animation: anim(
							"pws-spin",
							variant.orbit.duration,
							"linear",
							variant.orbit.delay,
							variant.orbit.reverse ? "reverse" : "",
						),
					}}
				/>

				{/* Осколки на кольце: каждый со своим наклоном, ходом и дыханием */}
				{variant.shards.map((shard, index) => {
					const gradientId = `${variant.seed}-shard-${index}`;
					return (
						<div
							key={index}
							className="absolute inset-0"
							style={{ transform: `rotate(${shard.angle}deg)` }}
						>
							<div
								className="absolute"
								style={
									{
										left: "50%",
										top: `calc(50% - ${shard.radius}%)`,
										width: `${shard.size}%`,
										height: `${shard.size}%`,
										marginLeft: `-${shard.size / 2}%`,
										marginTop: `-${shard.size / 2}%`,
										opacity: shard.opacity,
										transform: `rotate(${shard.tilt}deg)`,
										animation: anim(
											"pws-turn",
											shard.spin,
											"linear",
											shard.spinDelay,
										),
										"--tilt": `${shard.tilt}deg`,
										"--dir": shard.dir,
									} as Vars
								}
							>
								<div
									className="size-full"
									style={
										{
											transform: "scale(1)",
											animation: anim(
												"pws-shard-breathe",
												shard.breathe,
												"ease-in-out",
												shard.breatheDelay,
											),
											"--breath": shard.breatheDepth,
										} as Vars
									}
								>
									<svg
										viewBox="0 0 100 100"
										className="size-full overflow-visible"
										aria-hidden="true"
										style={{
											filter: `drop-shadow(0 0 9px ${alpha(shard.glow, 0.45)})`,
										}}
									>
										<defs>
											<linearGradient
												id={gradientId}
												x1={shard.gradient.x1}
												y1={shard.gradient.y1}
												x2={shard.gradient.x2}
												y2={shard.gradient.y2}
											>
												<stop offset="0" stopColor={shard.from} />
												<stop offset="0.58" stopColor={shard.to} />
												<stop
													offset="1"
													stopColor={mixColor(shard.to, PEARL, 0.4)}
												/>
											</linearGradient>
										</defs>
										<polygon
											points={shard.shape.body}
											fill={`url(#${gradientId})`}
										/>
										{shard.shape.facets.map((facet, facetIndex) => (
											<polygon
												key={facetIndex}
												points={facet.points}
												fill={
													facet.tone === "light"
														? alpha(shard.facet, shard.facetOpacity)
														: alpha(VOID, shard.deepOpacity)
												}
											/>
										))}
										<polygon
											points={shard.shape.glint}
											fill={alpha(PEARL, shard.glintOpacity)}
										/>
										<polygon
											points={shard.shape.body}
											fill="none"
											stroke={alpha(shard.stroke, 0.45)}
											strokeWidth="1.8"
											strokeLinejoin="round"
										/>
									</svg>
								</div>
							</div>
						</div>
					);
				})}

				{/* Ядро: мягкое свечение, световой крест и гранёный кристалл */}
				<div className="absolute" style={{ inset: "27%" }}>
					<div
						className="absolute inset-0"
						style={
							{
								background: `radial-gradient(circle at 50% 50%, ${alpha(PEARL, 0.85)} 0%, ${alpha(INDIGO, 0.5)} 22%, ${alpha(FUCHSIA, 0.26)} 44%, ${alpha(INDIGO, 0)} 72%)`,
								opacity: core.glow.hi,
								animation: anim(
									"pws-pulse",
									core.glow.duration,
									"ease-in-out",
									core.glow.delay,
								),
								"--lo": core.glow.lo,
								"--hi": core.glow.hi,
								"--breath": core.glow.depth,
							} as Vars
						}
					/>
					<div
						className="absolute"
						style={
							{
								left: `-${core.flare.wide}%`,
								right: `-${core.flare.wide}%`,
								top: "50%",
								height: "2%",
								marginTop: "-1%",
								background: `linear-gradient(90deg, ${alpha(PEARL, 0)} 0%, ${alpha(PEARL, 0.55)} 50%, ${alpha(PEARL, 0)} 100%)`,
								mixBlendMode: "screen",
								opacity: core.flare.hi,
								animation: anim(
									"pws-pulse",
									core.flare.duration,
									"ease-in-out",
									core.flare.delay,
								),
								"--lo": core.flare.lo,
								"--hi": core.flare.hi,
								"--breath": core.flare.depth,
							} as Vars
						}
					/>
					<div
						className="absolute"
						style={
							{
								top: `-${core.flare.tall}%`,
								bottom: `-${core.flare.tall}%`,
								left: "50%",
								width: "2%",
								marginLeft: "-1%",
								background: `linear-gradient(180deg, ${alpha(GOLD, 0)} 0%, ${alpha(GOLD, 0.42)} 50%, ${alpha(GOLD, 0)} 100%)`,
								mixBlendMode: "screen",
								opacity: core.flare.hi,
								animation: anim(
									"pws-pulse",
									core.flare.duration,
									"ease-in-out",
									core.flare.delay + 1.3,
								),
								"--lo": core.flare.lo,
								"--hi": core.flare.hi,
								"--breath": core.flare.depth,
							} as Vars
						}
					/>
					<svg
						viewBox="0 0 120 120"
						className="absolute inset-0 size-full"
						aria-hidden="true"
					>
						{core.rings.map((ring, index) => (
							<polygon
								key={index}
								points={ring.points}
								fill={ring.fill}
								stroke={ring.stroke}
								strokeWidth={ring.width}
								strokeLinejoin="round"
								style={
									{
										transformBox: "view-box",
										transformOrigin: "60px 60px",
										transform: `rotate(${ring.tilt}deg)`,
										animation: anim(
											"pws-turn",
											ring.spin,
											"linear",
											ring.delay,
										),
										"--tilt": `${ring.tilt}deg`,
										"--dir": ring.dir,
									} as Vars
								}
							/>
						))}
						<polygon
							points={HEART}
							fill={alpha(GOLD, 0.9)}
							style={
								{
									transformBox: "view-box",
									transformOrigin: "60px 60px",
									transform: "scale(1)",
									opacity: core.heart.hi,
									animation: anim(
										"pws-pulse",
										core.heart.duration,
										"ease-in-out",
										core.heart.delay,
									),
									"--lo": core.heart.lo,
									"--hi": core.heart.hi,
									"--breath": core.heart.depth,
								} as Vars
							}
						/>
					</svg>
				</div>

				{/* Редкие искры: каждая вспыхивает в своё время */}
				{variant.sparks.map((spark, index) => (
					<span
						key={index}
						className="absolute"
						style={{
							left: `${spark.x}%`,
							top: `${spark.y}%`,
							width: spark.size,
							height: spark.size,
							marginLeft: -spark.size / 2,
							marginTop: -spark.size / 2,
							transform: `rotate(${spark.rot}deg)`,
						}}
					>
						{/* Мигание — на обёртке: фильтр свечения растеризуется один раз,
						    а compositor лишь масштабирует готовый слой (иначе перерисовка каждый кадр) */}
						<div
							className="size-full"
							style={
								{
									opacity: spark.hi,
									animation: anim(
										"pws-twinkle",
										spark.duration,
										"ease-in-out",
										spark.delay,
									),
									"--lo": spark.lo,
									"--hi": spark.hi,
								} as Vars
							}
						>
							<svg
								viewBox="0 0 48 48"
								className="size-full overflow-visible"
								aria-hidden="true"
								style={{
									filter: `drop-shadow(0 0 ${Math.round(spark.size / 3)}px ${alpha(spark.color, 0.6)})`,
								}}
							>
								<path d={SPARK_STAR} fill={spark.color} />
							</svg>
						</div>
					</span>
				))}

				{/* Световая волна, изредка проходящая по композиции */}
				<div
					className="absolute"
					style={
						{
							left: "-30%",
							top: "32%",
							width: "160%",
							height: "30%",
							background: `linear-gradient(96deg, ${alpha(PEARL, 0)} 10%, ${alpha(PEARL, 0.16)} 38%, ${alpha(GOLD, 0.14)} 52%, ${alpha(FUCHSIA, 0.1)} 60%, ${alpha(PEARL, 0)} 90%)`,
							mixBlendMode: "screen",
							opacity: sweep.staticOpacity,
							transform: `translate3d(0, 0, 0) rotate(${sweep.rotate}deg)`,
							animation: anim(
								"pws-sweep",
								sweep.duration,
								"cubic-bezier(0.45, 0.05, 0.55, 0.95)",
								sweep.delay,
							),
							"--rot": `${sweep.rotate}deg`,
							"--hi": sweep.hi,
						} as Vars
					}
				/>
			</div>
		</div>
	);
}
