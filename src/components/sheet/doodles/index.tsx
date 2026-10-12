// src/components/sheet/doodles/index.tsx
import type { DoodleKind } from "@/lib/sheet/doodles";
import { Giraffe } from "./Giraffe";
import { Hippo } from "./Hippo";
import { Mellsher } from "./Mellsher";
import { Pig } from "./Pig";
import { Pug } from "./Pug";
import { Pyatyorka } from "./Pyatyorka";

const ART: Record<DoodleKind, () => React.JSX.Element> = {
	pug: Pug,
	hippo: Hippo,
	giraffe: Giraffe,
	pig: Pig,
	pyatyorka: Pyatyorka,
	mellsher: Mellsher,
};

/** Рисунок одного дудла в рамке 170 × 100; движение — `src/doodles.css` по `dk-<вид>` */
export function Doodle({ kind }: { kind: DoodleKind }) {
	const Art = ART[kind];
	return (
		<svg
			className={`doodle dk-${kind}`}
			viewBox="0 0 170 100"
			aria-hidden="true"
			focusable="false"
		>
			<Art />
		</svg>
	);
}
