// src/components/sheet/doodles/Mellsher.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Меллшер: тёмные кудри, густые брови, щетина, розовая футболка, микрофон в
 * поднятой руке. Построен по подписанным фото из его публичных каналов; человек —
 * блоки с малым скруглением, как люди Duolingo.
 */
export function Mellsher() {
	return (
		<>
			<Shadow x={46} w={78} y={89} />
			<g className="d-pop">
				{/* ноги и кроссовки */}
				<rect x="68" y="68" width="13" height="17" rx="5" className="f-0" />
				<rect x="89" y="68" width="13" height="17" rx="5" className="f-0" />
				<rect x="65" y="83" width="19" height="8" rx="4" className="f-w" />
				<rect x="86" y="83" width="19" height="8" rx="4" className="f-w" />

				{/* туловище, левая рука вниз */}
				<rect x="62" y="45" width="46" height="26" rx="10" className="f-5" />
				<rect x="53" y="48" width="9" height="24" rx="4.5" className="f-5" />
				<circle cx="57.5" cy="74" r="4.6" className="f-l" />

				{/* правая рука поднята с микрофоном */}
				<g className="d-arm-up">
					<rect
						x="108"
						y="26"
						width="9"
						height="26"
						rx="4.5"
						transform="rotate(12 112.5 50)"
						className="f-5"
					/>
					<circle cx="116" cy="24" r="4.6" className="f-l" />
					<rect
						x="113.5"
						y="8"
						width="5"
						height="14"
						rx="2.5"
						className="f-n"
					/>
					<circle cx="116" cy="7" r="4.6" className="f-w" />
				</g>

				<g className="d-head">
					<circle cx="63.5" cy="27" r="4.6" className="f-l" />
					<circle cx="106.5" cy="27" r="4.6" className="f-l" />
					<rect x="64" y="7" width="42" height="38" rx="11" className="f-l" />
					{/* кудри: шапка из кругов */}
					<g className="d-hair">
						<rect x="64" y="5" width="42" height="12" rx="6" className="f-n" />
						<circle cx="70" cy="9" r="7" className="f-n" />
						<circle cx="79" cy="5.5" r="7" className="f-n" />
						<circle cx="91" cy="5.5" r="7" className="f-n" />
						<circle cx="100" cy="9" r="7" className="f-n" />
						<circle cx="65" cy="17" r="5" className="f-n" />
						<circle cx="105" cy="17" r="5" className="f-n" />
					</g>
					{/* лицо: густые брови, глаза, нос, улыбка с зубами, усы и бородка */}
					<rect
						x="68"
						y="16"
						width="13"
						height="4.4"
						rx="2.2"
						transform="rotate(3 74.5 18)"
						className="f-n"
					/>
					<rect
						x="89"
						y="16"
						width="13"
						height="4.4"
						rx="2.2"
						transform="rotate(-3 95.5 18)"
						className="f-n"
					/>
					<EyeDot cx={75} cy={26} r={5.4} look={[0.1, 0.35]} />
					<EyeDot cx={95} cy={26} r={5.4} look={[-0.1, 0.35]} />
					<rect x="82" y="29" width="6" height="7" rx="3" className="t-d" />
					<path d="M78 38.5 h14 a7 5 0 0 1 -14 0 z" className="f-n" />
					<rect
						x="79.5"
						y="38.5"
						width="11"
						height="2.4"
						rx="1.2"
						className="f-w"
					/>
					<rect
						x="75"
						y="34.6"
						width="20"
						height="3.6"
						rx="1.8"
						className="f-n"
					/>
					<rect x="81" y="44" width="8" height="3.4" rx="1.7" className="f-n" />
				</g>
			</g>
		</>
	);
}
