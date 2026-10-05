/**
 * Проверка допущений режима «Турбо» на реальном аккаунте ChatGPT, до остального кода.
 * Не трогает базу и приложение: токены лежат в файле пакета
 * (~/.config/openai-oauth-ai-provider/auth.json или OPENAI_OAUTH_AUTH_FILE).
 *
 *   bun scripts/smoke-codex.ts                 # вход, модели, агент, картинки 1/5/10
 *   bun scripts/smoke-codex.ts --skip-images   # без трат лимита на картинки
 *   bun scripts/smoke-codex.ts --only-images   # только картинки (1, 5 и 10 входных)
 *   CODEX_ORIGINATOR=<значение> bun scripts/smoke-codex.ts   # другой заголовок originator
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isStepCount, ToolLoopAgent, tool } from "ai";
import { createOpenAIOAuthProvider } from "openai-oauth-ai-provider/ai-sdk";
import { codex } from "openai-oauth-ai-provider/codex";
import {
	CHATGPT_CODEX_BASE_URL,
	createAuthenticatedFetch,
	DEFAULT_ORIGINATOR,
	OpenAIOAuth,
} from "openai-oauth-ai-provider/core";
import { z } from "zod";

const AGENT_MODEL = "gpt-6-luna";
const LIBRARY_DIR =
	process.env.LIBRARY_DIR ?? join(import.meta.dir, "..", "library");
const DRAFT = "docs/superpowers/specs/2026-10-05-turbo-agent-prompt.md";
const OUT_DIR = "docs/evals/images/smoke-codex";
const originator = process.env.CODEX_ORIGINATOR ?? DEFAULT_ORIGINATOR;
// список моделей бэкенд фильтрует по версии клиента: с версией пакета (0.1.0) он пуст
const clientVersion = process.env.CODEX_CLIENT_VERSION ?? "0.160.0";
const skipImages = process.argv.includes("--skip-images");
const onlyImages = process.argv.includes("--only-images");

const auth = new OpenAIOAuth();

function report(ok: boolean, name: string, details = "") {
	console.log(
		`${ok ? "PASS" : "FAIL"}  ${name}${details ? `: ${details}` : ""}`,
	);
}

async function timed<T>(action: () => Promise<T>): Promise<[T, number]> {
	const started = Date.now();
	const value = await action();
	return [value, Math.round((Date.now() - started) / 1000)];
}

async function ensureLogin() {
	if (await auth.isAuthenticated()) {
		console.log("Вход уже выполнен");
		return;
	}
	await auth.loginWithDeviceCode({
		onVerification: ({ verificationUrl, userCode }) => {
			console.log(`\nОткройте ${verificationUrl} и введите код ${userCode}\n`);
		},
	});
	console.log("Вход выполнен");
}

async function checkModels() {
	const models = await codex({
		auth,
		originator,
		clientVersion,
	}).listCodexModels();
	const slugs = models.map((model) => model.slug);
	report(slugs.includes(AGENT_MODEL), `модель ${AGENT_MODEL} на аккаунте`);
	console.log(`      доступны: ${slugs.join(", ")}`);
}

async function libraryImages(): Promise<string[]> {
	const paths: string[] = [];
	for (const folder of await readdir(LIBRARY_DIR, { withFileTypes: true })) {
		if (!folder.isDirectory()) continue;
		for (const file of await readdir(join(LIBRARY_DIR, folder.name))) {
			if (file.endsWith(".png")) paths.push(`${folder.name}/${file}`);
		}
	}
	return paths;
}

/** Мини-прогон агента: большая инструкция, параллельные вызовы, картинка в результате инструмента */
async function checkAgent(instructionsMode: "message" | "provider") {
	const draft = await readFile(DRAFT, "utf8");
	const system = draft.split("\n---\n")[1] ?? draft;
	const provider = createOpenAIOAuthProvider({ auth, originator });
	let generateCalls = 0;
	let finalPrompt = "";

	const agent = new ToolLoopAgent({
		model: provider(AGENT_MODEL),
		...(instructionsMode === "message"
			? { instructions: system }
			: { providerOptions: { openai: { instructions: system } } }),
		reasoning: "high",
		stopWhen: [() => generateCalls > 0, isStepCount(10)],
		tools: {
			listFolder: tool({
				description: "Файлы папки библиотеки",
				inputSchema: z.object({ path: z.string() }),
				execute: async ({ path }) => ({
					ok: true,
					files: await readdir(join(LIBRARY_DIR, path)).catch(() => []),
				}),
			}),
			readFile: tool({
				description: "Читает файл библиотеки; изображение ты видишь сам",
				inputSchema: z.object({ path: z.string() }),
				execute: async ({ path }) => {
					const bytes = await readFile(join(LIBRARY_DIR, path)).catch(
						() => null,
					);
					if (!bytes) return { ok: false as const, error: "нет файла" };
					return path.endsWith(".png")
						? {
								ok: true as const,
								kind: "image" as const,
								base64: bytes.toString("base64"),
								path,
							}
						: {
								ok: true as const,
								kind: "text" as const,
								text: bytes.toString("utf8"),
							};
				},
				toModelOutput: ({ output }) =>
					output.ok && output.kind === "image"
						? {
								type: "content",
								value: [
									{ type: "text", text: `Изображение ${output.path}` },
									{
										type: "file",
										mediaType: "image/png",
										data: { type: "data", data: output.base64 },
									},
								],
							}
						: { type: "json", value: output },
			}),
			generateImage: tool({
				description: "Рисует итоговую картинку; финальный шаг",
				inputSchema: z.object({
					prompt: z.string(),
					images: z.array(z.string()),
				}),
				execute: async ({ prompt, images }) => {
					generateCalls += 1;
					finalPrompt = `${prompt}\n[images: ${images.join(", ") || "нет"}]`;
					return { ok: true as const };
				},
			}),
		},
	});

	const tree = (await readdir(LIBRARY_DIR)).join(", ");
	const [result, seconds] = await timed(() =>
		agent.generate({
			prompt: `<<<USER_REQUEST\nпятёрка в очках сидит на троне\n>>>\n\nTEXT: none\n\nДерево библиотеки (папки): ${tree}`,
			abortSignal: AbortSignal.timeout(240_000),
		}),
	);
	report(
		generateCalls === 1,
		`агент (инструкция: ${instructionsMode === "message" ? "сообщением" : "через instructions"})`,
		`${seconds} с, шагов ${result.steps.length}, токенов ${result.usage.totalTokens ?? "?"}`,
	);
	console.log(
		`      вызовы: ${result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)).join(" → ")}`,
	);
	console.log(`      итог: ${finalPrompt.slice(0, 400)}`);
}

/** Запрос к Codex Images с N входными изображениями: потолок числа и заголовок originator */
async function checkImages(count: number, paths: string[]) {
	const authedFetch = createAuthenticatedFetch(auth, { originator });
	const images = await Promise.all(
		paths.slice(0, count).map(async (path) => ({
			image_url: `data:image/png;base64,${(await readFile(join(LIBRARY_DIR, path))).toString("base64")}`,
		})),
	);
	const bodyMb = (JSON.stringify(images).length / 1e6).toFixed(1);
	const [response, seconds] = await timed(() =>
		authedFetch(`${CHATGPT_CODEX_BASE_URL}/images/edits`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				prompt:
					"Put every person and object from the provided images together into one festive absurd golden scene, exactly as they appear in the images",
				model: "gpt-image-2",
				n: 1,
				quality: "medium",
				size: "1024x1024",
				images,
			}),
			signal: AbortSignal.timeout(280_000),
		}),
	);
	if (!response.ok) {
		report(
			false,
			`картинки: ${count} входных`,
			`HTTP ${response.status} за ${seconds} с, тело ${bodyMb} МБ: ${(await response.text()).slice(0, 300)}`,
		);
		return false;
	}
	const json = (await response.json()) as {
		data?: { b64_json?: string }[];
		size?: string;
		quality?: string;
	};
	const b64 = json.data?.[0]?.b64_json;
	await mkdir(OUT_DIR, { recursive: true });
	if (b64)
		await writeFile(
			join(OUT_DIR, `edit-${count}.png`),
			Buffer.from(b64, "base64"),
		);
	report(
		Boolean(b64),
		`картинки: ${count} входных`,
		`${seconds} с, тело ${bodyMb} МБ, размер ${json.size ?? "?"}, качество ${json.quality ?? "?"} → ${OUT_DIR}/edit-${count}.png`,
	);
	return Boolean(b64);
}

await ensureLogin();
if (!onlyImages) {
	await checkModels();

	try {
		await checkAgent("message");
	} catch (error) {
		report(
			false,
			"агент (инструкция сообщением)",
			error instanceof Error ? error.message : String(error),
		);
		try {
			await checkAgent("provider");
		} catch (second) {
			report(
				false,
				"агент (инструкция через instructions)",
				second instanceof Error ? second.message : String(second),
			);
		}
	}
}

if (!skipImages) {
	const all = await libraryImages();
	const withSizes = await Promise.all(
		all.map(async (path) => ({
			path,
			size: (await readFile(join(LIBRARY_DIR, path))).length,
		})),
	);
	// самые тяжёлые первыми: худший случай для размера тела запроса
	const heaviest = withSizes
		.sort((a, b) => b.size - a.size)
		.map((entry) => entry.path);
	for (const count of [1, 5, 10]) {
		if (!(await checkImages(count, heaviest))) break;
	}
}
