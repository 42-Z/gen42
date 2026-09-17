import { mkdir, writeFile } from "node:fs/promises";
import { enhancePrompt } from "../src/lib/enhance";
import { STYLE_VERSION } from "../src/lib/prompts";
import { validateEnhancedPrompt } from "../src/lib/prompts/contract";

const PROMPTS = [
	"кот",
	"мопс",
	"закат",
	"дождь",
	"пицца",
	"смысл жизни",
	"портрет девушки в стиле ренессанс",
	"плакат с надписью «СЛАВА 42»",
	"торт с надписью «С ДНЁМ РОЖДЕНИЯ, БОСС»",
	"a cyberpunk samurai on a rooftop",
	"тигр в джунглях, фотореализм",
	"детский рисунок домика и солнца",
	"минималистичный белый фон, одна точка",
	"свадьба в средневековом замке, гости танцуют, рыцари в доспехах, огромный торт",
	"советская ракета стартует с космодрома",
	"аниме-девочка с катаной",
	"президент верхом на медведе",
	"42 бегемота играют в шахматы",
	"пляж, пальмы, закат, киберпанк",
	"неоновый кот-программист пишет код ночью",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
const dir = "docs/evals";
await mkdir(dir, { recursive: true });
const lines: string[] = [];

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const selected =
	only.length > 0
		? PROMPTS.filter((p) => only.some((o) => p.includes(o)))
		: PROMPTS;

console.log(`style_version: ${STYLE_VERSION}`);
console.log(
	`prompts: ${selected.length}${only.length > 0 ? " (subset)" : ""}\n`,
);

for (const userInput of selected) {
	const result = await enhancePrompt(userInput);
	const verdict = validateEnhancedPrompt(result.prompt);
	const record = {
		style_version: result.styleVersion,
		input: userInput,
		output: result.prompt,
		fallback: result.fallback,
		contract_ok: verdict.ok,
		contract_reason: verdict.reason ?? null,
		duration_ms: result.durationMs,
		input_tokens: result.inputTokens,
		output_tokens: result.outputTokens,
		chars: result.prompt.length,
		words: result.prompt.split(/\s+/).filter(Boolean).length,
		has_42: /42/.test(result.prompt),
		quotes: result.prompt.match(/«[^»]*»|"[^"]*"/g) ?? [],
		error: result.error ?? null,
	};
	lines.push(JSON.stringify(record));
	console.log(
		`${result.fallback ? "FALLBACK" : "ok"}  ${String(result.durationMs).padStart(5)}ms  ${record.words} слов  ${userInput}`,
	);
	if (result.fallback) console.log(`   ошибка: ${result.error}`);
}

const file = `${dir}/${stamp}-style42${only.length > 0 ? "-subset" : ""}.jsonl`;
await writeFile(file, `${lines.join("\n")}\n`);
console.log(`\nзаписано: ${file}`);
process.exit(0);
