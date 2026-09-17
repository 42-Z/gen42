import { describe, expect, test } from "bun:test";
import {
	ANCHOR_CATEGORIES,
	buildUserMessage,
	pickAnchors,
} from "../prompts/anchors";

describe("anchors", () => {
	test("каталог покрывает семь категорий и не пуст", () => {
		expect(ANCHOR_CATEGORIES.map((c) => c.key)).toEqual([
			"location",
			"transport",
			"creatures",
			"luxury",
			"slogan",
			"medium",
			"lighting",
		]);
		for (const category of ANCHOR_CATEGORIES) {
			expect(category.values.length).toBeGreaterThanOrEqual(6);
		}
	});

	test("pickAnchors детерминирован при фиксированном rng", () => {
		const first = pickAnchors(() => 0);
		const second = pickAnchors(() => 0);
		expect(first).toEqual(second);
		expect(first.creatures).toBe(ANCHOR_CATEGORIES[2]!.values[0]!);
	});

	test("pickAnchors меняет значения при другом rng", () => {
		const low = pickAnchors(() => 0);
		const high = pickAnchors(() => 0.99);
		expect(low.transport).not.toBe(high.transport);
	});

	test("buildUserMessage оборачивает запрос и перечисляет все якоря", () => {
		const anchors = pickAnchors(() => 0);
		const message = buildUserMessage("  кот   на диване ", anchors);
		expect(message).toContain("<<<USER_REQUEST\nкот на диване\n>>>");
		expect(message).toContain("ANCHORS FOR THIS GENERATION");
		for (const value of Object.values(anchors)) {
			expect(message).toContain(value);
		}
	});
});
