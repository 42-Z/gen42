// src/components/sheet/doodles/Hippo.tsx
import { Eye, Pendant, Shadow } from "./parts";

/** Бегемот на самокате: подпрыгивает, цепь с кулоном 42 раскачивается */
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
				{/* тело, ноги, рука на руле */}
				<rect x="40" y="36" width="66" height="40" rx="22" className="f-3" />
				<rect x="50" y="50" width="40" height="26" rx="13" className="t-l" />
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
						<rect
							x="84"
							y="10"
							width="13"
							height="16"
							rx="6.5"
							className="f-3"
						/>
						<rect x="87" y="14" width="7" height="9" rx="3.5" className="f-4" />
					</g>
					<g className="d-ear-r">
						<rect
							x="112"
							y="8"
							width="13"
							height="16"
							rx="6.5"
							className="f-3"
						/>
						<rect
							x="115"
							y="12"
							width="7"
							height="9"
							rx="3.5"
							className="f-4"
						/>
					</g>
					<rect x="80" y="20" width="50" height="38" rx="19" className="f-3" />
					<rect
						x="98"
						y="38"
						width="37"
						height="25"
						rx="12.5"
						className="f-l"
					/>
					<circle cx="118" cy="47" r="2.7" className="f-n" />
					<circle cx="127" cy="47" r="2.7" className="f-n" />
					<path
						d="M105 56 Q119 64 131 56"
						fill="none"
						strokeWidth="3"
						strokeLinecap="round"
						className="s-n"
					/>
					<Eye x={86} y={22} w={17} h={21} look={[0.6, 0.72]} />
					<Eye x={106} y={21} w={17} h={20} look={[0.6, 0.72]} />
				</g>

				<path
					d="M84 58 Q95 72 107 58"
					fill="none"
					strokeWidth="4"
					strokeLinecap="round"
					className="s-w"
				/>
				<Pendant cx={95.5} top={64} w={26} />
			</g>
		</g>
	);
}
