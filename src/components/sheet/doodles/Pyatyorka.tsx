// src/components/sheet/doodles/Pyatyorka.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Пятёрка в образе со SLAY 2025: смокинг пополам (слева чёрный с чёрным крылом,
 * справа белый с белым), причёска пополам, шипастые «венки» на висках, серебряный
 * наплечник на чёрном плече.
 *
 * Образцы Duolingo: крепыши с листа «Building character» (короб-торс в 2,4 раза
 * шире головы, шеи нет, ног почти нет, ботинки-пеньки) и Oscar (голова без шеи,
 * туфли-таблетки парят под телом, тяжёлые веки), Lin (причёска пополам: чёрная
 * плита слева, бритая половина справа; брови-блоки), Junior (голова —
 * скруглённый прямоугольник шире высоты, лицо без контуров). Коренастость фото:
 * широкие плечи, голова крупная и широкая, шеи нет, ноги короткие.
 * Пропорции (H = 85 от макушки до подошв): голова с волосами 0,46 H; лицо
 * 44 x 36 (ширина к высоте 1,22); плечи 71 = 1,6 ширины лица (0,84 H); ноги
 * 0,09 H и туфли 0,08 H; крыло 0,66 H длиной.
 *
 * Цвет: «чёрное» — самые глубокие читаемые тона листа (d-0, d-1, d-2), не d-n
 * (с фоном шапки он сливается), «белое» — f-w и f-l; d-n только внутри светлых
 * областей. Полушки костюма — отдельные фигуры без подложки.
 */

/**
 * Шипастый диск: n острых лучей наружного радиуса ro над телом радиуса ri
 * (серебряный наплечник)
 */
function spikyDisc(cx: number, cy: number, ro: number, ri: number, n: number) {
	const pts: string[] = [];
	for (let k = 0; k < n * 2; k++) {
		const ang = (Math.PI * k) / n - Math.PI / 2;
		const r = k % 2 === 0 ? ro : ri;
		pts.push(
			`${(cx + r * Math.cos(ang)).toFixed(1)} ${(cy + r * Math.sin(ang)).toFixed(1)}`,
		);
	}
	return `M${pts.join(" L")} Z`;
}

/** Перо крыла: сужающийся клинок с круглым основанием в точке (px, py), под углом a над горизонтом */
function Feather({
	px,
	py,
	a,
	len,
	w,
	side,
	className,
}: {
	px: number;
	py: number;
	a: number;
	len: number;
	w: number;
	side: "l" | "r";
	className: string;
}) {
	const deg = side === "l" ? 180 + a : -a;
	const r = w / 2;
	const t = 4.6;
	const tip = len - t;
	return (
		<path
			d={`M0 ${-r} L${tip} ${-t} A${t} ${t} 0 0 1 ${tip} ${t} L0 ${r} A${r} ${r} 0 0 1 0 ${-r} Z`}
			transform={`translate(${px} ${py}) rotate(${deg})`}
			className={className}
		/>
	);
}

/**
 * Перья крыла: веер от плеча, сверху вниз; верхнее не доходит до головы. У
 * каждого пера свой оттенок листа для чёрного (`dark`) и белого (`light`)
 * крыла, чтобы перья читались отдельно; все оттенки читаются на фоне шапки
 * (контраст не ниже 3:1), поэтому тёмного тона поверх чёрного нет. Перья рядом
 * с головой и рукавом не того же цвета, что кожа и пиджак, иначе крыло
 * сливается с ними.
 */
const FEATHERS = [
	{ a: 68, len: 48, w: 18, dark: "f-0", light: "f-w" },
	{ a: 52, len: 54, w: 18, dark: "f-1", light: "f-l" },
	{ a: 36, len: 56, w: 18, dark: "f-0", light: "f-w" },
	{ a: 21, len: 51, w: 18, dark: "f-1", light: "f-l" },
	{ a: 6, len: 40, w: 18, dark: "f-0", light: "f-l" },
] as const;

/** Крыло из пяти перьев с общим основанием в плече (px, py) */
function Wing({ px, py, side }: { px: number; py: number; side: "l" | "r" }) {
	return (
		<>
			{FEATHERS.map(({ dark, light, ...f }) => (
				<Feather
					key={f.a}
					px={px}
					py={py}
					side={side}
					className={side === "l" ? dark : light}
					{...f}
				/>
			))}
		</>
	);
}

export function Pyatyorka() {
	return (
		<>
			<Shadow x={46} w={78} y={89} />
			<g className="d-pop">
				{/* крылья за спиной: слева чёрное, справа белое */}
				<g className="d-wing-l">
					<Wing px={56} py={50} side="l" />
				</g>
				<g className="d-wing-r">
					<Wing px={114} py={50} side="r" />
				</g>

				{/* ноги короткие и широко, туфли-таблетки парят под ними */}
				<rect x="62" y="72" width="15" height="14" rx="5" className="f-1" />
				<rect x="93" y="72" width="15" height="14" rx="5" className="f-w" />
				<rect
					x="57"
					y="86.5"
					width="22"
					height="6.5"
					rx="3.25"
					className="f-0"
				/>
				<rect
					x="91"
					y="86.5"
					width="22"
					height="6.5"
					rx="3.25"
					className="f-l"
				/>

				{/* руки в стороны: рукава-таблетки от плеч, кисти-капли */}
				<g className="d-arm-l">
					<path
						d="M56 51 L40 72"
						strokeWidth="13"
						strokeLinecap="round"
						fill="none"
						className="s-1"
					/>
					<circle cx="38.5" cy="74" r="6.5" className="f-l" />
				</g>
				<g className="d-arm-r">
					<path
						d="M114 51 L130 72"
						strokeWidth="13"
						strokeLinecap="round"
						fill="none"
						className="s-w"
					/>
					<circle cx="131.5" cy="74" r="6.5" className="f-l" />
				</g>

				{/* смокинг пополам: две отдельные полушки, внутренний край — центр груди */}
				<path
					d="M85.6 45 H62 C54 45 49.5 50 49.5 57 C49.5 64 51 70 53.5 75 Q55 78 60 78 H85.6 Z"
					className="f-1"
				/>
				<path
					d="M85 45 H108 C116 45 120.5 50 120.5 57 C120.5 64 119 70 116.5 75 Q115 78 110 78 H85 Z"
					className="f-w"
				/>
				{/* рубашка: чёрная слева (темнее пиджака), белая справа, пуговицы */}
				<rect x="79" y="46" width="6.6" height="21" className="t-d" />
				<rect x="85" y="46" width="7" height="21" className="f-l" />
				<circle cx="88.5" cy="53" r="1.7" className="f-n" />
				<circle cx="88.5" cy="60" r="1.7" className="f-n" />

				{/* серебряный наплечник с шипами на чёрном плече */}
				<path
					d={spikyDisc(52, 49, 8.5, 5.6, 7)}
					strokeWidth="2"
					strokeLinejoin="round"
					className="f-w s-w"
				/>

				<g className="d-head">
					{/* уши — круги на уровне глаз */}
					<circle cx="63" cy="31" r="4.3" className="f-l" />
					<circle cx="107" cy="31" r="4.3" className="f-l" />
					{/* голова: широкий блок, нижние углы полнее (щёки) */}
					<path
						d="M73 11 H97 A10 10 0 0 1 107 21 V35 A12 12 0 0 1 95 47 H75 A12 12 0 0 1 63 35 V21 A10 10 0 0 1 73 11 Z"
						className="f-l"
					/>
					{/* глаза под верхним веком: прищур исподлобья (веко рисуется до бровей и волос) */}
					<EyeDot
						cx={74}
						cy={30}
						r={4.8}
						look={[0.3, 0.8]}
						lid="f-l"
						lidH={0.8}
					/>
					<EyeDot
						cx={96}
						cy={30}
						r={4.8}
						look={[-0.3, 0.8]}
						lid="f-l"
						lidH={0.8}
					/>
					{/* причёска пополам: слева чёрная плита, справа бритая половина */}
					<path
						d="M85 8 H72 C65.5 8 61.5 12.5 61.5 18 V20 Q61.5 21.5 63 21.5 H85 Z"
						className="f-2"
					/>
					<path
						d="M85 11 H97 A10 10 0 0 1 107 21 V21.5 H85 Z"
						className="t-d"
					/>
					{/* шипастые венки на висках: зубчатые полосы, лежат на боку головы */}
					<path
						d="M48 19 L51 12 L54 17 L58 11 L61 17 L65 12 L67 19 L65 26 L61 21 L58 27 L54 21 L51 26 Z"
						transform="rotate(-10 57.5 19)"
						strokeWidth="1.6"
						strokeLinejoin="round"
						className="f-w s-w"
					/>
					<path
						d="M122 19 L119 12 L116 17 L112 11 L109 17 L105 12 L103 19 L105 26 L109 21 L112 27 L116 21 L119 26 Z"
						transform="rotate(10 112.5 19)"
						strokeWidth="1.6"
						strokeLinejoin="round"
						className="f-w s-w"
					/>
					{/* брови-блоки исподлобья, нос-таблетка, ухмылка набок */}
					<rect
						x="67"
						y="23"
						width="12"
						height="4"
						rx="2"
						transform="rotate(12 73 25)"
						className="f-n"
					/>
					<rect
						x="91"
						y="22"
						width="12"
						height="4"
						rx="2"
						transform="rotate(-12 97 24)"
						className="f-n"
					/>
					<rect
						x="82.5"
						y="32"
						width="5"
						height="6.5"
						rx="2.5"
						className="t-d"
					/>
					<path
						d="M78 41 Q85 44.5 93 38"
						strokeWidth="2.8"
						strokeLinecap="round"
						fill="none"
						className="s-n"
					/>
				</g>
			</g>
		</>
	);
}
