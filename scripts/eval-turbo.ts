/**
 * Прогон агента Турбо по набору запросов: какие изображения он выбрал и какой
 * промпт собрал. По умолчанию картинки не рисуются (лимит подписки не тратится).
 *
 *   bun scripts/eval-turbo.ts [подстроки…]            # только агент
 *   bun scripts/eval-turbo.ts --generate [подстроки…] # ещё и рисовать, с замером времени
 *
 * Вход Codex берётся из базы (.env.development): сначала войдите через админку.
 * Агент тот же, что в воркфлоу (createTurboAgent); идёт в одном процессе, без Workflow.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { toGeneratorQuotes } from "../src/lib/prompts/style-hints";
import { buildTurboSystem } from "../src/lib/prompts/turbo.system";
import { listObjects, readObject } from "../src/lib/storage";
import { buildAgentMessage, systemVersionOf } from "../src/lib/turbo/agent";
import {
	createTurboAgent,
	runTurboAgent,
} from "../src/lib/turbo/agent-definition";
import { codexFetch, createCodexAuth } from "../src/lib/turbo/codex-auth";
import { editImage } from "../src/lib/turbo/codex-images";
import {
	TURBO_AGENT_MODEL,
	TURBO_DRAW_TIMEOUT_MS,
} from "../src/lib/turbo/constants";
import { Library } from "../src/lib/turbo/library";
import {
	checkImageArguments,
	drawImage,
	readForAgent,
} from "../src/lib/turbo/ops";

/**
 * Набор запросов. Первые две группы это то, что пишут люди сообщества (запросы из
 * базы и первые наборы проверки): названные люди из библиотеки, взводы, альбомы,
 * ритуалы. Остальное короткие и странные запросы без привязки к библиотеке. Запросы
 * не должны совпадать с примерами инструкции: агент копирует свой пример.
 */
const PROMPTS = [
	// сообщество и люди из библиотеки
	"пятёрка на троне в окружении стримеров",
	"Пятерка с флагом 42 в огромных наушниках слушает музыку, рядом РЗТ выдает ему медаль и говорит, что Пятерка король интернета",
	"Пятерка объявляет жатву хайпа",
	"пятёрка в образе со слэя едет со статуэтками и уничтожает лазерами из глаз богему",
	"Пятёрка уничтожает богему",
	"Пятёрка поёт на сцене",
	"Бастер и Данджерлёха пьют Tornado на крыше",
	"Мафаня в майке оранджэнг раздаёт слитки",
	"Даванков и Романцев играют в шахматы с бегемотом",
	"3 взвод идёт в атаку на хейтеров",
	"42 братухи на самокатах слушают альбом Magnum",
	"мопс слушает альбом Magnum Opus",
	"флаг 42 над ратушей и салют",
	"плакат с надписью «СЛАВА 42»",
	// короткие и странные запросы
	"президент верхом на медведе",
	"42 бегемота играют в шахматы",
	"советская ракета стартует с космодрома",
	"свадьба в средневековом замке, гости танцуют, рыцари в доспехах, огромный торт",
	"неоновый кот-программист пишет код ночью",
	"кот на пожарной лестнице",
	"смысл жизни",
	"дедлайн",
	"новогодняя ёлка",
	"Пятёрка в обычный будний день",
];

const generate = process.argv.includes("--generate");

let imageMs = 0;

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
const authenticatedFetch = codexFetch(createCodexAuth());
const version = systemVersionOf(buildTurboSystem(""));
console.log(
	`Инструкция ${version}, модель ${TURBO_AGENT_MODEL}, ${generate ? "с рисованием" : "без рисования"}\n`,
);

const durations: number[] = [];
for (const [index, prompt] of selected.entries()) {
	const started = Date.now();
	imageMs = 0;
	try {
		// агент тот же, что в воркфлоу; исполнители здесь обычные функции
		const agent = createTurboAgent({
			system: buildTurboSystem(await library.describeTree()),
			executors: {
				listFolder: async ({ path }) => library.listFolder(path),
				readFile: async ({ path }) => readForAgent(library, path),
				checkImage: async (input) => checkImageArguments(library, input),
			},
		});
		const run = await runTurboAgent(agent, buildAgentMessage(prompt));
		const accepted = run.accepted;
		if (!accepted) {
			throw new Error("Агент завершил работу, не вызвав generateImage");
		}

		let png: Uint8Array = new Uint8Array();
		let finalPrompt = toGeneratorQuotes(accepted.prompt);
		let size: string | null = null;
		let inputImages = accepted.images;
		if (generate) {
			const drawStarted = Date.now();
			try {
				const drawn = await drawImage(
					{
						library,
						edit: ({ prompt: editPrompt, images, signal }) =>
							editImage({
								fetch: authenticatedFetch,
								prompt: editPrompt,
								images,
								...(signal ? { signal } : {}),
							}),
					},
					{
						prompt: accepted.prompt,
						images: accepted.images,
						signal: AbortSignal.timeout(TURBO_DRAW_TIMEOUT_MS),
					},
				);
				png = drawn.png;
				finalPrompt = drawn.prompt;
				size = drawn.size;
				inputImages = drawn.inputImages;
			} finally {
				imageMs = Date.now() - drawStarted;
			}
		}

		const seconds = Math.round((Date.now() - started) / 1000);
		durations.push(seconds);
		if (generate && png.length > 0) {
			// pid в имени: параллельные запуски в одну секунду не затирают картинки друг друга
			await writeFile(
				`${imagesDir}/turbo-${stamp}-${process.pid}-${index + 1}.png`,
				png,
			);
		}
		console.log(
			`# ${prompt}  (${seconds} с${generate ? `, из них рисование ${Math.round(imageMs / 1000)} с` : ""}, токенов ${run.tokens ?? 0})`,
		);
		console.log(`  изображения: ${inputImages.join(", ") || "нет"}`);
		const opened = run.toolCalls
			.filter((call) => call.toolName === "readFile")
			.map((call) => (call.input as { path: string }).path);
		console.log(`  прочитано агентом: ${opened.join(", ") || "ничего"}`);
		console.log(`  промпт: ${finalPrompt}\n`);
		await appendFile(
			jsonl,
			`${JSON.stringify({ prompt, version, seconds, imageSeconds: Math.round(imageMs / 1000), inputImages, toolCalls: run.toolCalls, finalPrompt, size })}\n`,
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
