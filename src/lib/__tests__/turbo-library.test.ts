import { describe, expect, mock, test } from "bun:test";
import {
	closestNames,
	Library,
	type LibraryStorage,
	MAX_INPUT_IMAGES,
	parseLibraryPath,
	pluralImages,
	pluralTexts,
} from "../turbo/library";

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function makeStorage(extra: Record<string, Uint8Array> = {}) {
	const objects: Record<string, Uint8Array> = {
		"library/пятерка/a.png": PNG,
		"library/пятерка/b.png": PNG,
		"library/пятерка/описания.txt": new TextEncoder().encode(
			"a.png — первая\nb.png — вторая",
		),
		"library/эмблемы/flag_of_42.png": PNG,
		"library/скриншоты/описания.txt": new Uint8Array(),
		...extra,
	};
	const list = mock(async (prefix: string) =>
		Object.entries(objects)
			.filter(([key]) => key.startsWith(prefix))
			.map(([key, bytes]) => ({ key, size: bytes.byteLength })),
	);
	const read = mock(async (key: string) => objects[key] ?? null);
	return { storage: { list, read } satisfies LibraryStorage, list, read };
}

describe("parseLibraryPath", () => {
	test("принимает только «папка/файл»", () => {
		expect(parseLibraryPath("пятерка/a.png")).toEqual({
			folder: "пятерка",
			name: "a.png",
		});
		for (const bad of [
			"",
			"a.png",
			"../a.png",
			"пятерка/../a.png",
			"/пятерка/a.png",
			"пятерка/вложенная/a.png",
			"пятерка\\a.png",
			"пятерка/",
			"./a.png",
		]) {
			expect(parseLibraryPath(bad)).toBeNull();
		}
	});

	test("приводит имя к NFC", () => {
		const decomposed = "эмблемы/й.png";
		expect(parseLibraryPath(decomposed)?.name).toBe("й.png");
	});
});

describe("pluralImages", () => {
	test("склоняет число изображений", () => {
		expect(pluralImages(1)).toBe("1 изображение");
		expect(pluralImages(2)).toBe("2 изображения");
		expect(pluralImages(5)).toBe("5 изображений");
		expect(pluralImages(11)).toBe("11 изображений");
		expect(pluralImages(21)).toBe("21 изображение");
		expect(pluralImages(0)).toBe("0 изображений");
	});
});

describe("pluralTexts", () => {
	test("склоняет число текстов", () => {
		expect(pluralTexts(1)).toBe("1 текст");
		expect(pluralTexts(2)).toBe("2 текста");
		expect(pluralTexts(5)).toBe("5 текстов");
		expect(pluralTexts(11)).toBe("11 текстов");
		expect(pluralTexts(21)).toBe("21 текст");
		expect(pluralTexts(0)).toBe("0 текстов");
		expect(pluralTexts(12)).toBe("12 текстов");
		expect(pluralTexts(22)).toBe("22 текста");
	});
});

describe("closestNames", () => {
	test("ставит похожие имена первыми", () => {
		expect(
			closestNames("flag_of_42.pn", ["a.png", "flag_of_42.png"], 1),
		).toEqual(["flag_of_42.png"]);
	});
});

describe("Library", () => {
	test("дерево: папки, число изображений, пустые помечены", async () => {
		const { storage } = makeStorage();
		const tree = await new Library(storage).describeTree();
		expect(tree).toBe(
			[
				"пятерка/ — 2 изображения",
				"скриншоты/ — пусто",
				"эмблемы/ — 1 изображение",
			].join("\n"),
		);
	});

	test("дерево: тексты считаются отдельно, а описания.txt текстом не считается", async () => {
		const line = new TextEncoder().encode("строка");
		const { storage } = makeStorage({
			"library/альбом/cover.png": PNG,
			"library/альбом/описания.txt": new Uint8Array(),
			"library/альбом/track_1.txt": line,
			"library/альбом/track_2.txt": line,
			"library/песни/описания.txt": new Uint8Array(),
			"library/песни/track_3.txt": line,
		});
		const lines = (await new Library(storage).describeTree()).split("\n");
		expect(lines).toContain("альбом/ — 1 изображение, 2 текста");
		expect(lines).toContain("песни/ — 1 текст");
		expect(lines).toContain("скриншоты/ — пусто");
	});

	test("список кэшируется на минуту", async () => {
		const { storage, list } = makeStorage();
		let now = 1_000;
		const library = new Library(storage, () => now);
		await library.describeTree();
		await library.listFolder("пятерка");
		expect(list).toHaveBeenCalledTimes(1);
		now += 61_000;
		await library.describeTree();
		expect(list).toHaveBeenCalledTimes(2);
	});

	test("listFolder отдаёт файлы с типом, неизвестная папка — список папок", async () => {
		const library = new Library(makeStorage().storage);
		const ok = await library.listFolder("пятерка");
		expect(ok).toEqual({
			ok: true,
			path: "пятерка",
			files: [
				{ name: "a.png", kind: "image" },
				{ name: "b.png", kind: "image" },
				{ name: "описания.txt", kind: "text" },
			],
		});
		const missing = await library.listFolder("люди");
		expect(missing.ok).toBe(false);
		if (!missing.ok) {
			expect(missing.folders).toEqual(["пятерка", "скриншоты", "эмблемы"]);
		}
	});

	test("readFile: текст возвращается строкой, изображение — base64", async () => {
		const library = new Library(makeStorage().storage);
		const text = await library.readFile("пятерка/описания.txt");
		expect(text).toEqual({
			ok: true,
			kind: "text",
			path: "пятерка/описания.txt",
			text: "a.png — первая\nb.png — вторая",
		});
		const image = await library.readFile("пятерка/a.png");
		expect(image).toEqual({
			ok: true,
			kind: "image",
			path: "пятерка/a.png",
			mediaType: "image/png",
			base64: Buffer.from(PNG).toString("base64"),
		});
	});

	test("readFile: нет файла — ошибка с ближайшими именами", async () => {
		const library = new Library(makeStorage().storage);
		const result = await library.readFile("пятерка/a.pn");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.nearest[0]).toBe("a.png");
		}
	});

	test("readFile: путь вне формата не доходит до хранилища", async () => {
		const { storage, read } = makeStorage();
		const result = await new Library(storage).readFile("../.env");
		expect(result.ok).toBe(false);
		expect(read).not.toHaveBeenCalled();
	});

	test("resolveImages: сохраняет порядок и отдаёт байты", async () => {
		const library = new Library(makeStorage().storage);
		const result = await library.resolveImages([
			"эмблемы/flag_of_42.png",
			"пятерка/b.png",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.images.map((image) => image.path)).toEqual([
				"эмблемы/flag_of_42.png",
				"пятерка/b.png",
			]);
			expect(result.images[0]!.bytes).toEqual(PNG);
			expect(result.images[0]!.mediaType).toBe("image/png");
		}
	});

	test("resolveImages: повтор файла разрешён, пустой список тоже", async () => {
		const library = new Library(makeStorage().storage);
		const twice = await library.resolveImages([
			"пятерка/a.png",
			"пятерка/a.png",
		]);
		expect(twice.ok && twice.images.length).toBe(2);
		expect(await library.resolveImages([])).toEqual({ ok: true, images: [] });
	});

	test("resolveImages: больше лимита и несуществующие пути отклоняются", async () => {
		const library = new Library(makeStorage().storage);
		const tooMany = await library.resolveImages(
			Array.from({ length: MAX_INPUT_IMAGES + 1 }, () => "пятерка/a.png"),
		);
		expect(tooMany.ok).toBe(false);
		const broken = await library.resolveImages([
			"пятерка/a.png",
			"пятерка/нет.png",
			"пятерка/описания.txt",
		]);
		expect(broken.ok).toBe(false);
		if (!broken.ok) {
			expect(broken.error).toContain("нет.png");
			expect(broken.error).toContain("не изображение");
		}
	});
});
