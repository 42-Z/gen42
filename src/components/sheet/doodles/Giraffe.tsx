// src/components/sheet/doodles/Giraffe.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Жираф: шея вытягивается и ныряет вниз. Глаза со «сонным» веком, как у кошки
 * Duolingo, пятна и брюшко — второй тон шерсти, украшений нет.
 */
export function Giraffe() {
	return (
		<>
			<Shadow x={36} w={100} />
			<g className="d-pop">
				{/* хвост */}
				<g className="d-tail">
					<rect
						x="34"
						y="58"
						width="22"
						height="7"
						rx="3.5"
						transform="rotate(-28 56 62)"
						className="f-4"
					/>
					<circle cx="37" cy="52" r="4.5" className="f-3" />
				</g>
				{/* ноги и тело */}
				<rect x="54" y="74" width="10" height="18" rx="5" className="f-4" />
				<rect x="68" y="74" width="10" height="18" rx="5" className="f-4" />
				<rect x="96" y="74" width="10" height="18" rx="5" className="f-4" />
				<rect x="110" y="74" width="10" height="18" rx="5" className="f-4" />
				<rect x="48" y="54" width="78" height="30" rx="11" className="f-5" />
				<rect x="56" y="72" width="62" height="12" rx="6" className="t-l" />
				<circle cx="62" cy="64" r="5" className="t-d" />
				<circle cx="82" cy="62" r="4" className="t-d" />
				<circle cx="94" cy="66" r="3.5" className="t-d" />

				{/* шея растёт от основания; голова едет на её верхушке */}
				<g className="d-neck">
					<rect x="104" y="24" width="20" height="46" rx="7" className="f-5" />
					<circle cx="114" cy="40" r="4.5" className="t-d" />
					<circle cx="112" cy="55" r="3.5" className="t-d" />
				</g>
				<g className="d-gh">
					<g className="d-head">
						<rect x="106" y="2" width="6" height="12" rx="3" className="f-4" />
						<circle cx="109" cy="3" r="4.5" className="f-3" />
						<rect x="124" y="2" width="6" height="12" rx="3" className="f-4" />
						<circle cx="127" cy="3" r="4.5" className="f-3" />
						<rect x="98" y="8" width="50" height="27" rx="9" className="f-5" />
						<rect x="139" y="21" width="4" height="6" rx="2" className="f-n" />
						<EyeDot
							cx={114}
							cy={20}
							r={7.5}
							look={[0.2, 0.4]}
							lid="f-5"
							lidH={0.4}
						/>
						<EyeDot
							cx={131}
							cy={20}
							r={7.5}
							look={[0.2, 0.4]}
							lid="f-5"
							lidH={0.4}
						/>
					</g>
				</g>
			</g>
		</>
	);
}
