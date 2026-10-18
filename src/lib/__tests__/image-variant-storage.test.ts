import { describe, expect, test } from "bun:test";
import * as thumbnails from "../thumbnails";
import { TINY_PNG } from "./helpers/ultra-fakes";

const IMAGE = "generations/u1/image.png";
const THUMB = "thumbs/generations/u1/image.webp";
const PREVIEW = "previews/v1/generations/u1/image.webp";

function fixture() {
	const objects = new Map<string, Uint8Array>([[IMAGE, TINY_PNG]]);
	const reads: string[] = [];
	const writes: { key: string; contentType: string }[] = [];
	const warnings: unknown[][] = [];
	const deps = {
		readObject: async (key: string): Promise<Uint8Array | null> => {
			reads.push(key);
			return objects.get(key) ?? null;
		},
		uploadImage: async (key: string, bytes: Buffer, contentType: string) => {
			writes.push({ key, contentType });
			objects.set(key, new Uint8Array(bytes));
		},
		warn: (...args: unknown[]) => {
			warnings.push(args);
		},
	};
	const variants = {
		thumb: { key: thumbnails.thumbKey, make: thumbnails.makeThumb },
		preview: { key: thumbnails.previewKey, make: thumbnails.makePreview },
	};
	return { objects, reads, writes, warnings, deps, variants };
}

function createStore(f: ReturnType<typeof fixture>) {
	expect(thumbnails.createImageVariantStorage).toBeFunction();
	return thumbnails.createImageVariantStorage(f.deps, f.variants);
}

describe("storeThumb: оба варианта", () => {
	test("сохраняет thumbnail и preview как WebP, не перезаписывая оригинал", async () => {
		const f = fixture();
		const original = await new Bun.Image(TINY_PNG)
			.resize(2000, 1000)
			.png()
			.bytes();
		f.objects.set(IMAGE, original);
		const before = original.slice();
		await createStore(f).storeThumb(IMAGE, original);
		expect(f.writes.map(({ key }) => key).sort()).toEqual([PREVIEW, THUMB]);
		expect(
			f.writes.every(({ contentType }) => contentType === "image/webp"),
		).toBe(true);
		expect(await new Bun.Image(f.objects.get(THUMB)!).metadata()).toMatchObject(
			{
				width: 640,
				height: 320,
				format: "webp",
			},
		);
		expect(
			await new Bun.Image(f.objects.get(PREVIEW)!).metadata(),
		).toMatchObject({
			width: 1600,
			height: 800,
			format: "webp",
		});
		expect(f.objects.get(IMAGE)).toEqual(before);
		expect(original).toEqual(before);
		expect(f.reads).toEqual([]);
	});

	for (const failing of ["thumb", "preview"] as const) {
		for (const phase of ["encode", "upload"] as const) {
			test(`сбой ${phase} ${failing} не мешает другому варианту`, async () => {
				const f = fixture();
				const failedKey = failing === "thumb" ? THUMB : PREVIEW;
				const goodKey = failing === "thumb" ? PREVIEW : THUMB;
				if (phase === "encode") {
					f.variants[failing].make = async () => {
						throw new Error("encode failed");
					};
				} else {
					const upload = f.deps.uploadImage;
					f.deps.uploadImage = async (key, bytes, contentType) => {
						if (key === failedKey) throw new Error("upload failed");
						await upload(key, bytes, contentType);
					};
				}
				await expect(
					createStore(f).storeThumb(IMAGE, TINY_PNG),
				).resolves.toBeUndefined();
				expect(f.objects.has(failedKey)).toBe(false);
				expect(
					await new Bun.Image(f.objects.get(goodKey)!).metadata(),
				).toMatchObject({ format: "webp" });
				expect(f.warnings).toHaveLength(1);
			});
		}
	}
});

for (const [variant, method, variantKey] of [
	["thumb", "getOrCreateThumb", THUMB],
	["preview", "getOrCreatePreview", PREVIEW],
] as const) {
	describe(method, () => {
		test("возвращает готовый объект без чтения оригинала и encode", async () => {
			const f = fixture();
			const existing = await thumbnails.makePreview(TINY_PNG);
			f.objects.set(variantKey, existing);
			f.variants[variant].make = async () => {
				throw new Error("must not encode");
			};
			expect(await createStore(f)[method](IMAGE)).toEqual(existing);
			expect(f.reads).toEqual([variantKey]);
			expect(f.writes).toEqual([]);
		});

		test("для старого изображения строит и сохраняет только запрошенный вариант", async () => {
			const f = fixture();
			const bytes = await createStore(f)[method](IMAGE);
			expect(bytes).not.toBeNull();
			expect(await new Bun.Image(bytes!).metadata()).toMatchObject({
				format: "webp",
			});
			expect(f.objects.get(variantKey)).toEqual(bytes!);
			expect(f.reads).toEqual([variantKey, IMAGE]);
			expect(f.writes).toEqual([
				{ key: variantKey, contentType: "image/webp" },
			]);
		});

		test("отсутствующий оригинал даёт null, а не постоянный отрицательный кеш", async () => {
			const f = fixture();
			f.objects.clear();
			const api = createStore(f);
			expect(await api[method](IMAGE)).toBeNull();
			expect(f.writes).toEqual([]);
			f.objects.set(IMAGE, TINY_PNG);
			expect(await api[method](IMAGE)).not.toBeNull();
		});

		test("сбой сохранения не теряет готовые байты и разрешает повторную попытку", async () => {
			const f = fixture();
			const upload = f.deps.uploadImage;
			let attempts = 0;
			f.deps.uploadImage = async (key, bytes, contentType) => {
				if (++attempts === 1) throw new Error("storage unavailable");
				await upload(key, bytes, contentType);
			};
			const api = createStore(f);
			const bytes = await api[method](IMAGE);
			expect(await new Bun.Image(bytes!).metadata()).toMatchObject({
				format: "webp",
			});
			expect(f.objects.has(variantKey)).toBe(false);
			expect(await api[method](IMAGE)).toEqual(bytes);
			expect(f.objects.get(variantKey)).toEqual(bytes!);
			expect(attempts).toBe(2);
			expect(f.warnings).toHaveLength(1);
		});

		test("одновременные запросы делят чтение и encode, после завершения байты не кешируются", async () => {
			const f = fixture();
			const started = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			const read = f.deps.readObject;
			f.deps.readObject = async (key) => {
				if (key === IMAGE) {
					started.resolve();
					await release.promise;
				}
				return read(key);
			};
			let encodes = 0;
			const make = f.variants[variant].make;
			f.variants[variant].make = async (bytes) => {
				encodes++;
				return make(bytes);
			};
			const api = createStore(f);
			const pending = [
				api[method](IMAGE),
				api[method](IMAGE),
				api[method](IMAGE),
			];
			await started.promise;
			release.resolve();
			const [first, second, third] = await Promise.all(pending);
			expect(first).toEqual(second!);
			expect(first).toEqual(third!);
			expect(f.reads).toEqual([variantKey, IMAGE]);
			expect(encodes).toBe(1);
			expect(f.writes).toHaveLength(1);
			const replacement = new Uint8Array([4, 2]);
			f.objects.set(variantKey, replacement);
			expect(await api[method](IMAGE)).toEqual(replacement);
			expect(f.reads).toEqual([variantKey, IMAGE, variantKey]);
			expect(encodes).toBe(1);
		});

		for (const phase of ["read", "encode"] as const) {
			test(`сбой ${phase} освобождает in-flight и не мешает повтору`, async () => {
				const f = fixture();
				const failure = new Error(`${phase} failed`);
				let fail = true;
				if (phase === "read") {
					const read = f.deps.readObject;
					f.deps.readObject = async (key) => {
						if (fail) throw failure;
						return read(key);
					};
				} else {
					const make = f.variants[variant].make;
					f.variants[variant].make = async (bytes) => {
						if (fail) throw failure;
						return make(bytes);
					};
				}
				const api = createStore(f);
				const results = await Promise.allSettled([
					api[method](IMAGE),
					api[method](IMAGE),
				]);
				expect(results).toEqual([
					{ status: "rejected", reason: failure },
					{ status: "rejected", reason: failure },
				]);
				fail = false;
				expect(await api[method](IMAGE)).not.toBeNull();
				expect(f.objects.has(variantKey)).toBe(true);
			});
		}
	});
}

test("thumbnail и preview одного оригинала не подменяют друг друга в in-flight", async () => {
	const f = fixture();
	const original = await new Bun.Image(TINY_PNG)
		.resize(1000, 500)
		.png()
		.bytes();
	f.objects.set(IMAGE, original);
	const api = createStore(f);
	const [thumb, preview] = await Promise.all([
		api.getOrCreateThumb(IMAGE),
		api.getOrCreatePreview(IMAGE),
	]);
	expect(await new Bun.Image(thumb!).metadata()).toMatchObject({
		width: 640,
		height: 320,
	});
	expect(await new Bun.Image(preview!).metadata()).toMatchObject({
		width: 1000,
		height: 500,
	});
	expect(f.objects.get(THUMB)).toEqual(thumb!);
	expect(f.objects.get(PREVIEW)).toEqual(preview!);
});
