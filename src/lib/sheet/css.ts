// src/lib/sheet/css.ts
import {
	color,
	ERROR,
	phase,
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
	for (const mass of MASSES) {
		lines.push(`  --spring-${mass}: ${springLinear(mass)};`);
		lines.push(`  --spring-${mass}-ms: ${SPRINGS[mass].move}ms;`);
		lines.push(`  --release-${mass}-ms: ${SPRINGS[mass].release}ms;`);
	}
	lines.push("}", "");
	return lines.join("\n");
}
