import { describe, expect, test } from "bun:test";
import {
	getImageModel,
	isImageEngine,
	publicImageModels,
	resolveImageEngine,
} from "../models";

describe("Image models", () => {
	test("Ideogram 4 дороже Krea 2", () => {
		expect(getImageModel("krea").cost).toBe(1);
		expect(getImageModel("ideogram").cost).toBe(3);
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

	test("isImageEngine", () => {
		expect(isImageEngine("krea")).toBe(true);
		expect(isImageEngine("ideogram")).toBe(true);
		expect(isImageEngine("nope")).toBe(false);
	});

	test("publicImageModels отдаёт только id, label и cost", () => {
		const list = publicImageModels();
		expect(list.map((m) => m.id)).toEqual(["krea", "ideogram"]);
		for (const model of list) {
			expect(Object.keys(model).sort()).toEqual(["cost", "id", "label"]);
		}
	});
});
