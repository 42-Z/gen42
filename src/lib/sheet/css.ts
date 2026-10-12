// src/lib/sheet/css.ts
import {
	BASE,
	color,
	ERROR,
	mix,
	phase,
	type RGB,
	type Role,
	rgbString,
	STOPS,
	TEXT,
	TEXT_2,
} from "./palette";
import { type Mass, SPRINGS, springLinear } from "./springs";
import { WAVE_MAX_MS } from "./wave";

/**
 * Лист как CSS. Плитка 1600×1600 px, градиент идёт по диагонали 135° (угол
 * угол-в-угол квадрата) и содержит две палиндромные волны: цвет в точке зависит
 * только от (x + y) с периодом в сторону плитки, поэтому плитки стыкуются без
 * шва по обеим осям, а окна выравниваются со страницей смещением фона.
 */
export const TILE_PX = 1600;
export const STOPS_PER_TILE = 64;

export function gradient(role: Role): string {
	const parts: string[] = [];
	for (let i = 0; i <= STOPS_PER_TILE; i++) {
		const t = i / STOPS_PER_TILE;
		const percent = Math.round(t * 10000) / 100;
		parts.push(`${rgbString(color(role, phase(t)))} ${percent}%`);
	}
	return `linear-gradient(135deg, ${parts.join(", ")})`;
}

const MASSES: Mass[] = ["light", "medium", "heavy"];

/**
 * Плоские цвета персонажей-дудлов: те же опоры листа, без золота и жёлтого.
 * `d-0…d-5` — опоры S0…S5; `d-w` — белки глаз и цифры; `d-l` — светлый тон
 * (морда, брюхо); `d-n` — глубокий индиго (зрачки, пасть, тень).
 */
export const DOODLE_COLORS: Record<string, RGB> = {
	"d-0": STOPS.S0,
	"d-1": STOPS.S1,
	"d-2": STOPS.S2,
	"d-3": STOPS.S3,
	"d-4": STOPS.S4,
	"d-5": STOPS.S5,
	"d-w": TEXT,
	"d-l": mix(STOPS.S1, TEXT, 0.6),
	"d-n": mix(STOPS.S0, BASE, 0.8),
};

export function buildSheetCss(): string {
	const lines = [
		"/* Сгенерировано scripts/gen-sheet-css.ts из src/lib/sheet/*. Не править вручную: bun run sheet:css */",
		":root {",
		`  --sheet-tile: ${TILE_PX}px;`,
		`  --sheet-dark: ${gradient("dark")};`,
		`  --sheet-ridge: ${gradient("ridge")};`,
		`  --sheet-spectrum: ${gradient("spectrum")};`,
		`  --edge: ${rgbString(STOPS.S0)};`,
		`  --text: ${rgbString(TEXT)};`,
		`  --text-2: ${rgbString(TEXT_2)};`,
		`  --error: ${rgbString(ERROR)};`,
		`  --wave-max: ${WAVE_MAX_MS}ms;`,
	];
	for (const [name, rgb] of Object.entries(DOODLE_COLORS)) {
		lines.push(`  --${name}: ${rgbString(rgb)};`);
	}
	for (const mass of MASSES) {
		lines.push(`  --spring-${mass}: ${springLinear(mass)};`);
		lines.push(`  --spring-${mass}-ms: ${SPRINGS[mass].move}ms;`);
		lines.push(`  --release-${mass}-ms: ${SPRINGS[mass].release}ms;`);
	}
	lines.push("}", "");
	return lines.join("\n");
}
