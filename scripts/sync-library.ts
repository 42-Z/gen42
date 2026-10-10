/**
 * Заливает библиотеку входных изображений Турбо в хранилище (префикс library/).
 * Источник — папка library/ в корне репозитория: за его пределы скрипт не смотрит.
 * Идемпотентно: объект с тем же размером пропускается. Агент о хранилище не знает.
 *
 *   bun scripts/sync-library.ts [--dry-run]                    # dev (.env.development)
 *   NODE_ENV=production bun scripts/sync-library.ts --yes-prod # prod (флаг страхует от случайного запуска)
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { listObjects, uploadImage } from "../src/lib/storage";
import {
	DESCRIPTIONS_FILE,
	imageMediaType,
	LIBRARY_PREFIX,
} from "../src/lib/turbo/library";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const source = join(import.meta.dir, "..", "library");
const isProd = process.env.NODE_ENV === "production";

if (isProd && !args.includes("--yes-prod")) {
	console.error(
		"NODE_ENV=production: это продовое хранилище. Добавьте --yes-prod, чтобы подтвердить заливку.",
	);
	process.exit(1);
}

const endpoint = new URL(process.env.S3_ENDPOINT ?? "http://invalid").host;
console.log(`Источник: ${source}`);
console.log(
	`Хранилище: ${endpoint}, бакет ${process.env.S3_BUCKET}${dryRun ? " (пробный прогон)" : ""}`,
);

function contentType(name: string): string {
	return imageMediaType(name) ?? "text/plain; charset=utf-8";
}

const wanted = new Map<string, { bytes: Uint8Array; type: string }>();

for (const entry of await readdir(source, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const folder = entry.name.normalize("NFC");
	const names = (await readdir(join(source, entry.name))).filter(
		(name) => imageMediaType(name) || name.toLowerCase().endsWith(".txt"),
	);

	if (names.length === 0) {
		// пустую папку в бакете обозначает файл описаний
		wanted.set(`${LIBRARY_PREFIX}${folder}/${DESCRIPTIONS_FILE}`, {
			bytes: new TextEncoder().encode("\n"),
			type: contentType(DESCRIPTIONS_FILE),
		});
		continue;
	}

	for (const name of names) {
		wanted.set(`${LIBRARY_PREFIX}${folder}/${name.normalize("NFC")}`, {
			bytes: await readFile(join(source, entry.name, name)),
			type: contentType(name),
		});
	}
}

const remote = new Map(
	(await listObjects(LIBRARY_PREFIX)).map((object) => [
		object.key,
		object.size,
	]),
);
let uploaded = 0;
let skipped = 0;
for (const [key, { bytes, type }] of wanted) {
	if (remote.get(key) === bytes.byteLength) {
		skipped += 1;
		continue;
	}
	console.log(
		`${dryRun ? "[пробно] " : ""}загрузка ${key} (${(bytes.byteLength / 1024).toFixed(0)} КБ)`,
	);
	if (!dryRun) await uploadImage(key, Buffer.from(bytes), type);
	uploaded += 1;
}

const orphans = [...remote.keys()].filter((key) => !wanted.has(key));
for (const key of orphans)
	console.warn(`в бакете есть лишний объект (не удаляется): ${key}`);
console.log(
	`\nГотово: загружено ${uploaded}, без изменений ${skipped}, лишних ${orphans.length}`,
);
process.exit(0);
