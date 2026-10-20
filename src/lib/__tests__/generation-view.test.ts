import { describe, expect, test } from "bun:test";
import { generationJson } from "../generation-json";
import {
	formatDuration,
	generationEngineName,
	generationModelName,
	generationModeName,
} from "../generation-view";
import type { GenerationRecord } from "../generations";

const record = {
	id: "g42",
	userId: "u1",
	prompt: "мой исходный запрос",
	engine: "ultra",
	model: "gpt-image-2",
	width: 1536,
	height: 1024,
	steps: 0,
	seed: null,
	cost: 10,
	imageKey: "generations/u1/image.png",
	status: "completed",
	errorMessage: null,
	durationMs: 123456,
	createdAt: "2026-10-18T10:00:00Z",
	reasoning: "xhigh",
} satisfies GenerationRecord;

describe("данные просмотра", () => {
	test("история и итог содержат реальные настройки и стабильные адреса копий", () => {
		const data = generationJson(record, "https://original/image.png");
		expect(data).toMatchObject({
			prompt: "мой исходный запрос",
			engine: "ultra",
			model: "gpt-image-2",
			width: 1536,
			height: 1024,
			reasoning: "xhigh",
			duration: 123456,
			image_url: "https://original/image.png",
			preview_url: "/api/generations/g42/preview",
			thumb_url: "/api/generations/g42/thumb",
		});
		expect(data).not.toHaveProperty("imageKey");
		expect(data).not.toHaveProperty("userId");
	});
	test("старой записи не приписывается уровень рассуждения", () => {
		expect(
			generationJson({ ...record, reasoning: null }, "original").reasoning,
		).toBeNull();
	});
	test("незавершённый запуск не получает адресов изображения", () => {
		const data = generationJson({ ...record, status: "running" }, "original");
		expect(data.image_url).toBeNull();
		expect(data.preview_url).toBeNull();
		expect(data.thumb_url).toBeNull();
	});
});

describe("компактные настройки", () => {
	test("имя движка не путается с режимом Turbo модели Krea", () => {
		expect(generationEngineName({ engine: "krea", model: "Turbo" })).toBe(
			"Krea 2",
		);
		expect(generationModeName({ engine: "krea", model: "Turbo" })).toBe(
			"Изображение",
		);
		expect(generationModelName({ engine: "krea", model: "Turbo" })).toBe(
			"Turbo",
		);
		expect(
			generationEngineName({ engine: "turbo", model: "gpt-image-2" }),
		).toBe("Ультра");
		expect(generationModeName({ engine: "turbo", model: "gpt-image-2" })).toBe(
			"Ультра",
		);
		expect(generationModelName({ engine: "turbo", model: "gpt-image-2" })).toBe(
			"gpt-image-2",
		);
		expect(
			generationEngineName({ engine: "ideogram", model: "Default · 20 steps" }),
		).toBe("Ideogram 4");
		expect(
			generationModelName({ engine: "ideogram", model: "Default · 20 steps" }),
		).toBe("Default · 20 steps");
	});
	test("время округляется до секунды, отсутствующее не превращается в ноль", () => {
		expect(formatDuration(123456)).toBe("2:03");
		expect(formatDuration(59999)).toBe("1:00");
		expect(formatDuration(0)).toBe("0:00");
		expect(formatDuration(null)).toBeNull();
		expect(formatDuration(undefined)).toBeNull();
	});
});
