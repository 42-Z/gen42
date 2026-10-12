// src/components/sheet/doodles/Mellsher.tsx
import { EyeDot, Shadow } from "./parts";

/**
 * Меллшер: стройный, с шеей и ногами, кудри одной массой, густые брови, усы и
 * бородка, розовая футболка, микрофон в поднятой руке.
 *
 * Образцы Duolingo: Lin (стройная фигура с шеей и видимыми ногами, голова на тонкой
 * шее), Bea (кудри одним облаком из трёх-четырёх крупных комьев шире лица, толстые
 * брови-штрихи), Oscar (усы и тяжёлые веки), Eddy (две ноги-таблетки и кроссовки-
 * таблетки). Пропорции в долях роста H = 89,8 (макушка до подошв, до масштаба
 * 0,95 всего рисунка): голова с кудрями 0,42 (лицо без кудрей 0,34), торс 0,31,
 * ноги до кроссовок 0,17, кроссовки 0,07; лицо 23 шириной = 0,26 H, кудри 38 =
 * 1,7 лица, плечи 29 = 1,25 лица = 0,32 H, видимая шея 0,04 H, ноги по 9. У Пятёрки
 * наоборот: лицо 0,53 H, плечи 0,71 H, шеи нет, ноги 0,11 H.
 *
 * Цвета: всё, что видно на фоне шапки, берёт токены с контрастом ≥ 3:1 (f-0…f-5,
 * f-w, f-l): кудри f-0 (самый глубокий читаемый тон листа), футболка f-5, ноги
 * f-1, кроссовки и головка микрофона f-w, кожа f-l. Тёмный f-n только внутри кожи:
 * брови, усы, рот и бородка целиком лежат на лице и за его край не выходят.
 */
export function Mellsher() {
	return (
		<>
			<Shadow x={57} w={56} y={90} />
			{/* рисунок на 5 % меньше вокруг подошв: сплющивание при появлении тянет
			    макушку вверх, и кудри не должны упираться в верх шапки */}
			<g transform="translate(85 92.4) scale(0.95) translate(-85 -92.4)">
				<g className="d-pop">
					{/* ноги-таблетки и кроссовки-таблетки */}
					<rect
						x="73.5"
						y="62"
						width="9"
						height="27"
						rx="4.5"
						className="f-1"
					/>
					<rect
						x="87.5"
						y="62"
						width="9"
						height="27"
						rx="4.5"
						className="f-1"
					/>
					<rect
						x="71.4"
						y="86"
						width="12.6"
						height="6.4"
						rx="3.2"
						className="f-w"
					/>
					<rect
						x="86"
						y="86"
						width="12.6"
						height="6.4"
						rx="3.2"
						className="f-w"
					/>

					{/* шея */}
					<rect x="80.5" y="36" width="9" height="12" className="f-l" />

					{/* левая рука опущена: предплечье, кисть, рукав */}
					<path
						d="M69.4 58 L67.4 69"
						fill="none"
						strokeWidth="6"
						strokeLinecap="round"
						className="s-l"
					/>
					<circle cx="66.8" cy="71.6" r="3.7" className="f-l" />
					<path
						d="M72 50.6 L69.6 58.4"
						fill="none"
						strokeWidth="6.2"
						strokeLinecap="round"
						className="s-5"
					/>

					{/* туловище: футболка */}
					<path
						d="M70.6 53 C70.6 46.6 76.4 43.6 85 43.6 C93.6 43.6 99.4 46.6 99.4 53 L98 69 Q97.8 71 95.8 71 H74.2 Q72.2 71 72 69 Z"
						className="f-5"
					/>
					{/* вырез горловины */}
					<path d="M80.4 42.6 Q85 51 89.6 42.6 Z" className="f-l" />

					{/* правая рука: плечо, локоть, предплечье с микрофоном */}
					<path
						d="M98 50.8 L108.2 52"
						fill="none"
						strokeWidth="6.2"
						strokeLinecap="round"
						className="s-5"
					/>
					<g className="d-fore">
						<path
							d="M108.2 52 L110.2 39.4"
							fill="none"
							strokeWidth="6"
							strokeLinecap="round"
							className="s-l"
						/>
						<g transform="rotate(-12 110.2 39.4)">
							<rect
								x="108.4"
								y="27.6"
								width="3.6"
								height="12.4"
								rx="1.8"
								className="f-2"
							/>
							<circle cx="110.2" cy="26" r="4.6" className="f-w" />
							<rect
								x="107.4"
								y="30"
								width="5.6"
								height="2"
								rx="1"
								className="f-4"
							/>
						</g>
						<circle cx="110.2" cy="39.4" r="3.8" className="f-l" />
					</g>

					{/* голова */}
					<g className="d-head">
						<circle cx="73" cy="27.6" r="3.1" className="f-l" />
						<circle cx="97" cy="27.6" r="3.1" className="f-l" />
						<path
							d="M73.5 18 V29.6 C73.5 36.6 79 40.4 85 40.4 C91 40.4 96.5 36.6 96.5 29.6 V18 C96.5 13 91 10 85 10 C79 10 73.5 13 73.5 18 Z"
							className="f-l"
						/>
						{/* кудри одним облаком из крупных комьев */}
						<g className="d-hair">
							<rect
								x="69"
								y="10"
								width="32"
								height="9"
								rx="4"
								className="f-0"
							/>
							<circle cx="86" cy="11.2" r="8.6" className="f-0" />
							<circle cx="74.6" cy="13.8" r="8.2" className="f-0" />
							<circle cx="96" cy="13.2" r="8.6" className="f-0" />
							<circle cx="70.6" cy="22" r="4.2" className="f-0" />
							<circle cx="99.4" cy="22" r="4.2" className="f-0" />
						</g>
						{/* лицо: тяжёлые веки, густые брови, нос, усы, рот, бородка */}
						<EyeDot
							cx={79.6}
							cy={27.6}
							r={3.2}
							look={[0.25, 0.45]}
							lid="f-l"
							lidH={0.5}
						/>
						<EyeDot
							cx={90.4}
							cy={27.6}
							r={3.2}
							look={[-0.25, 0.45]}
							lid="f-l"
							lidH={0.5}
						/>
						<rect
							x="74.8"
							y="21.4"
							width="9.2"
							height="3.2"
							rx="1.6"
							transform="rotate(-7 79.4 23)"
							className="f-n"
						/>
						<rect
							x="86"
							y="22.2"
							width="9.2"
							height="3.2"
							rx="1.6"
							transform="rotate(2 90.6 23.8)"
							className="f-n"
						/>
						<ellipse cx="85" cy="31" rx="2.1" ry="1.9" className="t-d" />
						<path
							d="M78.6 34 C79.6 32 82.6 32.2 85 33.2 C87.4 32.2 90.4 32 91.4 34 C89.8 35.2 87.4 34.8 85 34.2 C82.6 34.8 80.2 35.2 78.6 34 Z"
							className="f-n"
						/>
						<path
							d="M82.2 35.2 H87.8 C87.6 37 86.4 37.4 85 37.4 C83.6 37.4 82.4 37 82.2 35.2 Z"
							className="f-n"
						/>
						<rect
							x="82.4"
							y="37.8"
							width="5.2"
							height="1.9"
							rx="0.95"
							className="f-n"
						/>
					</g>
				</g>
			</g>
		</>
	);
}
