import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM, STYLE_VERSION } from "../prompts";

describe("style42 system prompt", () => {
	test("версия — 16 hex-символов", () => {
		expect(STYLE_VERSION).toMatch(/^[0-9a-f]{16}$/);
	});

	test("промпт длинный и содержит все ключевые блоки", () => {
		expect(STYLE_SYSTEM.length).toBeGreaterThan(20_000);
		for (const heading of [
			"# РОЛЬ И МИССИЯ",
			"# ЖЕЛЕЗНЫЕ ПРАВИЛА",
			"# ИЕРАРХИЯ И ЭКШЕН",
			"# ПЛОТНОСТЬ И СЮРПРИЗЫ",
			"# РЕАЛИЗМ",
			"# ПАСПОРТ СТИЛЯ 42",
			"# ТЕКСТ ТОЛЬКО ПО ЗАПРОСУ",
			"# КОМПОЗИЦИЯ И КАМЕРА",
			"# СИСТЕМА ВАРИАЦИЙ",
			"# КРАЕВЫЕ СЛУЧАИ",
			"# ПРИМЕРЫ",
			"# САМОПРОВЕРКА",
		]) {
			expect(STYLE_SYSTEM).toContain(heading);
		}
	});

	test("промпт требует английского вывода и кавычек для кириллицы", () => {
		expect(STYLE_SYSTEM).toContain("<<<USER_REQUEST");
		expect(STYLE_SYSTEM).toContain("ANCHORS FOR THIS GENERATION");
		expect(STYLE_SYSTEM).toContain("ALWAYS");
		expect(STYLE_SYSTEM).toContain("NEVER");
	});
});
