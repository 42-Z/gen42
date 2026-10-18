import { describe, expect, test } from "bun:test";
import {
	getEngineCost,
	getImageModel,
	isImageEngine,
	isSpaceEngine,
	parseGenerationMode,
	publicImageModels,
	resolveImageEngine,
	ULTRA_MODEL,
} from "../models";

describe("Image models", () => {
	test("Ideogram 4 дороже Krea 2", () => {
		expect(getImageModel("krea").cost).toBe(1);
		expect(getImageModel("ideogram").cost).toBe(3);
	});

	test("Ультра стоит 10 кредитов", () => {
		expect(ULTRA_MODEL.cost).toBe(10);
		expect(getEngineCost("ultra")).toBe(10);
		expect(getEngineCost("krea")).toBe(1);
		expect(getEngineCost("ideogram")).toBe(3);
	});

	test("адреса Space разведены по движкам", () => {
		expect(getImageModel("krea").apiBase).toContain("krea-krea-2");
		expect(getImageModel("ideogram").apiBase).toContain(
			"ideogram-ai-ideogram4",
		);
	});

	test("resolveImageEngine: известное значение сохраняется, прочее → krea", () => {
		expect(resolveImageEngine("ideogram")).toBe("ideogram");
		expect(resolveImageEngine("krea")).toBe("krea");
		expect(resolveImageEngine("midjourney")).toBe("krea");
		expect(resolveImageEngine(undefined)).toBe("krea");
	});

	test("ultra — основной id, старый turbo принимается как алиас", () => {
		expect(resolveImageEngine("ultra", true)).toBe("ultra");
		expect(resolveImageEngine("turbo", true)).toBe("ultra");
	});

	test("режим ultra восстанавливается из нового и старого значения localStorage", () => {
		expect(parseGenerationMode("ultra")).toBe("ultra");
		expect(parseGenerationMode("turbo")).toBe("ultra");
		expect(parseGenerationMode("image")).toBe("image");
		expect(parseGenerationMode("unknown")).toBe("image");
	});

	test("ultra без рабочего входа Codex неотличим от неизвестного движка", () => {
		expect(resolveImageEngine("ultra")).toBe("krea");
		expect(resolveImageEngine("ultra", false)).toBe("krea");
		expect(resolveImageEngine("ultra", true)).toBe("ultra");
		expect(resolveImageEngine("ideogram", true)).toBe("ideogram");
	});

	test("isImageEngine и isSpaceEngine", () => {
		expect(isImageEngine("krea")).toBe(true);
		expect(isImageEngine("ideogram")).toBe(true);
		expect(isImageEngine("ultra")).toBe(true);
		expect(isImageEngine("turbo")).toBe(false);
		expect(isImageEngine("nope")).toBe(false);
		expect(isSpaceEngine("ultra")).toBe(false);
		expect(isSpaceEngine("krea")).toBe(true);
	});

	test("publicImageModels отдаёт только id, label и cost", () => {
		const list = publicImageModels();
		expect(new Set(list.map((m) => m.id))).toEqual(
			new Set(["krea", "ideogram"]),
		);
		for (const model of list) {
			expect(Object.keys(model).sort()).toEqual(["cost", "id", "label"]);
		}
	});

	test("Ультра и turbo-алиас попадают в список только когда она доступна", () => {
		expect(publicImageModels({ ultra: false }).map((m) => m.id)).toEqual([
			"krea",
			"ideogram",
		]);
		const withUltra = publicImageModels({ ultra: true });
		expect(withUltra.map((m) => String(m.id))).toEqual([
			"krea",
			"ideogram",
			"ultra",
			"turbo",
		]);
		expect(withUltra.at(-2)).toEqual({
			id: "ultra",
			label: "Ультра",
			cost: 10,
		});
		expect(withUltra.at(-1)).toEqual({
			id: "turbo",
			label: "Ультра",
			cost: 10,
		});
	});
});
