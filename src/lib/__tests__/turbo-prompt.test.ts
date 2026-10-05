import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM } from "../prompts";
import {
	CANON_COMPOSITION_AND_VARIATIONS,
	CANON_CORE,
	CANON_EFFECTS_AND_MEDIUMS,
	CANON_FIDELITY,
	CANON_TEXT_POLICY,
} from "../prompts/canon";
import { buildTurboSystem } from "../prompts/turbo.system";

const SHARED = {
	CANON_FIDELITY,
	CANON_CORE,
	CANON_EFFECTS_AND_MEDIUMS,
	CANON_TEXT_POLICY,
	CANON_COMPOSITION_AND_VARIATIONS,
};

describe("общие блоки канона", () => {
	for (const [name, block] of Object.entries(SHARED)) {
		test(`${name} входит в обе инструкции дословно`, () => {
			expect(block.length).toBeGreaterThan(100);
			expect(STYLE_SYSTEM).toContain(block);
			expect(buildTurboSystem("")).toContain(block);
		});
	}
});

describe("инструкция агента Турбо", () => {
	const tree = "пятерка/ — 2 изображения";
	const system = buildTurboSystem(tree);

	test("содержит разделы роли, библиотеки, инструментов и правил", () => {
		for (const heading of [
			"# РОЛЬ И МИССИЯ",
			"# БИБЛИОТЕКА ВХОДНЫХ ИЗОБРАЖЕНИЙ",
			"# РАБОЧИЙ ЦИКЛ",
			"# ИНСТРУМЕНТЫ",
			"## listFolder",
			"## readFile",
			"## generateImage",
			"# ЖЕЛЕЗНЫЕ ПРАВИЛА",
			"# ПАСПОРТ СТИЛЯ 42",
			"# САМОПРОВЕРКА",
		]) {
			expect(system).toContain(heading);
		}
	});

	test("дерево библиотеки подставляется в блок <library>", () => {
		expect(system).toContain(`<library>\n${tree}\n</library>`);
		expect(system).not.toContain("{tree}");
	});

	test("запретов не ради качества в инструкции нет", () => {
		expect(system).not.toContain("реальные государственные флаги");
		expect(system).not.toContain("заменяет любые реальные лица");
	});

	test("дерево — единственная изменчивая часть: версия считается по пустому дереву", () => {
		const withoutTree = system.replace(
			`<library>\n${tree}\n</library>`,
			"<library>\n\n</library>",
		);
		expect(withoutTree).toBe(buildTurboSystem(""));
	});
});
