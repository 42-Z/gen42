import { readObject, uploadImage } from "./storage";

/** Длинная сторона превью галереи: карточка сетки не шире ~600 px даже на плотных экранах */
export const THUMB_SIZE = 640;
export const THUMB_QUALITY = 80;
export const PREVIEW_SIZE = 1600;
export const PREVIEW_QUALITY = 90;

/** Ключ превью рядом с оригиналом: `generations/<user>/<ts>.png` → `thumbs/generations/<user>/<ts>.webp` */
export function thumbKey(imageKey: string): string {
	return `thumbs/${imageKey.replace(/\.[^./]+$/, "")}.webp`;
}

/** Версия ключа меняется вместе с параметрами крупного превью. */
export function previewKey(imageKey: string): string {
	return `previews/v1/${imageKey.replace(/\.[^./]+$/, "")}.webp`;
}

/** Уменьшенная WebP-копия для галереи. Нужен Bun 1.4+ (`Bun.Image`) */
export async function makeThumb(bytes: Uint8Array): Promise<Uint8Array> {
	return makeVariant(bytes, THUMB_SIZE, THUMB_QUALITY);
}

/** WebP для готовой рамки и просмотра, без увеличения небольших оригиналов. */
export async function makePreview(bytes: Uint8Array): Promise<Uint8Array> {
	return makeVariant(bytes, PREVIEW_SIZE, PREVIEW_QUALITY);
}

async function makeVariant(
	bytes: Uint8Array,
	size: number,
	quality: number,
): Promise<Uint8Array> {
	return new Bun.Image(bytes)
		.resize(size, size, {
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality })
		.bytes();
}

interface ImageVariant {
	key: (imageKey: string) => string;
	make: (original: Uint8Array) => Promise<Uint8Array>;
}

export function createImageVariantStorage(
	deps: {
		readObject: (key: string) => Promise<Uint8Array | null>;
		uploadImage: (
			key: string,
			bytes: Buffer,
			contentType: string,
		) => Promise<void>;
		warn?: (message: string, error: unknown) => void;
	},
	variants: { thumb: ImageVariant; preview: ImageVariant },
) {
	const inFlight = new Map<string, Promise<Uint8Array | null>>();
	const warn = deps.warn ?? console.warn;

	async function save(key: string, bytes: Uint8Array): Promise<void> {
		await deps.uploadImage(key, Buffer.from(bytes), "image/webp");
	}

	async function storeVariant(
		imageKey: string,
		original: Uint8Array,
		variant: ImageVariant,
	): Promise<void> {
		const key = variant.key(imageKey);
		try {
			await save(key, await variant.make(original));
		} catch (error) {
			warn(`Не удалось сохранить превью ${key}:`, error);
		}
	}

	async function load(
		imageKey: string,
		key: string,
		variant: ImageVariant,
	): Promise<Uint8Array | null> {
		const existing = await deps.readObject(key);
		if (existing) return existing;
		const original = await deps.readObject(imageKey);
		if (!original) return null;
		const bytes = await variant.make(original);
		await save(key, bytes).catch((error) =>
			warn(`Не удалось сохранить превью ${key}:`, error),
		);
		return bytes;
	}

	function getOrCreate(imageKey: string, variant: ImageVariant) {
		const key = variant.key(imageKey);
		const existing = inFlight.get(key);
		if (existing) return existing;
		const pending = load(imageKey, key, variant).finally(() =>
			inFlight.delete(key),
		);
		inFlight.set(key, pending);
		return pending;
	}

	return {
		async storeThumb(imageKey: string, original: Uint8Array): Promise<void> {
			await Promise.all([
				storeVariant(imageKey, original, variants.thumb),
				storeVariant(imageKey, original, variants.preview),
			]);
		},
		getOrCreateThumb: (imageKey: string) =>
			getOrCreate(imageKey, variants.thumb),
		getOrCreatePreview: (imageKey: string) =>
			getOrCreate(imageKey, variants.preview),
	};
}

/** Оба варианта сохраняются независимо; отсутствующие копии достраиваются лениво. */
export const { storeThumb, getOrCreateThumb, getOrCreatePreview } =
	createImageVariantStorage(
		{ readObject, uploadImage },
		{
			thumb: { key: thumbKey, make: makeThumb },
			preview: { key: previewKey, make: makePreview },
		},
	);
