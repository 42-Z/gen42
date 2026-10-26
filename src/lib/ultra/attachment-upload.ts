import { isClientId } from "../generation-id";
import {
	ATTACHMENT_BAD_TEXT_ERROR,
	ATTACHMENT_BAD_TYPE_ERROR,
	ATTACHMENT_BROKEN_IMAGE_ERROR,
	ATTACHMENT_EMPTY_ERROR,
	ATTACHMENT_FOREIGN_ERROR,
	ATTACHMENT_FORMAT_MISMATCH_ERROR,
	ATTACHMENT_NOT_FOUND_ERROR,
	ATTACHMENT_READ_ERROR,
	ATTACHMENT_SIGN_ERROR,
	ATTACHMENT_TOO_BIG_ERROR,
	ATTACHMENT_TOO_MANY_ERROR,
	attachmentKindOf,
	attachmentsPrefix,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENT_TEXT_BYTES,
	MAX_ATTACHMENTS,
	sanitizeAttachmentName,
	uniqueAttachmentName,
} from "./attachments";
import { extensionOf } from "./file-kind";

export interface AttachmentObject {
	key: string;
	size: number;
	lastModified?: Date | null;
}

export interface AttachmentStorage {
	list(prefix: string): Promise<AttachmentObject[]>;
	read(key: string): Promise<Uint8Array | null>;
	delete(key: string): Promise<void>;
	presignUpload(key: string, expiresIn: number): string;
}

export type SignAttachmentResult =
	| { ok: true; key: string; name: string; url: string }
	| { ok: false; status: 400 | 409 | 413 | 500; error: string };

export type CompleteAttachmentResult =
	| { ok: true; file: { name: string; kind: "image" | "text" } }
	| { ok: false; status: 400 | 403 | 409 | 413 | 500; error: string };

const PRESIGN_EXPIRES_SECONDS = 300;
const MAX_ATTACHMENT_PIXELS = 100_000_000;

async function remove(
	storage: Pick<AttachmentStorage, "delete">,
	key: string,
): Promise<void> {
	try {
		await storage.delete(key);
	} catch (error) {
		console.error("Не удалось удалить вложение:", error);
	}
}

function directNames(objects: AttachmentObject[], prefix: string): Set<string> {
	return new Set(
		objects
			.map(({ key }) => key.slice(prefix.length))
			.filter((name) => name && !name.includes("/")),
	);
}

export async function signAttachment(
	storage: AttachmentStorage,
	params: { userId: string; scope: string; name: string; size: number },
): Promise<SignAttachmentResult> {
	if (!isClientId(params.scope)) {
		return { ok: false, status: 400, error: "Некорректная папка вложений" };
	}
	const name = sanitizeAttachmentName(params.name);
	const kind = attachmentKindOf(name);
	if (!kind) {
		return { ok: false, status: 400, error: ATTACHMENT_BAD_TYPE_ERROR };
	}
	if (!Number.isFinite(params.size) || params.size <= 0) {
		return { ok: false, status: 400, error: ATTACHMENT_EMPTY_ERROR };
	}
	const limit =
		kind === "image" ? MAX_ATTACHMENT_BYTES : MAX_ATTACHMENT_TEXT_BYTES;
	if (params.size > limit) {
		return { ok: false, status: 413, error: ATTACHMENT_TOO_BIG_ERROR };
	}

	const prefix = attachmentsPrefix(params.userId, params.scope);
	let objects: AttachmentObject[];
	try {
		objects = await storage.list(prefix);
	} catch (error) {
		console.error("Не удалось прочитать вложения:", error);
		return { ok: false, status: 500, error: ATTACHMENT_READ_ERROR };
	}
	const names = directNames(objects, prefix);
	if (names.size >= MAX_ATTACHMENTS) {
		return { ok: false, status: 409, error: ATTACHMENT_TOO_MANY_ERROR };
	}
	const finalName = uniqueAttachmentName(name, names);
	const key = `${prefix}${finalName}`;
	try {
		const url = storage.presignUpload(key, PRESIGN_EXPIRES_SECONDS);
		return { ok: true, key, name: finalName, url };
	} catch (error) {
		console.error("Не удалось подписать загрузку:", error);
		return { ok: false, status: 500, error: ATTACHMENT_SIGN_ERROR };
	}
}

export async function completeAttachment(
	storage: AttachmentStorage,
	params: { userId: string; scope: string; key: string },
): Promise<CompleteAttachmentResult> {
	if (!isClientId(params.scope)) {
		return { ok: false, status: 400, error: "Некорректная папка вложений" };
	}
	const prefix = attachmentsPrefix(params.userId, params.scope);
	if (!params.key.startsWith(prefix)) {
		return { ok: false, status: 403, error: ATTACHMENT_FOREIGN_ERROR };
	}
	const name = params.key.slice(prefix.length);
	if (!name || name.includes("/")) {
		return { ok: false, status: 400, error: ATTACHMENT_READ_ERROR };
	}
	const kind = attachmentKindOf(name);
	if (!kind) {
		await remove(storage, params.key);
		return { ok: false, status: 400, error: ATTACHMENT_BAD_TYPE_ERROR };
	}

	let bytes: Uint8Array | null;
	try {
		bytes = await storage.read(params.key);
	} catch (error) {
		console.error("Не удалось прочитать вложение:", error);
		return { ok: false, status: 500, error: ATTACHMENT_READ_ERROR };
	}
	if (!bytes) {
		return { ok: false, status: 400, error: ATTACHMENT_NOT_FOUND_ERROR };
	}
	const limit =
		kind === "image" ? MAX_ATTACHMENT_BYTES : MAX_ATTACHMENT_TEXT_BYTES;
	if (bytes.byteLength > limit) {
		await remove(storage, params.key);
		return { ok: false, status: 413, error: ATTACHMENT_TOO_BIG_ERROR };
	}

	if (kind === "image") {
		let metadata: Awaited<ReturnType<Bun.Image["metadata"]>>;
		try {
			metadata = await new Bun.Image(bytes, {
				maxPixels: MAX_ATTACHMENT_PIXELS,
			}).metadata();
		} catch {
			await remove(storage, params.key);
			return {
				ok: false,
				status: 400,
				error: ATTACHMENT_BROKEN_IMAGE_ERROR,
			};
		}
		const expected = metadata.format === "jpeg" ? "jpg" : metadata.format;
		const extension = extensionOf(name);
		const matches =
			extension === expected || (expected === "jpg" && extension === "jpeg");
		const known = ["png", "jpeg", "webp"].includes(metadata.format);
		if (!known || !matches) {
			await remove(storage, params.key);
			return {
				ok: false,
				status: 400,
				error: ATTACHMENT_FORMAT_MISMATCH_ERROR,
			};
		}
	} else {
		try {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
			if (text.includes("\0")) throw new Error("binary");
		} catch {
			await remove(storage, params.key);
			return { ok: false, status: 400, error: ATTACHMENT_BAD_TEXT_ERROR };
		}
	}

	let objects: AttachmentObject[];
	try {
		objects = await storage.list(prefix);
	} catch (error) {
		console.error("Не удалось прочитать вложения:", error);
		return { ok: false, status: 500, error: ATTACHMENT_READ_ERROR };
	}
	if (directNames(objects, prefix).size > MAX_ATTACHMENTS) {
		await remove(storage, params.key);
		return { ok: false, status: 409, error: ATTACHMENT_TOO_MANY_ERROR };
	}
	return { ok: true, file: { name, kind } };
}

export const ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

export async function cleanupAttachments(
	storage: Pick<AttachmentStorage, "list" | "delete">,
	now = Date.now(),
): Promise<number> {
	const objects = await storage.list("attachments/");
	let removed = 0;
	for (const object of objects) {
		const modified = object.lastModified?.getTime() ?? 0;
		if (!modified || modified >= now - ATTACHMENT_TTL_MS) continue;
		await storage.delete(object.key);
		removed += 1;
	}
	return removed;
}
