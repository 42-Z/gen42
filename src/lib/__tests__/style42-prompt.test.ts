import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM, STYLE_VERSION } from "../prompts";

describe("style42 system prompt", () => {
	test("версия — 16 hex-символов", () => {
		expect(STYLE_VERSION).toMatch(/^[0-9a-f]{16}$/);
	});

	test("промпт длинный и содержит все девять блоков", () => {
		expect(STYLE_SYSTEM.length).toBeGreaterThan(12_000);
		for (const heading of [
			"# РОЛЬ И МИССИЯ",
			"# ЖЕЛЕЗНЫЕ ПРАВИЛА",
			"# ПАСПОРТ СТИЛЯ 42",
			"# ТЕКСТ НА ИЗОБРАЖЕНИИ",
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
