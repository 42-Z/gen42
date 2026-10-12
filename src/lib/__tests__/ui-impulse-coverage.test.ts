// src/lib/__tests__/ui-impulse-coverage.test.ts
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

const COMPONENTS = path.join(import.meta.dir, "../../components");
const transpiler = new Bun.Transpiler({
	loader: "tsx",
	tsconfig: JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }),
});
const NATIVE = ["button", "a"];

/** Тела props у вызовов jsx("button", {…}) в транспилированном коде */
function propsOf(js: string, tag: string): string[] {
	const out: string[] = [];
	const re = new RegExp(`\\bjsx(?:DEV|s)?[\\w$]*\\("${tag}",\\s*\\{`, "g");
	for (const m of js.matchAll(re)) {
		let depth = 1;
		let i = (m.index ?? 0) + m[0].length;
		const start = i;
		for (; i < js.length && depth > 0; i++) {
			if (js[i] === "{") depth++;
			else if (js[i] === "}") depth--;
		}
		out.push(js.slice(start, i - 1));
	}
	return out;
}

describe("покрытие импульсами", () => {
	test("у каждого нативного button/a экранов есть data-impulse", async () => {
		const bare: string[] = [];
		for (const name of await readdir(COMPONENTS, { recursive: true })) {
			if (!name.endsWith(".tsx") || name.startsWith("ui/")) continue; // примитивы shadcn проверяются ниже
			const js = transpiler.transformSync(
				await Bun.file(path.join(COMPONENTS, name)).text(),
			);
			for (const tag of NATIVE) {
				for (const props of propsOf(js, tag)) {
					// нативный button интерактивен всегда (без type он ещё и отправляет форму),
					// ссылке нужен href, остальное — по признакам действия
					const interactive =
						tag === "button" || /href:|onClick|role:/.test(props);
					if (interactive && !props.includes("data-impulse"))
						bare.push(`${name}: <${tag}>`);
				}
			}
		}
		expect(bare).toEqual([]);
	});

	test("примитивы shadcn с нажатием несут data-impulse", async () => {
		const required = ["button.tsx", "tabs.tsx", "input.tsx", "textarea.tsx"];
		for (const f of required) {
			const src = await Bun.file(path.join(COMPONENTS, "ui", f)).text();
			expect(src).toContain("data-impulse");
		}
	});
});
