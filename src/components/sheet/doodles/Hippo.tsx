// src/components/sheet/doodles/Hippo.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Бегемот на самокате. Правила те же, что у мопса: блоки с малым скруглением,
 * глаза — белые круги с тёмным зрачком без блика, линий нет, украшений нет.
 */
export function Hippo() {
	return (
		<g className="d-ride">
			<Shadow x={18} w={140} />
			{/* колёса: ступица с двумя спицами, крутятся */}
			<g className="d-wheel">
				<circle cx="30" cy="83" r="9" className="f-2" />
				<rect x="28.5" y="75" width="3" height="16" rx="1.5" className="f-l" />
				<rect x="22" y="81.5" width="16" height="3" rx="1.5" className="f-l" />
			</g>
			<g className="d-wheel">
				<circle cx="146" cy="83" r="9" className="f-2" />
				<rect x="144.5" y="75" width="3" height="16" rx="1.5" className="f-l" />
				<rect x="138" y="81.5" width="16" height="3" rx="1.5" className="f-l" />
			</g>
			<rect x="22" y="72" width="130" height="8" rx="4" className="f-0" />
			<rect x="140" y="34" width="8" height="46" rx="4" className="f-1" />
			<rect x="132" y="32" width="26" height="8" rx="4" className="f-1" />

			<g className="d-hop">
				{/* тело: блок, светлое брюшко, ноги, рука на руле */}
				<rect x="40" y="36" width="66" height="40" rx="14" className="f-3" />
				<rect x="50" y="50" width="40" height="26" rx="10" className="t-l" />
				<rect x="48" y="66" width="19" height="13" rx="6.5" className="f-2" />
				<rect x="72" y="66" width="19" height="13" rx="6.5" className="f-2" />
				<g className="d-arm">
					<rect
						x="96"
						y="46"
						width="38"
						height="12"
						rx="6"
						transform="rotate(-16 102 52)"
						className="f-2"
					/>
				</g>

				<g className="d-head">
					<g className="d-ear-l">
						<rect x="84" y="10" width="13" height="16" rx="5" className="f-3" />
						<rect x="87" y="14" width="7" height="9" rx="3" className="f-4" />
					</g>
					<g className="d-ear-r">
						<rect x="112" y="8" width="13" height="16" rx="5" className="f-3" />
						<rect x="115" y="12" width="7" height="9" rx="3" className="f-4" />
					</g>
					<rect x="80" y="20" width="50" height="38" rx="12" className="f-3" />
					<rect x="98" y="38" width="37" height="25" rx="10" className="f-l" />
					<rect x="113" y="44" width="5" height="8" rx="2.5" className="f-n" />
					<rect x="124" y="44" width="5" height="8" rx="2.5" className="f-n" />
					<EyeDot cx={94.5} cy={31} r={8.5} look={[0.35, 0.3]} />
					<EyeDot cx={114} cy={30} r={8.5} look={[0.35, 0.3]} />
				</g>
			</g>
		</g>
	);
}
