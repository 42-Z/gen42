// src/components/sheet/doodles/Pug.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Мопс-король. Построен по собакам Duolingo: голова и тело — прямоугольники с
 * малым скруглением одного цвета шерсти, уши — плоские скруглённые лоскуты более
 * тёмного тона, глаза — белые круги с тёмным зрачком и «сонным» веком, нос —
 * тёмная «таблетка», язык из-под морды плоским верхом, рта-линии нет.
 */
export function Pug() {
	return (
		<>
			<Shadow x={40} w={90} />
			<g className="d-pop">
				{/* тело: блок шерсти, окорок темнее */}
				<rect x="54" y="58" width="62" height="34" rx="12" className="f-l" />
				<rect x="54" y="66" width="22" height="26" rx="12" className="t-d" />

				<g className="d-head">
					{/* уши — лоскуты, висят от верхних углов головы */}
					<g className="d-ear-l">
						<rect
							x="35"
							y="21"
							width="18"
							height="35"
							rx="6"
							transform="rotate(16 44 23)"
							className="f-1"
						/>
					</g>
					<g className="d-ear-r">
						<rect
							x="117"
							y="21"
							width="18"
							height="35"
							rx="6"
							transform="rotate(-16 126 23)"
							className="f-1"
						/>
					</g>
					<rect x="42" y="18" width="86" height="50" rx="11" className="f-l" />
					{/* язык выглядывает из-под морды плоским верхом */}
					<path d="M79 62 h12 v6 a6 6 0 0 1 -12 0 z" className="f-5 d-tongue" />
					<rect x="65" y="43" width="40" height="23" rx="9" className="f-1" />
					<rect x="77" y="45" width="16" height="9" rx="4.5" className="f-n" />
					<EyeDot cx={61} cy={32} r={10.5} look={[0.2, 0.6]} lid="f-l" />
					<EyeDot cx={109} cy={32} r={10.5} look={[-0.2, 0.6]} lid="f-l" />

					{/* корона: три скруглённых треугольника-зубца на ленте */}
					<g className="d-crown">
						<path
							d="M66 12 L69 5 L77 12 Z M78 12 L85 3 L92 12 Z M93 12 L101 5 L104 12 Z"
							strokeWidth="8"
							strokeLinejoin="round"
							className="f-5 s-5"
						/>
						<rect x="62" y="11" width="46" height="9" rx="4" className="f-4" />
					</g>
				</g>
			</g>
		</>
	);
}
