import { describe, expect, mock, test } from "bun:test";
import { CodexImageError } from "../turbo/codex-images";
import { Library } from "../turbo/library";
import {
	checkImageArguments,
	drawImage,
	type EditFn,
	readForAgent,
} from "../turbo/ops";
import { libraryStorage, RESULT_PNG } from "./helpers/turbo-fakes";

function setup(edit?: EditFn) {
	const library = new Library(libraryStorage());
	const editMock = mock<EditFn>(
		edit ??
			(async () => ({ png: RESULT_PNG, size: "1024x1536", quality: "medium" })),
	);
	return { library, edit: editMock };
}

describe("readForAgent", () => {
	test("изображение отдаётся уменьшенным WebP", async () => {
		const { library } = setup();
		const result = await readForAgent(library, "пятерка/a.png");
		expect(result).toMatchObject({
			ok: true,
			kind: "image",
			path: "пятерка/a.png",
			mediaType: "image/webp",
		});
		if (result.ok && result.kind === "image") {
			const bytes = Buffer.from(result.base64, "base64");
			expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
		}
	});

	test("текст отдаётся как есть, неверный путь — ошибка", async () => {
		const { library } = setup();
		expect(await readForAgent(library, "пятерка/описания.txt")).toMatchObject({
			ok: true,
			kind: "text",
			text: "a.png — первая",
		});
		expect(await readForAgent(library, "пятерка/нет.png")).toMatchObject({
			ok: false,
		});
	});
});

describe("checkImageArguments", () => {
	test("пустой промпт и неизвестный путь отклоняются с retryable", async () => {
		const { library } = setup();
		expect(
			await checkImageArguments(library, { prompt: "  ", images: [] }),
		).toEqual({ ok: false, retryable: true, error: "Пустой промпт" });
		const unknown = await checkImageArguments(library, {
			prompt: "x",
			images: ["пятерка/нет.png"],
		});
		expect(unknown).toMatchObject({ ok: false, retryable: true });
	});

	test("верные аргументы, в том числе без изображений, принимаются", async () => {
		const { library } = setup();
		expect(
			await checkImageArguments(library, { prompt: "x", images: [] }),
		).toEqual({ ok: true });
		expect(
			await checkImageArguments(library, {
				prompt: "x",
				images: ["пятерка/a.png"],
			}),
		).toEqual({ ok: true });
	});
});

describe("drawImage", () => {
	test("успех: ёлочки уходят генератору прямыми кавычками", async () => {
		const { library, edit } = setup();
		const drawn = await drawImage(
			{ library, edit },
			{
				prompt: "A pug holds a poster with the exact text «СЛАВА 42»",
				images: ["пятерка/a.png"],
			},
		);
		const expected = 'A pug holds a poster with the exact text "СЛАВА 42"';
		expect(edit.mock.calls[0]![0].prompt).toBe(expected);
		expect(drawn).toEqual({
			png: RESULT_PNG,
			size: "1024x1536",
			prompt: expected,
			inputImages: ["пятерка/a.png"],
		});
	});

	test("401 Codex Images — codex_auth_required, подробности сохранены", async () => {
		const { library, edit } = setup(async () => {
			throw new CodexImageError("Codex Images ответил 401", 401);
		});
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: ["пятерка/a.png"] },
		).catch((e) => e);
		expect(error.code).toBe("codex_auth_required");
		expect(error.details).toEqual({
			prompt: "x",
			inputImages: ["пятерка/a.png"],
		});
	});

	test("отказ Codex — generation_rejected", async () => {
		const { library, edit } = setup(async () => {
			throw new CodexImageError("Codex Images ответил 400: policy", 400);
		});
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: [] },
		).catch((e) => e);
		expect(error.code).toBe("generation_rejected");
	});

	test("срок вышел во время рисования — agent_timeout, а не generation_rejected", async () => {
		const { library, edit } = setup(async () => {
			throw new DOMException("aborted", "AbortError");
		});
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: [], signal: AbortSignal.abort() },
		).catch((e) => e);
		expect(error.code).toBe("agent_timeout");
	});

	test("неизвестный путь — generation_rejected, генератор не вызывается", async () => {
		const { library, edit } = setup();
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: ["пятерка/нет.png"] },
		).catch((e) => e);
		expect(error.code).toBe("generation_rejected");
		expect(edit).not.toHaveBeenCalled();
	});
});
