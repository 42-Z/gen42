import { describe, expect, test } from "bun:test";
import {
	sanitizeEnhancedPrompt,
	validateEnhancedPrompt,
} from "../prompts/contract";

const VALID = `A colossal fluffy cat lounging on a diamond throne, gold chains with a «42» medallion, pugs in leopard coats around, fireworks spelling 42, neon banners reading «СЛАВА БОССУ», confetti rain, hyper-detailed cinematic photograph, wide-angle poster composition, epic scale, hyper-saturated palette, absurd triumphant kitsch, no watermarks.`;

describe("sanitizeEnhancedPrompt", () => {
	test("снимает markdown-обёртку и внешние кавычки", () => {
		const raw =
			'```text\n"An ultra detailed scene with a pug in a fur coat."\n```';
		const clean = sanitizeEnhancedPrompt(raw);
		expect(clean).toBe("An ultra detailed scene with a pug in a fur coat.");
	});

	test("отрезает преамбулу", () => {
		const raw = "Sure! Here is the prompt:\nA pug rides a neon scooter.";
		expect(sanitizeEnhancedPrompt(raw)).toBe("A pug rides a neon scooter.");
	});

	test("сворачивает переводы строк и лишние пробелы", () => {
		const raw = "A pug\n\n  rides   a scooter.\n";
		expect(sanitizeEnhancedPrompt(raw)).toBe("A pug rides a scooter.");
	});

	test("обрезает по границе предложения до 2000 символов", () => {
		const sentence = `${"word ".repeat(40)}. `;
		const long = sentence.repeat(40);
		const clean = sanitizeEnhancedPrompt(long);
		expect(clean.length).toBeLessThanOrEqual(2000);
		expect(clean.endsWith(".")).toBe(true);
	});

	test("не оставляет незакрытую кавычку после обрезки", () => {
		const sentence = `${"word ".repeat(40)}. `;
		const long = `${sentence.repeat(35)}Баннер с надписью «СЛАВА 42 и дальше очень длинный текст без закрывающей кавычки`;
		const clean = sanitizeEnhancedPrompt(long);
		const openings = (clean.match(/«/g) ?? []).length;
		const closings = (clean.match(/»/g) ?? []).length;
		expect(openings).toBe(closings);
	});
});

describe("validateEnhancedPrompt", () => {
	test("валидный промпт проходит", () => {
		expect(validateEnhancedPrompt(VALID)).toEqual({ ok: true });
	});

	test("слишком короткий — брак", () => {
		const verdict = validateEnhancedPrompt("A pug in a coat.");
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("short");
	});

	test("иероглифы вне цитат — брак", () => {
		const withCjk = `${VALID} 素晴らしい`;
		const verdict = validateEnhancedPrompt(withCjk);
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("cjk");
	});

	test("кириллица вне кавычек — брак", () => {
		const mixed = `${VALID} и ещё немного текста`;
		const verdict = validateEnhancedPrompt(mixed);
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("cyrillic");
	});

	test("markdown-ограда в тексте — брак", () => {
		const verdict = validateEnhancedPrompt(`${VALID} \`\`\``);
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("markdown");
	});
});

describe("кавычки в валидации (регрессия ревью)", () => {
	test("кириллица в курчавых кавычках не считается текстом вне кавычек", () => {
		const text = `${VALID} A banner reads “СЛАВА 42” above the crowd.`;
		expect(validateEnhancedPrompt(text)).toEqual({ ok: true });
	});

	test("одинарные кавычки тоже стрипаются", () => {
		const text = `${VALID} A sign reads 'СЛАВА 42' near the throne.`;
		expect(validateEnhancedPrompt(text)).toEqual({ ok: true });
	});
});
