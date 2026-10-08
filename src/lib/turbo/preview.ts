import { TURBO_PREVIEW_QUALITY, TURBO_PREVIEW_SIZE } from "./constants";

/**
 * Копия изображения для агента: до 1024 пикселей по длинной стороне, WebP (сохраняет
 * прозрачность эмблем). Оригиналы остаются для рисования. Нужен Bun 1.4+ (`Bun.Image`).
 * Замер на картинках библиотеки: 3,2 МБ → 248 КБ, обычно 7–31 КБ.
 */
export async function makePreview(
	bytes: Uint8Array,
): Promise<{ mediaType: "image/webp"; bytes: Uint8Array }> {
	const out = await new Bun.Image(bytes)
		.resize(TURBO_PREVIEW_SIZE, TURBO_PREVIEW_SIZE, {
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: TURBO_PREVIEW_QUALITY })
		.bytes();
	return { mediaType: "image/webp", bytes: out };
}
