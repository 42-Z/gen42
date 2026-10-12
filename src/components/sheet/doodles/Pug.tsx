// src/components/sheet/doodles/Pug.tsx
import { Eye, Pendant, Shadow } from "./parts";

/** Мопс-король: корона, цепь с кулоном 42, высунутый язык */
export function Pug() {
	return (
		<>
			<Shadow />
			<g className="d-pop">
				{/* тело и лапы */}
				<rect x="58" y="58" width="54" height="34" rx="17" className="f-l" />
				<rect x="60" y="80" width="19" height="12" rx="6" className="f-l" />
				<rect x="91" y="80" width="19" height="12" rx="6" className="f-l" />

				<g className="d-head">
					{/* уши */}
					<g className="d-ear-l">
						<rect
							x="40"
							y="26"
							width="22"
							height="38"
							rx="11"
							transform="rotate(14 51 36)"
							className="f-1"
						/>
					</g>
					<g className="d-ear-r">
						<rect
							x="108"
							y="26"
							width="22"
							height="38"
							rx="11"
							transform="rotate(-14 119 36)"
							className="f-1"
						/>
					</g>
					{/* голова и морда */}
					<rect x="46" y="16" width="78" height="62" rx="31" className="f-l" />
					<rect x="63" y="46" width="44" height="30" rx="15" className="f-n" />
					<rect x="76" y="48" width="18" height="11" rx="5.5" className="f-0" />
					{/* язык под линией рта */}
					<rect
						x="81"
						y="62"
						width="9"
						height="12"
						rx="4.5"
						className="f-5 d-tongue"
					/>
					<path
						d="M75 62 Q85.5 71 96 62"
						fill="none"
						strokeWidth="3.2"
						strokeLinecap="round"
						className="s-l"
					/>
					<Eye x={55} y={28} w={21} h={25} look={[0.55, 0.72]} />
					<Eye x={94} y={28} w={21} h={25} look={[0.45, 0.72]} />
					{/* корона */}
					<g className="d-crown">
						<path
							d="M64 14 L66 3 L77 10 L85 0 L93 10 L104 3 L106 14 Z"
							strokeWidth="4"
							strokeLinejoin="round"
							className="f-5 s-5"
						/>
						<rect x="63" y="11" width="44" height="8" rx="4" className="f-4" />
					</g>
				</g>

				{/* цепь и кулон поверх тела */}
				<path
					d="M63 66 Q85.5 86 108 66"
					fill="none"
					strokeWidth="4"
					strokeLinecap="round"
					className="s-w"
				/>
				<Pendant cx={85.5} top={76} w={32} />
			</g>
		</>
	);
}
