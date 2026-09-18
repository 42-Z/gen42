/** Расширение файла по MIME-типу картинки, полученному от движка */
export function imageExtension(contentType: string | null | undefined): string {
	const type = (contentType ?? "").toLowerCase();
	if (type.includes("webp")) return "webp";
	if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
	if (type.includes("gif")) return "gif";
	return "png";
}

/** Нормализует Content-Type без параметров (charset и т.п.) */
export function normalizeContentType(
	contentType: string | null | undefined,
): string {
	const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	return type.startsWith("image/") ? type : "image/png";
}
