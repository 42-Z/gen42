// src/lib/__tests__/sheet-dom.test.ts
import { describe, expect, test } from "bun:test";
import { caretViewportPoint, MIRROR_PROPS } from "../sheet/caret";
import { isEraseInput, tailLength } from "../sheet/tail";

describe("caretViewportPoint", () => {
	test("складывает поле, рамку и метку, вычитает прокрутку, берёт середину строки", () => {
		expect(
			caretViewportPoint({
				fieldLeft: 100,
				fieldTop: 50,
				borderLeft: 1,
				borderTop: 1,
				markLeft: 40,
				markTop: 20,
				markHeight: 24,
				scrollLeft: 0,
				scrollTop: 10,
			}),
		).toEqual({ x: 141, y: 73, h: 24 });
	});

	test("горизонтальная прокрутка сдвигает влево", () => {
		const p = caretViewportPoint({
			fieldLeft: 0,
			fieldTop: 0,
			borderLeft: 0,
			borderTop: 0,
			markLeft: 300,
			markTop: 0,
			markHeight: 20,
			scrollLeft: 120,
			scrollTop: 0,
		});
		expect(p.x).toBe(180);
	});

	test("зеркало копирует всё, что влияет на перенос строк", () => {
		for (const prop of [
			"font-family",
			"font-size",
			"font-weight",
			"letter-spacing",
			"line-height",
			"padding-left",
			"padding-right",
			"border-left-width",
			"box-sizing",
			"width",
			"text-indent",
			"tab-size",
		]) {
			expect([...MIRROR_PROPS] as string[]).toContain(prop);
		}
	});
});

describe("хвост каретки", () => {
	test("удаление — это delete*, ввод и вставка — нет", () => {
		expect(isEraseInput("deleteContentBackward")).toBe(true);
		expect(isEraseInput("deleteByCut")).toBe(true);
		expect(isEraseInput("insertText")).toBe(false);
		expect(isEraseInput("insertFromPaste")).toBe(false);
		expect(isEraseInput(undefined)).toBe(false);
	});

	test("длина хвоста: 48 px при быстрой печати, 10 px при медленной, монотонно", () => {
		expect(tailLength(0)).toBe(48);
		expect(tailLength(200)).toBe(24);
		expect(tailLength(400)).toBe(10);
		expect(tailLength(5000)).toBe(10);
		let prev = Infinity;
		for (let ms = 0; ms <= 400; ms += 40) {
			const v = tailLength(ms);
			expect(v).toBeLessThanOrEqual(prev);
			prev = v;
		}
	});
});
