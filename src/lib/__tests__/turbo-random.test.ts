import { describe, expect, test } from "bun:test";
import { pickRandom } from "../turbo/random";

describe("pickRandom", () => {
	test("возвращает элемент списка по источнику случайности", () => {
		const options = ["рассвет", "полдень", "ночь"];
		expect(pickRandom(options, () => 0)).toEqual({
			ok: true,
			value: "рассвет",
		});
		expect(pickRandom(options, () => 0.5)).toEqual({
			ok: true,
			value: "полдень",
		});
		expect(pickRandom(options, () => 0.999)).toEqual({
			ok: true,
			value: "ночь",
		});
	});

	test("значение на границе не выходит за список", () => {
		expect(pickRandom(["а", "б"], () => 1)).toEqual({ ok: true, value: "б" });
	});

	test("меньше двух вариантов — ошибка, которую агент исправляет", () => {
		expect(pickRandom([])).toMatchObject({ ok: false, retryable: true });
		expect(pickRandom(["один"])).toMatchObject({ ok: false, retryable: true });
	});

	test("Math.random по умолчанию даёт разные варианты", () => {
		const options = ["а", "б", "в", "г", "д"];
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const result = pickRandom(options);
			if (result.ok) seen.add(result.value);
		}
		expect(seen.size).toBe(options.length);
	});
});
