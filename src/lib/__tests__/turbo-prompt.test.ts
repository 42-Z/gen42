import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM } from "../prompts";
import { CANON_FIDELITY } from "../prompts/canon";
import { buildTurboSystem } from "../prompts/turbo.system";

describe("общие блоки канона", () => {
	// Турбо пишет своё творческое направление; с обогащением для Krea и Ideogram
	// у него остаётся общим только блок «Верность запросу».
	test("CANON_FIDELITY входит в обе инструкции дословно", () => {
		expect(CANON_FIDELITY.length).toBeGreaterThan(100);
		expect(STYLE_SYSTEM).toContain(CANON_FIDELITY);
		expect(buildTurboSystem("")).toContain(CANON_FIDELITY);
	});
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
			"# ХАРАКТЕР 42",
			"## Штамп",
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

	test("стиль описан направлением: квот на предметы и обязательных каталогов нет", () => {
		for (const quota of [
			"не меньше шести предметов",
			"≥6 предметов роскоши",
			"≥3 сюрприза",
			"меньше десяти различимых",
			"на квадратный метр кадра",
			"ALWAYS используй переданные якоря",
		]) {
			expect(system).not.toContain(quota);
		}
	});

	test("рабочий цикл начинается с идеи, случайных якорей в инструкции нет", () => {
		expect(system).toContain("2. Придумай кадр.");
		expect(system).toContain("три разные идеи");
		expect(system).toContain("## Как находить идею");
		expect(system).toContain("## Как достраивать мир");
		expect(system).toContain("не меньше семи");
		expect(system).toContain("Проверка на узнаваемость");
		expect(system).not.toContain("ANCHORS");
	});

	test("дерево — единственная изменчивая часть: версия считается по пустому дереву", () => {
		const withoutTree = system.replace(
			`<library>\n${tree}\n</library>`,
			"<library>\n\n</library>",
		);
		expect(withoutTree).toBe(buildTurboSystem(""));
	});
});
