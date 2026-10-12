// src/lib/__tests__/ui-text.test.ts
import { describe, expect, test } from "bun:test";
import path from "node:path";
import { collectUiText, visibleStrings } from "../ui-text";

const COMPONENTS = path.join(import.meta.dir, "../../components");
const baseline: Record<string, string[]> = await Bun.file(
	path.join(import.meta.dir, "ui-text.baseline.json"),
).json();

describe("извлечение видимого текста", () => {
	test("берёт текст JSX, строки выражений и шаблоны, пропускает aria-*", () => {
		const src = `
export function X({ ok }: { ok: boolean }) {
	return (
		<div aria-label="Скрытая подпись" title="Подсказка">
			Привет, мир
			{ok ? "Да" : \`Нет \${1}\`}
			<input placeholder="Введите" aria-valuetext="Высокое" />
			<span>abc</span>
		</div>
	);
}`;
		expect(visibleStrings(src).sort()).toEqual(
			["Привет, мир", "Да", "Нет ${1}", "Введите", "Подсказка"].sort(),
		);
	});
});

describe("ни одного нового слова", () => {
	test("в компонентах нет русских строк, которых не было в эталоне", async () => {
		const known = new Set(Object.values(baseline).flat());
		const now = await collectUiText(COMPONENTS);
		const added = Object.entries(now).flatMap(([file, strings]) =>
			strings.filter((s) => !known.has(s)).map((s) => `${file}: ${s}`),
		);
		expect(added).toEqual([]);
	});
});
