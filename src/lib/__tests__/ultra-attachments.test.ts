import { describe, expect, test } from "bun:test";
import {
	attachmentsPrefix,
	MAX_TEXT_CHARS,
	sanitizeAttachmentName,
	truncateAttachmentText,
	uniqueAttachmentName,
} from "../ultra/attachments";
import { imageMediaType, kindOf } from "../ultra/file-kind";

describe("файлы вложений", () => {
	test("картинки и текст, md тоже текст", () => {
		expect(kindOf("ref.png")).toBe("image");
		expect(kindOf("ref.JPG")).toBe("image");
		expect(kindOf("ref.webp")).toBe("image");
		expect(kindOf("song.txt")).toBe("text");
		expect(kindOf("song.md")).toBe("text");
		expect(kindOf("song.pdf")).toBeNull();
		expect(imageMediaType("ref.jpeg")).toBe("image/jpeg");
	});

	test("имя чистится от путей и управляющих символов", () => {
		expect(sanitizeAttachmentName("../моя кошка.png")).toBe("..-моя кошка.png");
		expect(sanitizeAttachmentName("файл\u0000\n.png")).toBe("файл.png");
		expect(sanitizeAttachmentName("...")).toBe("attachment");
		expect(sanitizeAttachmentName("файл...")).toBe("файл");
		expect(sanitizeAttachmentName("")).toBe("attachment");
	});

	test("одинаковые имена получают суффикс", () => {
		const taken = new Set(["кот.png"]);
		expect(uniqueAttachmentName("кот.png", taken)).toBe("кот-2.png");
		taken.add("кот-2.png");
		expect(uniqueAttachmentName("кот.png", taken)).toBe("кот-3.png");
	});

	test("префикс папки привязан к пользователю и запуску", () => {
		expect(attachmentsPrefix("u1", "scope-1")).toBe("attachments/u1/scope-1/");
	});

	test("текст обрезается для агента, но файл остаётся целым", () => {
		const long = "а".repeat(MAX_TEXT_CHARS + 1);
		const result = truncateAttachmentText(long);
		expect(result.truncated).toBe(true);
		expect(result.text).toHaveLength(MAX_TEXT_CHARS);
		expect(result.total).toBe(MAX_TEXT_CHARS + 1);
		expect(truncateAttachmentText("короткий").truncated).toBe(false);
	});
});
