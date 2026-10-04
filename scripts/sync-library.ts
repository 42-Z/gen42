/**
 * Заливает библиотеку входных изображений Турбо в бакет (префикс library/).
 * Идемпотентно: объект с тем же размером пропускается. Агент о хранилище не знает.
 *
 *   bun scripts/sync-library.ts [папка] [--dry-run]            # dev (.env.development)
 *   NODE_ENV=production bun scripts/sync-library.ts --yes-prod # prod, только с разрешения владельца
 */
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { listObjects, uploadImage } from "../src/lib/storage";
import {
	DESCRIPTIONS_FILE,
	imageMediaType,
	LIBRARY_PREFIX,
} from "../src/lib/turbo/library";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const source =
	args.find((arg) => !arg.startsWith("--")) ??
	join(homedir(), "Изображения", "референсы");
const isProd = process.env.NODE_ENV === "production";

if (isProd && !args.includes("--yes-prod")) {
	console.error(
		"NODE_ENV=production: это продовое хранилище. Добавьте --yes-prod, когда владелец разрешил заливку.",
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

/** Строка описаний: «имя_файла — что на нём» */
function describedNames(text: string): string[] {
	return text
		.split("\n")
		.map((line) => line.split(" — ")[0]?.trim() ?? "")
		.filter(Boolean);
}

const problems: string[] = [];
const wanted = new Map<string, { bytes: Uint8Array; type: string }>();

for (const entry of await readdir(source, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const folder = entry.name.normalize("NFC");
	const names = (await readdir(join(source, entry.name))).filter(
		(name) => imageMediaType(name) || name === DESCRIPTIONS_FILE,
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

	const images = names.filter((name) => imageMediaType(name));
	if (images.length === 0) continue;
	if (!names.includes(DESCRIPTIONS_FILE)) {
		problems.push(`${folder}: нет файла ${DESCRIPTIONS_FILE}`);
		continue;
	}
	const described = new Set(
		describedNames(
			await readFile(join(source, entry.name, DESCRIPTIONS_FILE), "utf8"),
		),
	);
	for (const image of images) {
		if (!described.has(image))
			problems.push(`${folder}: нет описания для ${image}`);
	}
	for (const name of described) {
		if (!images.includes(name))
			problems.push(`${folder}: описание для несуществующего ${name}`);
	}
}

if (problems.length > 0) {
	console.warn("\nПроблемы с описаниями:");
	for (const problem of problems) console.warn(`  - ${problem}`);
	if (isProd) {
		console.error("\nНа prod описания должны быть полными. Заливка отменена.");
		process.exit(1);
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
