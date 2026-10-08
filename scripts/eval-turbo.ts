/**
 * Прогон агента Турбо по набору запросов: какие изображения он выбрал и какой
 * промпт собрал. По умолчанию картинки не рисуются (лимит подписки не тратится).
 *
 *   bun scripts/eval-turbo.ts [подстроки…]            # только агент
 *   bun scripts/eval-turbo.ts --generate [подстроки…] # ещё и рисовать, с замером времени
 *
 * Вход Codex берётся из базы (.env.development): сначала войдите через админку.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { buildTurboSystem } from "../src/lib/prompts/turbo.system";
import { listObjects, readObject } from "../src/lib/storage";
import { runTurbo, systemVersionOf } from "../src/lib/turbo/agent";
import {
	codexFetch,
	codexLanguageModel,
	createCodexAuth,
} from "../src/lib/turbo/codex-auth";
import { editImage } from "../src/lib/turbo/codex-images";
import { TURBO_AGENT_MODEL } from "../src/lib/turbo/constants";
import { Library } from "../src/lib/turbo/library";

const PROMPTS = [
	"пятёрка на троне",
	"пятёрка в образе со слэя едет со статуэтками и уничтожает лазерами из глаз богему",
	"Бастер и Данджерлёха пьют Tornado на крыше",
	"флаг 42 над ратушей и салют",
	"кот",
	"смысл жизни",
	"плакат с надписью «СЛАВА 42»",
	"Мафаня в майке оранджэнг раздаёт слитки",
	"Даванков и Романцев играют в шахматы с бегемотом",
	"Пятёрка уничтожает богему",
	"Пятёрка поёт на сцене",
	"Пятёрка в обычный будний день",
	"экзамен по математике",
	"3 взвод идёт в атаку на хейтеров",
	"мопс слушает альбом Magnum Opus",
	"дедлайн",
	"утро в деревне",
	"новогодняя ёлка",
];

const generate = process.argv.includes("--generate");

let imageMs = 0;

/** editImage с замером фазы рисования: видно, сколько времени у генератора, а сколько у агента */
async function timedEditImage(params: Parameters<typeof editImage>[0]) {
	const startedAt = Date.now();
	try {
		return await editImage(params);
	} finally {
		imageMs = Date.now() - startedAt;
	}
}
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const selected =
	only.length > 0
		? PROMPTS.filter((prompt) => only.some((part) => prompt.includes(part)))
		: PROMPTS;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonl = `docs/evals/turbo-${stamp}.jsonl`;
const imagesDir = "docs/evals/images";
await mkdir("docs/evals", { recursive: true });
await mkdir(imagesDir, { recursive: true });

const library = new Library({ list: listObjects, read: readObject });
const auth = createCodexAuth();
const authenticatedFetch = codexFetch(auth);
const version = systemVersionOf(buildTurboSystem(""));
console.log(
	`Инструкция ${version}, модель ${TURBO_AGENT_MODEL}, ${generate ? "с рисованием" : "без рисования"}\n`,
);

const durations: number[] = [];
for (const [index, prompt] of selected.entries()) {
	const started = Date.now();
	imageMs = 0;
	try {
		const result = await runTurbo(prompt, {
			model: codexLanguageModel(auth, TURBO_AGENT_MODEL),
			library,
			buildSystem: buildTurboSystem,
			edit: async ({ prompt: finalPrompt, images, signal }) =>
				generate
					? timedEditImage({
							fetch: authenticatedFetch,
							prompt: finalPrompt,
							images,
							...(signal ? { signal } : {}),
						})
					: { png: new Uint8Array(), size: null, quality: null },
		});
		const seconds = Math.round((Date.now() - started) / 1000);
		durations.push(seconds);
		if (generate && result.png.length > 0) {
			await writeFile(
				`${imagesDir}/turbo-${stamp}-${index + 1}.png`,
				result.png,
			);
		}
		console.log(
			`# ${prompt}  (${seconds} с${generate ? `, из них рисование ${Math.round(imageMs / 1000)} с` : ""}, токенов ${(result.inputTokens ?? 0) + (result.outputTokens ?? 0)})`,
		);
		console.log(`  изображения: ${result.inputImages.join(", ") || "нет"}`);
		const opened = result.toolCalls
			.filter((call) => call.toolName === "readFile")
			.map((call) => (call.input as { path: string }).path);
		console.log(`  прочитано агентом: ${opened.join(", ") || "ничего"}`);
		console.log(`  промпт: ${result.prompt}\n`);
		await appendFile(
			jsonl,
			`${JSON.stringify({ prompt, version, seconds, imageSeconds: Math.round(imageMs / 1000), inputImages: result.inputImages, toolCalls: result.toolCalls, finalPrompt: result.prompt, size: result.size })}\n`,
		);
	} catch (error) {
		const message =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: String(error);
		console.log(`# ${prompt}\n  ОШИБКА: ${message}\n`);
		await appendFile(
			jsonl,
			`${JSON.stringify({ prompt, version, error: message })}\n`,
		);
	}
}

if (durations.length > 0) {
	const sorted = [...durations].sort((a, b) => a - b);
	const at = (q: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
	console.log(
		`Время запуска, с: мин ${sorted[0]}, медиана ${at(0.5)}, p90 ${at(0.9)}, макс ${sorted.at(-1)} (прогонов ${sorted.length})`,
	);
}
console.log(`Журнал: ${jsonl}`);
process.exit(0);
