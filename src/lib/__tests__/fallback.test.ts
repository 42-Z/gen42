import { describe, expect, test } from "bun:test";
import { pickAnchors } from "../prompts/anchors";
import { buildFallbackPrompt } from "../style42-fallback";

describe("buildFallbackPrompt", () => {
	test("детерминирован при фиксированных якорях", () => {
		const anchors = pickAnchors(() => 0);
		const first = buildFallbackPrompt("кот", anchors);
		const second = buildFallbackPrompt("кот", anchors);
		expect(first).toBe(second);
	});

	test("сохраняет субъект, якоря и 42", () => {
		const anchors = pickAnchors(() => 0.5);
		const prompt = buildFallbackPrompt("  кот   на диване ", anchors);
		expect(prompt).toContain("кот на диване");
		expect(prompt).toContain(anchors.creatures);
		expect(prompt).toContain("42");
	});

	test("без текстового запроса слоган в кадр не попадает", () => {
		const anchors = pickAnchors(() => 0.5);
		const prompt = buildFallbackPrompt("кот", anchors, {
			textRequested: false,
		});
		expect(prompt).not.toContain(anchors.slogan);
		expect(prompt).toContain("as the only text in the frame");
	});

	test("с текстовым запросом слоган остаётся", () => {
		const anchors = pickAnchors(() => 0.5);
		const prompt = buildFallbackPrompt("кот", anchors, { textRequested: true });
		expect(prompt).toContain(anchors.slogan);
	});

	test("не похож на служебный текст и достаточно длинный", () => {
		const anchors = pickAnchors(() => 0.3);
		const prompt = buildFallbackPrompt("strawberry", anchors);
		expect(prompt.split(/\s+/).length).toBeGreaterThan(60);
	});
});

describe("fallback и точный текст", () => {
	test("использует точный текст пользователя, а не слоган", () => {
		const anchors = pickAnchors(() => 0);
		const prompt = buildFallbackPrompt("плакат", anchors, {
			textRequested: true,
			exactTexts: ["ЖИВИ ГРОМКО"],
		});
		expect(prompt).toContain("«ЖИВИ ГРОМКО»");
		expect(prompt).not.toContain(anchors.slogan);
	});

	test("без точного текста берёт слоган из каталога", () => {
		const anchors = pickAnchors(() => 0);
		const prompt = buildFallbackPrompt("плакат", anchors, {
			textRequested: true,
		});
		expect(prompt).toContain(anchors.slogan);
	});
});
