import { describe, expect, test } from "bun:test";
import {
	detectUserMedium,
	ensureClosingFormula,
	hasMediumPhrase,
} from "../prompts/style-hints";

describe("detectUserMedium", () => {
	test("распознаёт явные стили пользователя", () => {
		expect(detectUserMedium("тигр в джунглях, фотореализм")).toContain(
			"photograph",
		);
		expect(detectUserMedium("аниме-девочка с катаной")).toContain("anime");
		expect(detectUserMedium("детский рисунок домика")).toContain("crayon");
		expect(detectUserMedium("портрет в стиле ренессанс")).toContain(
			"Renaissance",
		);
		expect(detectUserMedium("pixel art of a cat")).toContain("pixel-art");
	});

	test("обычные запросы не дают подсказки", () => {
		expect(detectUserMedium("кот")).toBeNull();
		expect(detectUserMedium("свадьба в замке")).toBeNull();
		expect(detectUserMedium("42 бегемота играют в шахматы")).toBeNull();
	});
});

describe("ensureClosingFormula", () => {
	test("добавляет формулу, если медиума нет", () => {
		const text =
			"A colossal pug rides a neon scooter through a cyberpunk city while pugs cheer.";
		const withFormula = ensureClosingFormula(
			text,
			"hyper-detailed cinematic photograph",
		);
		expect(withFormula).toContain("hyper-detailed cinematic photograph");
		expect(withFormula).toContain("no watermarks, no signature");
		expect(withFormula.startsWith(text)).toBe(true);
	});

	test("не дублирует формулу, если медиум уже назван", () => {
		const text =
			"A colossal pug rides a neon scooter. Thick oil painting with canvas texture, wide-angle poster composition.";
		expect(
			ensureClosingFormula(text, "hyper-detailed cinematic photograph"),
		).toBe(text);
		expect(hasMediumPhrase(text)).toBe(true);
	});
});
