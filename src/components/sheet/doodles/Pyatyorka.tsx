// src/components/sheet/doodles/Pyatyorka.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Пятёрка в образе со SLAY: костюм пополам (слева тёмный с тёмным крылом, справа
 * белый с белым крылом), причёска пополам (слева тёмные волосы, справа бритая
 * половина), серебристые шипы на висках. Построен по подписанным фото из
 * публикаций о SLAY; человек — блоки с малым скруглением, как люди Duolingo.
 */
export function Pyatyorka() {
	return (
		<>
			<Shadow x={46} w={78} y={89} />
			<g className="d-pop">
				{/* крылья за спиной: слева тёмное, справа белое */}
				<g className="d-wing-l">
					<path
						d="M62 66 C44 62 24 44 8 12 C30 18 48 26 62 47 Z"
						className="f-n"
					/>
				</g>
				<g className="d-wing-r">
					<path
						d="M108 66 C126 62 146 44 162 12 C140 18 122 26 108 47 Z"
						className="f-w"
					/>
				</g>

				{/* ноги и обувь: левая тёмная, правая белая */}
				<rect x="68" y="68" width="13" height="17" rx="5" className="f-n" />
				<rect x="89" y="68" width="13" height="17" rx="5" className="f-w" />
				<rect x="65" y="83" width="19" height="8" rx="4" className="f-1" />
				<rect x="86" y="83" width="19" height="8" rx="4" className="f-l" />

				{/* туловище пополам и руки */}
				<rect x="62" y="45" width="46" height="26" rx="10" className="f-w" />
				<path
					d="M73 45 H85 V71 H73 a11 11 0 0 1 -11 -11 V56 a11 11 0 0 1 11 -11 Z"
					className="f-n"
				/>
				<rect x="53" y="48" width="9" height="24" rx="4.5" className="f-n" />
				<rect x="108" y="48" width="9" height="24" rx="4.5" className="f-w" />
				<circle cx="57.5" cy="74" r="4.6" className="f-l" />
				<circle cx="112.5" cy="74" r="4.6" className="f-l" />

				<g className="d-head">
					<circle cx="63.5" cy="27" r="4.6" className="f-l" />
					<circle cx="106.5" cy="27" r="4.6" className="f-l" />
					<rect x="64" y="7" width="42" height="38" rx="11" className="f-l" />
					{/* причёска пополам: слева волосы, справа бритая половина */}
					<path
						d="M75 5 H85 V19 H64 V16 a11 11 0 0 1 11 -11 Z"
						className="f-n"
					/>
					<rect x="85" y="8" width="21" height="10" rx="5" className="t-d" />
					{/* серебристые шипы на висках */}
					<path
						d="M59 19 L60 11 L66 16 Z"
						strokeWidth="3"
						strokeLinejoin="round"
						className="f-w s-w"
					/>
					<path
						d="M111 19 L110 11 L104 16 Z"
						strokeWidth="3"
						strokeLinejoin="round"
						className="f-w s-w"
					/>
					{/* лицо: брови с хитрецой, «сонные» веки, нос, усмешка */}
					<rect
						x="69"
						y="15.5"
						width="11"
						height="3.6"
						rx="1.8"
						transform="rotate(8 74.5 17)"
						className="f-n"
					/>
					<rect
						x="90"
						y="15.5"
						width="11"
						height="3.6"
						rx="1.8"
						transform="rotate(-8 95.5 17)"
						className="f-n"
					/>
					<EyeDot
						cx={75}
						cy={25}
						r={5.4}
						look={[0.2, 0.5]}
						lid="f-l"
						lidH={0.5}
					/>
					<EyeDot
						cx={95}
						cy={25}
						r={5.4}
						look={[-0.2, 0.5]}
						lid="f-l"
						lidH={0.5}
					/>
					<rect x="82" y="28" width="6" height="7" rx="3" className="t-d" />
					<rect
						x="78"
						y="38"
						width="15"
						height="3.6"
						rx="1.8"
						transform="rotate(-6 85.5 40)"
						className="f-n"
					/>
				</g>
			</g>
		</>
	);
}
