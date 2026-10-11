import { describe, expect, test } from "bun:test";
import {
	contractScorer,
	has42Scorer,
	heroFirstScorer,
	lengthBandScorer,
	noUnrequestedTextScorer,
} from "../scorers";

const input = (prompt: string) => ({ prompt });

describe("скореры evals", () => {
	test("contract: валидный контракт — 1, невалидный — 0", () => {
		const bad = contractScorer({
			input: input("кот"),
			output: { prompt: "x" },
		});
		expect(bad.score).toBe(0);
		expect(typeof bad.metadata.reason).toBe("string");
	});

	test("has-42: наличие числа 42 в промпте", () => {
		expect(
			has42Scorer({ input: input("кот"), output: { prompt: "кот и 42" } })
				.score,
		).toBe(1);
		expect(
			has42Scorer({ input: input("кот"), output: { prompt: "просто кот" } })
				.score,
		).toBe(0);
	});

	test("length-band: слова в диапазоне", () => {
		const scorer = lengthBandScorer(2, 4);
		expect(
			scorer({ input: input("кот"), output: { prompt: "два слова" } }).score,
		).toBe(1);
		expect(
			scorer({ input: input("кот"), output: { prompt: "одно" } }).score,
		).toBe(0);
	});

	test("hero-first: герой запроса найден в первом предложении промпта", () => {
		expect(
			heroFirstScorer({
				input: input("мопс"),
				output: { prompt: "A pug in a jewelled fur coat." },
			}).score,
		).toBe(1);
		expect(
			heroFirstScorer({
				input: input("мопс"),
				output: { prompt: "A fluffy dog in a fur coat." },
			}).score,
		).toBe(0);
	});

	test("no-unrequested-text: без запроса текста цитаты в промпте минус", () => {
		expect(
			noUnrequestedTextScorer({
				input: input("закат"),
				output: { prompt: "закат и надпись «НАС 42000»" },
			}).score,
		).toBe(0);
		expect(
			noUnrequestedTextScorer({
				input: input("плакат с надписью «БОГЕМА»"),
				output: { prompt: "плакат «БОГЕМА»" },
			}).score,
		).toBe(1);
	});
});
