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
		expect(prompt).toContain(anchors.slogan);
		expect(prompt).toContain(anchors.creatures);
		expect(prompt).toContain("42");
	});

	test("не похож на служебный текст и достаточно длинный", () => {
		const anchors = pickAnchors(() => 0.3);
		const prompt = buildFallbackPrompt("strawberry", anchors);
		expect(prompt.split(/\s+/).length).toBeGreaterThan(60);
	});
});
