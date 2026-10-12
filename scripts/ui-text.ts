// scripts/ui-text.ts
import path from "node:path";
import { collectUiText } from "../src/lib/ui-text";

/** `bun scripts/ui-text.ts --write` снимает эталон видимого текста (делается один раз, до правок UI) */
const dir = path.resolve("src/components");
const text = await collectUiText(dir);
const target = path.resolve("src/lib/__tests__/ui-text.baseline.json");
if (process.argv.includes("--write")) {
	await Bun.write(target, `${JSON.stringify(text, null, "\t")}\n`);
	console.log(
		`эталон записан: ${Object.values(text).flat().length} строк в ${Object.keys(text).length} файлах`,
	);
} else {
	console.log(JSON.stringify(text, null, 2));
}
