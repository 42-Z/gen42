import { readObject, uploadImage } from "./storage";

/** Длинная сторона превью галереи: карточка сетки не шире ~600 px даже на плотных экранах */
export const THUMB_SIZE = 640;
export const THUMB_QUALITY = 80;

/** Ключ превью рядом с оригиналом: `generations/<user>/<ts>.png` → `thumbs/generations/<user>/<ts>.webp` */
export function thumbKey(imageKey: string): string {
	return `thumbs/${imageKey.replace(/\.[^./]+$/, "")}.webp`;
}

/** Уменьшенная WebP-копия для галереи. Нужен Bun 1.4+ (`Bun.Image`) */
export async function makeThumb(bytes: Uint8Array): Promise<Uint8Array> {
	return new Bun.Image(bytes)
		.resize(THUMB_SIZE, THUMB_SIZE, {
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: THUMB_QUALITY })
		.bytes();
}

/**
 * Кладёт превью рядом с оригиналом. Сбой не критичен — превью досоздастся при первом
 * запросе галереи (`getOrCreateThumb`), поэтому ошибка только логируется.
 */
export async function storeThumb(
	imageKey: string,
	original: Uint8Array,
): Promise<void> {
	try {
		const thumb = await makeThumb(original);
		await uploadImage(thumbKey(imageKey), Buffer.from(thumb), "image/webp");
	} catch (error) {
		console.warn(`Не удалось сохранить превью для ${imageKey}:`, error);
	}
}

/** Превью из хранилища; для картинок, созданных до появления превью, строит его из оригинала */
export async function getOrCreateThumb(
	imageKey: string,
): Promise<Uint8Array | null> {
	const existing = await readObject(thumbKey(imageKey));
	if (existing) return existing;
	const original = await readObject(imageKey);
	if (!original) return null;
	const thumb = await makeThumb(original);
	await uploadImage(thumbKey(imageKey), Buffer.from(thumb), "image/webp").catch(
		(error) => console.warn(`Не удалось сохранить превью ${imageKey}:`, error),
	);
	return thumb;
}
