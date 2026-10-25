import { describe, expect, test } from "bun:test";
import {
	type AttachmentStorage,
	cleanupAttachments,
	completeAttachment,
	signAttachment,
} from "../ultra/attachment-upload";
import {
	ATTACHMENT_BAD_TEXT_ERROR,
	ATTACHMENT_FOREIGN_ERROR,
	ATTACHMENT_FORMAT_MISMATCH_ERROR,
	ATTACHMENT_TOO_BIG_ERROR,
	ATTACHMENT_TOO_MANY_ERROR,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "../ultra/attachments";
import { TINY_PNG } from "./helpers/ultra-fakes";

function makeStorage(initial: Record<string, Uint8Array> = {}) {
	const objects = new Map<string, { bytes: Uint8Array; lastModified: Date }>(
		Object.entries(initial).map(([key, bytes]) => [
			key,
			{ bytes, lastModified: new Date(1_700_000_000_000) },
		]),
	);
	const presigned: { key: string; expiresIn: number }[] = [];
	const deleted: string[] = [];
	const storage: AttachmentStorage = {
		list: async (prefix) =>
			[...objects.entries()]
				.filter(([key]) => key.startsWith(prefix))
				.map(([key, value]) => ({
					key,
					size: value.bytes.byteLength,
					lastModified: value.lastModified,
				})),
		read: async (key) => objects.get(key)?.bytes ?? null,
		delete: async (key) => {
			objects.delete(key);
			deleted.push(key);
		},
		presignUpload: (key, expiresIn) => {
			presigned.push({ key, expiresIn });
			return `https://s3.example/${key}?put`;
		},
	};
	return { storage, objects, presigned, deleted };
}

describe("signAttachment", () => {
	test("подписывает PUT и выбирает свободное имя", async () => {
		const { storage, presigned } = makeStorage();
		const result = await signAttachment(storage, {
			userId: "u1",
			scope: "scope-01",
			name: "кот.png",
			size: 1024,
		});
		expect(result).toEqual({
			ok: true,
			key: "attachments/u1/scope-01/кот.png",
			name: "кот.png",
			url: "https://s3.example/attachments/u1/scope-01/кот.png?put",
		});
		expect(presigned).toEqual([
			{ key: "attachments/u1/scope-01/кот.png", expiresIn: 300 },
		]);
	});

	test("лимит 5 файлов и 10 МБ", async () => {
		const initial: Record<string, Uint8Array> = {};
		for (let i = 0; i < MAX_ATTACHMENTS; i += 1) {
			initial[`attachments/u1/scope-01/f-${i}.png`] = TINY_PNG;
		}
		const { storage } = makeStorage(initial);
		expect(
			await signAttachment(storage, {
				userId: "u1",
				scope: "scope-01",
				name: "ещё.png",
				size: 10,
			}),
		).toMatchObject({
			ok: false,
			status: 409,
			error: ATTACHMENT_TOO_MANY_ERROR,
		});
		expect(
			await signAttachment(storage, {
				userId: "u1",
				scope: "scope-02",
				name: "big.png",
				size: MAX_ATTACHMENT_BYTES + 1,
			}),
		).toMatchObject({
			ok: false,
			status: 413,
			error: ATTACHMENT_TOO_BIG_ERROR,
		});
	});
});

describe("completeAttachment", () => {
	test("PNG проходит проверку", async () => {
		const { storage } = makeStorage({
			"attachments/u1/scope-01/ref.png": TINY_PNG,
		});
		expect(
			await completeAttachment(storage, {
				userId: "u1",
				scope: "scope-01",
				key: "attachments/u1/scope-01/ref.png",
			}),
		).toEqual({ ok: true, file: { name: "ref.png", kind: "image" } });
	});

	test("PNG с расширением .jpg удаляется и отклоняется", async () => {
		const key = "attachments/u1/scope-01/ref.jpg";
		const { storage, objects } = makeStorage({ [key]: TINY_PNG });
		expect(
			await completeAttachment(storage, {
				userId: "u1",
				scope: "scope-01",
				key,
			}),
		).toMatchObject({
			ok: false,
			status: 400,
			error: ATTACHMENT_FORMAT_MISMATCH_ERROR,
		});
		expect(objects.has(key)).toBe(false);
	});

	test("битый текст удаляется", async () => {
		const key = "attachments/u1/scope-01/bad.txt";
		const { storage, objects } = makeStorage({
			[key]: new Uint8Array([0xff, 0xfe]),
		});
		expect(
			await completeAttachment(storage, {
				userId: "u1",
				scope: "scope-01",
				key,
			}),
		).toMatchObject({
			ok: false,
			status: 400,
			error: ATTACHMENT_BAD_TEXT_ERROR,
		});
		expect(objects.has(key)).toBe(false);
	});

	test("чужой ключ не читается", async () => {
		const { storage } = makeStorage({
			"attachments/u2/scope-01/ref.png": TINY_PNG,
		});
		expect(
			await completeAttachment(storage, {
				userId: "u1",
				scope: "scope-01",
				key: "attachments/u2/scope-01/ref.png",
			}),
		).toMatchObject({
			ok: false,
			status: 403,
			error: ATTACHMENT_FOREIGN_ERROR,
		});
	});
});

describe("cleanupAttachments", () => {
	test("удаляет только старые объекты вложений", async () => {
		const oldKey = "attachments/u1/old/ref.png";
		const freshKey = "attachments/u1/fresh/ref.png";
		const now = 1_700_000_000_000;
		const { storage, objects } = makeStorage({
			[oldKey]: TINY_PNG,
			[freshKey]: TINY_PNG,
		});
		objects.get(oldKey)!.lastModified = new Date(now - 25 * 60 * 60 * 1000);
		objects.get(freshKey)!.lastModified = new Date(now - 60 * 60 * 1000);
		expect(await cleanupAttachments(storage, now)).toBe(1);
		expect(objects.has(oldKey)).toBe(false);
		expect(objects.has(freshKey)).toBe(true);
	});
});
