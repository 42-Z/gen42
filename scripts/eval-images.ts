import { mkdir, writeFile } from "node:fs/promises";
import { enhancePrompt } from "../src/lib/enhance";
import {
	generateImage,
	getZeroGPUQuota,
	KeyExhaustedError,
} from "../src/lib/hf";
import { getAvailableKey, updateKeyQuota } from "../src/lib/keys";

const INPUTS = [
	"Человек в костюме с крыльями, у которого правая половина белая, а левая черная, стреляет лазерами из глаз",
	"мопс",
	"бегемот-диджей",
	"плакат с надписью «СЛАВА 42»",
	"киберпанк-город с фейерверками",
	"свадьба в средневековом замке",
	"a cyberpunk samurai on a rooftop",
	"тигр в джунглях, фотореализм",
	"детский рисунок домика и солнца",
];

const stamp = new Date().toISOString().slice(0, 10);
const dir = `docs/evals/images/${stamp}`;
await mkdir(dir, { recursive: true });

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const selected =
	only.length > 0
		? INPUTS.filter((p) => only.some((o) => p.includes(o)))
		: INPUTS;

let hfKey = await getAvailableKey("huggingface");

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			console.warn(`   ретрай ${attempt + 1}/3 (${label}):`, String(error));
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
	}
	throw lastError;
}

const triedKeyIds = new Set<string>();

async function generateWithRotation(prompt: string) {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await generateImage(
				{ prompt, model: "Turbo", width: 1024, height: 1024 },
				hfKey.key,
			);
		} catch (error) {
			if (error instanceof KeyExhaustedError) {
				console.warn(`   ключ ${hfKey.name} исчерпан, беру следующий`);
				triedKeyIds.add(hfKey.id);
				const quota = await getZeroGPUQuota(hfKey.key);
				if (quota) {
					await updateKeyQuota(hfKey.id, quota, {
						lastError: String(error),
					});
				}
				hfKey = await getAvailableKey("huggingface", {
					excludeIds: [...triedKeyIds],
				});
				continue;
			}
			throw error;
		}
	}
	throw new Error("все HF-ключи исчерпаны");
}

for (const [index, userInput] of selected.entries()) {
	const enhanced = await withRetry(`enhance ${userInput}`, () =>
		enhancePrompt(userInput),
	);
	console.log(`[${index + 1}/${selected.length}] ${userInput}`);
	console.log(`   ${enhanced.prompt.slice(0, 200)}…`);

	const result = await withRetry(`generate ${userInput}`, () =>
		generateWithRotation(enhanced.prompt),
	);
	const response = await fetch(result.imageUrl);
	const buffer = Buffer.from(await response.arrayBuffer());
	const name = userInput
		.slice(0, 40)
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-|-$/g, "");
	const file = `${dir}/${String(index + 1).padStart(2, "0")}-${name}.png`;
	await writeFile(file, buffer);
	await writeFile(
		`${dir}/${String(index + 1).padStart(2, "0")}-${name}.txt`,
		`${enhanced.prompt}\n`,
	);
	console.log(`   ${file} (seed ${result.seed})\n`);
}

const quota = await getZeroGPUQuota(hfKey.key);
if (quota) await updateKeyQuota(hfKey.id, quota);
console.log(
	`квота HF после прогона: ${quota?.current ?? "?"} / ${quota?.base ?? "?"}`,
);
process.exit(0);
