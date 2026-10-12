// src/components/sheet/doodles/Pig.tsx
import { Digits42, EyeDot, Shadow } from "./parts";

/**
 * Свин в джерси с крупным 42, ест попкорн. Блоки с малым скруглением, глаза —
 * белые круги с тёмным зрачком без блика (взгляд на ведёрко), уши — скруглённые
 * треугольники более тёмного тона.
 */
export function Pig() {
	return (
		<>
			<Shadow x={34} w={104} />
			<g className="d-pop">
				{/* тело-джерси с номером и ноги */}
				<rect x="50" y="48" width="70" height="46" rx="14" className="f-1" />
				<rect x="56" y="84" width="20" height="11" rx="5.5" className="f-4" />
				<rect x="94" y="84" width="20" height="11" rx="5.5" className="f-4" />
				<Digits42 x={69.5} y={66} s={0.33} className="s-w" weight={11} />

				<g className="d-head">
					{/* уши — скруглённые треугольники */}
					<g className="d-ear-l">
						<path
							d="M52 22 L56 3 L74 14 Z"
							strokeWidth="7"
							strokeLinejoin="round"
							className="f-4 s-4"
						/>
					</g>
					<g className="d-ear-r">
						<path
							d="M118 22 L114 3 L96 14 Z"
							strokeWidth="7"
							strokeLinejoin="round"
							className="f-4 s-4"
						/>
					</g>
					<rect x="44" y="8" width="82" height="56" rx="14" className="f-5" />
					<g className="d-snout">
						<rect x="65" y="36" width="40" height="25" rx="9" className="f-4" />
						<rect x="74" y="43" width="6" height="11" rx="3" className="f-n" />
						<rect x="90" y="43" width="6" height="11" rx="3" className="f-n" />
					</g>
					<EyeDot cx={62} cy={29} r={9.5} look={[0.6, 0.45]} />
					<EyeDot cx={108} cy={29} r={9.5} look={[0.6, 0.45]} />
				</g>

				{/* ведёрко попкорна справа; рука носит зёрна ко рту */}
				<g className="d-corn">
					<circle cx="119" cy="62" r="6" className="f-l" />
					<circle cx="131" cy="58" r="6.5" className="f-w" />
					<circle cx="142" cy="63" r="6" className="f-l" />
					<circle cx="126" cy="52" r="5.5" className="f-w" />
				</g>
				<rect x="113" y="64" width="38" height="8" rx="4" className="f-w" />
				<rect x="116" y="70" width="32" height="24" rx="8" className="f-w" />
				<rect x="122" y="72" width="6" height="20" rx="3" className="f-4" />
				<rect x="136" y="72" width="6" height="20" rx="3" className="f-4" />
				<g className="d-arm">
					<rect
						x="102"
						y="70"
						width="28"
						height="11"
						rx="5.5"
						className="f-1"
					/>
					<circle cx="129" cy="75.5" r="5.5" className="f-w" />
				</g>
			</g>
		</>
	);
}
