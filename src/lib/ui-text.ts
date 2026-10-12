// src/lib/ui-text.ts
import { readdir } from "node:fs/promises";
import path from "node:path";

const transpiler = new Bun.Transpiler({
	loader: "tsx",
	tsconfig: JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }),
});

const CYRILLIC = /[А-Яа-яЁё]/;
/** Скрытые подписи для скринридера не считаются видимым текстом */
const ARIA = /"aria-[a-z-]+":\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")/g;
const LITERAL = /`((?:[^`\\]|\\.)*)`|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

/** Все русские строки, которые компонент может вывести на экран */
export function visibleStrings(source: string): string[] {
	const js = transpiler.transformSync(source).replace(ARIA, "");
	const found = new Set<string>();
	for (const m of js.matchAll(LITERAL)) {
		const text = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\s+/g, " ").trim();
		if (text && CYRILLIC.test(text)) found.add(text);
	}
	return [...found];
}

export async function collectUiText(
	dir: string,
): Promise<Record<string, string[]>> {
	const out: Record<string, string[]> = {};
	for (const name of (await readdir(dir, { recursive: true })).sort()) {
		if (!name.endsWith(".tsx")) continue;
		out[name] = visibleStrings(
			await Bun.file(path.join(dir, name)).text(),
		).sort();
	}
	return out;
}
