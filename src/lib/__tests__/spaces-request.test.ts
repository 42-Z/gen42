import { describe, expect, test } from "bun:test";
import { IDEOGRAM_MODE, IDEOGRAM_STEPS } from "../models";
import { parseSpaceRequest } from "../spaces/request";

describe("parseSpaceRequest", () => {
	test("Krea: умолчания и запись как у прежнего обработчика", () => {
		expect(parseSpaceRequest({ prompt: "кот" }, "krea")).toEqual({
			engine: "krea",
			prompt: "кот",
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
			recordModel: "Turbo",
			recordSteps: 8,
		});
	});

	test("значения клиента принимаются, id и негативный промпт сохраняются", () => {
		const request = parseSpaceRequest(
			{
				prompt: "кот",
				id: "client-id-42",
				negativePrompt: "blur",
				model: "Raw",
				width: 768,
				height: 1280,
				steps: 12,
				seed: 5,
			},
			"krea",
		);
		expect(request).toMatchObject({
			id: "client-id-42",
			negativePrompt: "blur",
			model: "Raw",
			width: 768,
			height: 1280,
			steps: 12,
			seed: 5,
			recordModel: "Raw",
			recordSteps: 12,
		});
	});

	test("Ideogram: в историю пишется пресет, а не значения клиента", () => {
		const request = parseSpaceRequest(
			{ prompt: "кот", model: "Raw", steps: 3 },
			"ideogram",
		);
		expect(request.recordModel).toBe(IDEOGRAM_MODE);
		expect(request.recordSteps).toBe(IDEOGRAM_STEPS);
	});

	test("мусор заменяется умолчаниями", () => {
		const request = parseSpaceRequest(
			{
				prompt: "кот",
				id: 42,
				model: "Evil",
				width: -5,
				height: "большой",
				steps: 0,
				seed: 1.5,
			},
			"krea",
		);
		expect(request).toMatchObject({
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
		});
		expect(request.id).toBeUndefined();
	});
});
