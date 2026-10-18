import { describe, expect, test } from "bun:test";
import { describeGenerationError } from "../generation-error";
import { errorFromFailure } from "../spaces/failure";
import { SpaceRunError, toSpaceFailure } from "../spaces/run-error";

describe("сбои запуска Space", () => {
	test("SpaceRunError превращается в данные без потерь", () => {
		expect(
			toSpaceFailure(new SpaceRunError("error", "сломалось", "hf-1")),
		).toEqual({ code: "error", message: "сломалось", apiKeyId: "hf-1" });
	});

	test("посторонняя ошибка — код error без ключа", () => {
		expect(toSpaceFailure(new Error("база упала"))).toEqual({
			code: "error",
			message: "база упала",
			apiKeyId: null,
		});
		expect(toSpaceFailure("текст")).toMatchObject({ message: "текст" });
	});

	test("all_keys_exhausted в истории — прежний код", () => {
		const error = errorFromFailure({
			code: "all_keys_exhausted",
			message: "x",
			apiKeyId: null,
		});
		expect(describeGenerationError(error)).toBe(
			"all_keys_exhausted: All API keys exhausted",
		);
	});

	test("прочий сбой в истории — код error с исходным текстом", () => {
		const error = errorFromFailure({
			code: "error",
			message: "Не удалось скачать изображение: 500",
			apiKeyId: "hf-1",
		});
		expect(describeGenerationError(error)).toBe(
			"error: Не удалось скачать изображение: 500",
		);
	});
});
