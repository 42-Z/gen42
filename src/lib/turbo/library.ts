export const LIBRARY_PREFIX = "library/";
export const DESCRIPTIONS_FILE = "описания.txt";
/** Сколько входных изображений принимает одна генерация */
export const MAX_INPUT_IMAGES = 10;

const CACHE_TTL_MS = 60_000;

const IMAGE_MEDIA_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

export type FileKind = "image" | "text";

export interface LibraryFile {
	name: string;
	kind: FileKind;
}

/** Хранилище под библиотекой: только список и чтение, остальное агенту недоступно */
export interface LibraryStorage {
	list(prefix: string): Promise<{ key: string; size: number }[]>;
	read(key: string): Promise<Uint8Array | null>;
}

export type ListFolderResult =
	| { ok: true; path: string; files: LibraryFile[] }
	| { ok: false; error: string; folders: string[] };

export type ReadFileResult =
	| { ok: true; kind: "text"; path: string; text: string }
	| {
			ok: true;
			kind: "image";
			path: string;
			mediaType: string;
			base64: string;
	  }
	| { ok: false; error: string; nearest: string[] };

export interface ResolvedImage {
	path: string;
	mediaType: string;
	bytes: Uint8Array;
}

export type ResolveImagesResult =
	| { ok: true; images: ResolvedImage[] }
	| { ok: false; error: string };

type LoadResult =
	| { ok: true; folder: string; name: string; bytes: Uint8Array }
	| { ok: false; error: string; nearest: string[] };

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function kindOf(name: string): FileKind | null {
	const ext = extensionOf(name);
	if (ext in IMAGE_MEDIA_TYPES) return "image";
	if (ext === "txt") return "text";
	return null;
}

export function imageMediaType(name: string): string | null {
	return IMAGE_MEDIA_TYPES[extensionOf(name)] ?? null;
}

function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diagonal = row[0]!;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const above = row[j]!;
			row[j] = Math.min(
				row[j]! + 1,
				row[j - 1]! + 1,
				diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			diagonal = above;
		}
	}
	return row[b.length]!;
}

/** Ближайшие по написанию имена: подсказка агенту, который ошибся в пути */
export function closestNames(
	target: string,
	names: string[],
	limit = 5,
): string[] {
	const needle = target.toLowerCase();
	return names
		.map((name) => ({ name, d: distance(needle, name.toLowerCase()) }))
		.sort((x, y) => x.d - y.d || x.name.localeCompare(y.name))
		.slice(0, limit)
		.map((entry) => entry.name);
}

export function pluralImages(count: number): string {
	const mod100 = count % 100;
	const mod10 = count % 10;
	if (mod100 >= 11 && mod100 <= 14) return `${count} изображений`;
	if (mod10 === 1) return `${count} изображение`;
	if (mod10 >= 2 && mod10 <= 4) return `${count} изображения`;
	return `${count} изображений`;
}

export function pluralTexts(count: number): string {
	const mod100 = count % 100;
	const mod10 = count % 10;
	if (mod100 >= 11 && mod100 <= 14) return `${count} текстов`;
	if (mod10 === 1) return `${count} текст`;
	if (mod10 >= 2 && mod10 <= 4) return `${count} текста`;
	return `${count} текстов`;
}

/** Разбирает «папка/файл»; всё остальное (глубже, выше, с `..`) отклоняется */
export function parseLibraryPath(
	path: string,
): { folder: string; name: string } | null {
	const clean = path.trim().normalize("NFC");
	if (clean.includes("\\") || clean.includes("\0")) return null;
	const parts = clean.split("/");
	if (parts.length !== 2) return null;
	const [folder, name] = parts as [string, string];
	for (const part of [folder, name]) {
		if (!part || part === "." || part === "..") return null;
	}
	return { folder, name };
}

const PATH_HINT = "Путь — «папка/файл», например «эмблемы/flag_of_42.png»";

/**
 * Библиотека входных изображений как файловая система: папки с файлами,
 * только чтение. О том, где и как всё лежит, агент не знает.
 */
export class Library {
	private cache: { at: number; folders: Map<string, LibraryFile[]> } | null =
		null;

	constructor(
		private readonly storage: LibraryStorage,
		private readonly now: () => number = Date.now,
	) {}

	private async folders(): Promise<Map<string, LibraryFile[]>> {
		if (this.cache && this.now() - this.cache.at < CACHE_TTL_MS) {
			return this.cache.folders;
		}
		const objects = await this.storage.list(LIBRARY_PREFIX);
		const folders = new Map<string, LibraryFile[]>();
		for (const { key } of objects) {
			const parts = key
				.slice(LIBRARY_PREFIX.length)
				.normalize("NFC")
				.split("/");
			if (parts.length !== 2 || !parts[0] || !parts[1]) continue;
			const [folder, name] = parts as [string, string];
			const files = folders.get(folder) ?? [];
			folders.set(folder, files);
			const kind = kindOf(name);
			if (kind) files.push({ name, kind });
		}
		for (const files of folders.values()) {
			files.sort((a, b) => a.name.localeCompare(b.name));
		}
		this.cache = { at: this.now(), folders };
		return folders;
	}

	/**
	 * Дерево для системной инструкции: папки, число изображений и текстов,
	 * пустые помечены. Файл описаний есть в каждой папке и текстом не считается.
	 */
	async describeTree(): Promise<string> {
		const folders = await this.folders();
		return [...folders.keys()]
			.sort((a, b) => a.localeCompare(b))
			.map((folder) => {
				const files = folders.get(folder)!;
				const images = files.filter((file) => file.kind === "image").length;
				const texts = files.filter(
					(file) => file.kind === "text" && file.name !== DESCRIPTIONS_FILE,
				).length;
				const parts: string[] = [];
				if (images > 0) parts.push(pluralImages(images));
				if (texts > 0) parts.push(pluralTexts(texts));
				return `${folder}/ — ${parts.length === 0 ? "пусто" : parts.join(", ")}`;
			})
			.join("\n");
	}

	async listFolder(path: string): Promise<ListFolderResult> {
		const folders = await this.folders();
		const name = path.trim().normalize("NFC").replace(/\/+$/, "");
		const files = folders.get(name);
		if (!files) {
			return {
				ok: false,
				error: `Папки «${path}» нет. Папки библиотеки перечислены в поле folders`,
				folders: [...folders.keys()].sort((a, b) => a.localeCompare(b)),
			};
		}
		return { ok: true, path: name, files };
	}

	private async load(path: string): Promise<LoadResult> {
		const parsed = parseLibraryPath(path);
		if (!parsed) {
			return { ok: false, error: PATH_HINT, nearest: [] };
		}
		const folders = await this.folders();
		const files = folders.get(parsed.folder);
		if (!files) {
			return {
				ok: false,
				error: `Папки «${parsed.folder}» нет`,
				nearest: closestNames(parsed.folder, [...folders.keys()]),
			};
		}
		if (!files.some((file) => file.name === parsed.name)) {
			return {
				ok: false,
				error: `Файла «${parsed.name}» нет в папке «${parsed.folder}»`,
				nearest: closestNames(
					parsed.name,
					files.map((file) => file.name),
				),
			};
		}
		const bytes = await this.storage.read(
			`${LIBRARY_PREFIX}${parsed.folder}/${parsed.name}`,
		);
		if (!bytes) {
			return {
				ok: false,
				error: `Файл «${parsed.folder}/${parsed.name}» недоступен`,
				nearest: [],
			};
		}
		return { ok: true, folder: parsed.folder, name: parsed.name, bytes };
	}

	async readFile(path: string): Promise<ReadFileResult> {
		const loaded = await this.load(path);
		if (!loaded.ok) return loaded;
		const full = `${loaded.folder}/${loaded.name}`;
		const mediaType = imageMediaType(loaded.name);
		if (mediaType) {
			return {
				ok: true,
				kind: "image",
				path: full,
				mediaType,
				base64: Buffer.from(loaded.bytes).toString("base64"),
			};
		}
		if (extensionOf(loaded.name) === "txt") {
			return {
				ok: true,
				kind: "text",
				path: full,
				text: new TextDecoder().decode(loaded.bytes),
			};
		}
		return {
			ok: false,
			error: `Файл «${full}» не читается`,
			nearest: [],
		};
	}

	/** Проверяет пути для generateImage и отдаёт байты в порядке массива */
	async resolveImages(paths: string[]): Promise<ResolveImagesResult> {
		if (paths.length > MAX_INPUT_IMAGES) {
			return {
				ok: false,
				error: `Можно не больше ${MAX_INPUT_IMAGES} изображений, передано ${paths.length}`,
			};
		}
		const loaded = await Promise.all(paths.map((path) => this.load(path)));
		const images: ResolvedImage[] = [];
		const problems: string[] = [];
		loaded.forEach((entry, index) => {
			const path = paths[index]!;
			if (!entry.ok) {
				const hint = entry.nearest.length
					? ` Похожие: ${entry.nearest.join(", ")}`
					: "";
				problems.push(`«${path}»: ${entry.error}.${hint}`);
				return;
			}
			const mediaType = imageMediaType(entry.name);
			if (!mediaType) {
				problems.push(`«${path}» — не изображение`);
				return;
			}
			images.push({
				path: `${entry.folder}/${entry.name}`,
				mediaType,
				bytes: entry.bytes,
			});
		});
		if (problems.length > 0) {
			return { ok: false, error: problems.join(" ") };
		}
		return { ok: true, images };
	}
}
