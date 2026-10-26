import { type FileKind, kindOf } from "./file-kind";

export const ATTACHMENTS_PREFIX = "attachments/";
export const ATTACHMENTS_FOLDER = "вложения";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_TEXT_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 120_000;
export const MAX_ATTACHMENT_NAME_LENGTH = 120;

export const ATTACHMENT_TOO_MANY_ERROR = `Можно приложить не больше ${MAX_ATTACHMENTS} файлов`;
export const ATTACHMENT_TOO_BIG_ERROR = "Файл больше 10 МБ";
export const ATTACHMENT_EMPTY_ERROR = "Файл пустой";
export const ATTACHMENT_BAD_TYPE_ERROR =
	"Подходят изображения PNG, JPEG, WebP и текст TXT, MD";
export const ATTACHMENT_BROKEN_IMAGE_ERROR =
	"Файл повреждён или это не изображение PNG, JPEG, WebP";
export const ATTACHMENT_FORMAT_MISMATCH_ERROR =
	"Расширение файла не совпадает с форматом изображения";
export const ATTACHMENT_BAD_TEXT_ERROR = "Текст должен быть в кодировке UTF-8";
export const ATTACHMENT_NOT_FOUND_ERROR = "Файл не найден";
export const ATTACHMENT_FOREIGN_ERROR = "Чужой файл";
export const ATTACHMENT_READ_ERROR = "Не удалось прочитать файл";
export const ATTACHMENT_SIGN_ERROR = "Не удалось подготовить загрузку";

export function attachmentsPrefix(userId: string, scope: string): string {
	return `${ATTACHMENTS_PREFIX}${userId}/${scope}/`;
}

export function attachmentKindOf(name: string): FileKind | null {
	return kindOf(name);
}

/**
 * Имя файла вложения: без путей и управляющих символов, с сохранённым
 * расширением. Хранилище и агент видят одно и то же имя.
 */
export function sanitizeAttachmentName(raw: string): string {
	const withoutControls = Array.from(raw.normalize("NFC"))
		.filter((char) => {
			const code = char.codePointAt(0) ?? 0;
			return code > 0x1f && code !== 0x7f;
		})
		.join("");
	const clean = withoutControls
		.replace(/[\\/]+/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	if (!clean || clean === "." || clean === "..") return "attachment";
	const dot = clean.lastIndexOf(".");
	const hasExtension = dot > 0 && dot < clean.length - 1;
	const extension = hasExtension ? clean.slice(dot).toLowerCase() : "";
	const stem = hasExtension ? clean.slice(0, dot) : clean;
	const maxStem = Math.max(1, MAX_ATTACHMENT_NAME_LENGTH - extension.length);
	const trimmedStem = stem
		.slice(0, maxStem)
		.replace(/[. ]+$/, "")
		.trim();
	return `${trimmedStem || "attachment"}${extension}`;
}

/** Свободное имя в папке: второй файл с тем же именем становится `-2` */
export function uniqueAttachmentName(name: string, taken: Set<string>): string {
	if (!taken.has(name)) return name;
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot) : "";
	for (let index = 2; index <= MAX_ATTACHMENTS + 1; index += 1) {
		const candidate = `${stem}-${index}${extension}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${stem}-${Date.now()}${extension}`;
}

export function truncateAttachmentText(text: string): {
	text: string;
	truncated: boolean;
	total: number;
} {
	if (text.length <= MAX_TEXT_CHARS) {
		return { text, truncated: false, total: text.length };
	}
	return {
		text: text.slice(0, MAX_TEXT_CHARS),
		truncated: true,
		total: text.length,
	};
}
