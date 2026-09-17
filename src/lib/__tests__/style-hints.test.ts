import { describe, expect, test } from "bun:test";
import {
	detectUserMedium,
	ensureClosingFormula,
	extractQuotedTexts,
	hasMediumPhrase,
	maskUnrequestedTexts,
	missingDetails,
	requestsText,
} from "../prompts/style-hints";

describe("requestsText", () => {
	test("текстовые запросы распознаются", () => {
		expect(requestsText("плакат с надписью «СЛАВА 42»")).toBe(true);
		expect(requestsText("напиши на баннере СЛАВА БОССУ")).toBe(true);
		expect(requestsText("poster with the text HELLO")).toBe(true);
		expect(requestsText("неоновая вывеска с лозунгом")).toBe(true);
	});

	test("обычные запросы текста не требуют", () => {
		expect(requestsText("кот")).toBe(false);
		expect(requestsText("человек стреляет лазерами из глаз")).toBe(false);
		expect(requestsText("свадьба в средневековом замке")).toBe(false);
	});
});

describe("missingDetails", () => {
	test("находит потерянные экшен-детали", () => {
		const user = "человек с крыльями стреляет лазерами из глаз";
		const output =
			"A winged figure stands proudly on a rooftop while pugs cheer around.";
		const missing = missingDetails(user, output);
		expect(missing).toEqual(expect.arrayContaining(["laser", "shoot", "eye"]));
		expect(missing).not.toContain("wing");
	});

	test("ничего не теряется, когда детали на месте", () => {
		const user = "человек с крыльями стреляет лазерами из глаз";
		const output =
			"A winged humanoid figure fires bright laser beams from both eyes, the beams cutting the air while feather wings spread wide.";
		expect(missingDetails(user, output)).toEqual([]);
	});

	test("без экшен-слов в запросе проверять нечего", () => {
		expect(missingDetails("кот", "A cat sleeps on a diamond throne.")).toEqual(
			[],
		);
	});
});

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
		expect(detectUserMedium("шашлык на мангале")).toBeNull();
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

	test("узнаёт перефразированный медиум по маркеру", () => {
		const text =
			"A majestic Bengal tiger prowling through a jungle. Hyper-detailed wildlife photograph, telephoto composition, shallow depth of field.";
		expect(hasMediumPhrase(text)).toBe(true);
		expect(
			ensureClosingFormula(text, "thick oil painting with canvas texture"),
		).toBe(text);
	});

	test("не дописывает формулу, если есть no watermarks", () => {
		const text =
			"A neon city with 42 fireworks, absurd triumphant kitsch, no watermarks, no signature.";
		expect(ensureClosingFormula(text, "anime poster with speed lines")).toBe(
			text,
		);
	});
});

describe("extractQuotedTexts и maskUnrequestedTexts", () => {
	test("извлекает точный текст из кавычек", () => {
		expect(extractQuotedTexts("плакат с надписью «СЛАВА 42»")).toEqual([
			"СЛАВА 42",
		]);
		expect(extractQuotedTexts('poster with the text "HELLO WORLD"')).toEqual([
			"HELLO WORLD",
		]);
		expect(extractQuotedTexts("кот")).toEqual([]);
	});

	test("маскирует незапрошенный текст числом 42", () => {
		const text =
			"Anime girl on a roof. A billboard reads «42 — ПРАВИЛЬНЫЙ ВЫБОР» above.";
		expect(maskUnrequestedTexts(text)).toBe(
			"Anime girl on a roof. A billboard reads 42 above.",
		);
	});
});
