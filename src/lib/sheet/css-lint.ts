// src/lib/sheet/css-lint.ts
/**
 * Проверка CSS по правилам системы: анимировать можно только transform,
 * translate, scale, rotate и opacity; запрещены filter, backdrop-filter,
 * mix-blend-mode и @property. Разбор простой (регулярные выражения), его
 * достаточно для CSS проекта.
 */
export const ALLOWED_ANIMATED = new Set([
	"transform",
	"translate",
	"scale",
	"rotate",
	"opacity",
]);

export function animatedProperties(css: string): Set<string> {
	const out = new Set<string>();
	const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const block of source.matchAll(
		/@keyframes\s+[\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
	)) {
		for (const frame of block[1]!.matchAll(/\{([^{}]*)\}/g)) {
			for (const decl of frame[1]!.matchAll(/([a-z-]+)\s*:/g)) {
				// кривая отрезка между кадрами управляет временем, а не анимирует свойство
				if (decl[1] !== "animation-timing-function") out.add(decl[1]!);
			}
		}
	}
	for (const m of source.matchAll(
		/(?<![\w-])transition(?:-property)?\s*:\s*([^;{}]+)/g,
	)) {
		for (const part of m[1]!.split(",")) {
			const name = part.trim().split(/\s+/)[0] ?? "";
			if (/^[a-z-]+$/.test(name) && name !== "none") out.add(name);
		}
	}
	return out;
}

export function bannedTokens(css: string): string[] {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const found: string[] = [];
	if (/(?<![\w-])filter\s*:/.test(source)) found.push("filter");
	if (/backdrop-filter\s*:/.test(source)) found.push("backdrop-filter");
	if (/mix-blend-mode\s*:/.test(source)) found.push("mix-blend-mode");
	if (/@property\b/.test(source)) found.push("@property");
	return found;
}
