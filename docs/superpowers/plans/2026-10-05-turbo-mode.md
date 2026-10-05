# Режим «Турбо»: план реализации

> **Для исполнителя:** ОБЯЗАТЕЛЬНЫЙ подскилл: `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`. Шаги отмечены чекбоксами (`- [ ]`).

**Цель:** добавить третий движок генерации `turbo`: агент сам подбирает входные изображения из библиотеки культа и рисует кадр в стиле «42» через подписку ChatGPT.

**Архитектура:** ветка `engine: "turbo"` внутри `POST /api/generate` вызывает сервис `generateTurbo` (списание 10 кредитов, запуск агента, сохранение PNG, запись в `generations`, возврат кредитов при любом сбое). Агент на AI SDK 7 (`ToolLoopAgent`, модель `gpt-6-luna`) читает библиотеку как файловую систему через инструменты `listFolder`, `readFile`, `generateImage`; картинку рисует прямой запрос к Codex Images. Один вход подписки (токены в Postgres) обслуживает и агента, и картинки.

**Стек:** Bun, TypeScript, AI SDK 7 (`ai@7.0.105`), `openai-oauth-ai-provider@0.2.1`, `@ai-sdk/openai@4.0.28`, `zod`, Postgres (postgres.js), Bun S3, React 19, shadcn/ui (radix), Tabler.

**Спецификация:** `docs/superpowers/specs/2026-10-05-turbo-mode-design.md`; черновик инструкции агента: `docs/superpowers/specs/2026-10-05-turbo-agent-prompt.md`.

## Глобальные требования

Каждая задача неявно включает их.

- Работаем в ветке `feat/turbo-mode`. Коммиты оканчиваются строкой `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Везде Bun (`bun`, `bunx`, `bun test`), разовые скрипты на Python только через `uv run`. Команды в оболочке выполнять по одной, без склейки через `&&`.
- AI SDK 7: API сверять с `node_modules/ai/docs/`, а не с памятью (условия остановки: `isStepCount`, `hasToolCall`; уровень рассуждения: параметр `reasoning`).
- Движок `turbo`, цена **10 кредитов**. Формат 1:1 и качество medium запрашиваются, окончательно решает сервер Codex.
- Агент: модель `gpt-6-luna`, рассуждение `high`, генерация ровно одна за запуск, входных изображений до **10**. Весь запуск не дольше **270 с** (лимит функции Vercel 300 с).
- В инструкции агента нет запретов, не влияющих на качество (реальные люди, политика, символика, бренды, NSFW).
- Пользователь при любом сбое Турбо видит одно сообщение: «Не удалось создать изображение, кредиты возвращены». Состояние входа Codex и причины сбоев видны только в админке.
- Без рабочего входа Codex режима «Турбо» для пользователей нет: запрос с `engine: "turbo"` обрабатывается как запрос с неизвестным движком.
- Второго входа Codex (например, через Codex CLI на ту же сессию) не создавать: он мешал бы обновлению токена. Для проверки в задаче 1 используется отдельный файл токенов, он к приложению не относится.
- Миграции идемпотентны (`IF NOT EXISTS`). Миграция prod-базы, заливка библиотеки на prod и вход Codex на prod выполняются только с явного разрешения владельца.
- Фронтенд: только через скилл `shadcn` (компоненты добавлять CLI), иконки Tabler, `gap-*` вместо `space-*`, `size-*` вместо `w-* h-*`, `cn()` из `@/lib/utils`. Язык интерфейса русский, без технических подробностей для пользователя.
- В описании PR не писать про линтер, тесты и типы; вместо этого вставить скриншот интерфейса (скилл `before-and-after`).

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/lib/models.ts` (изменить) | реестр движков: `SpaceEngine`, `ImageEngine`, `TURBO_MODEL`, `resolveImageEngine(value, turboAvailable)` |
| `migrations/custom-tables.sql` (изменить) | `generations.input_images`, `turbo` в `generations_engine_check`, таблица `codex_auth` |
| `src/lib/storage.ts` (изменить) | `listObjects`, `readObject` для чтения библиотеки |
| `src/lib/turbo/library.ts` | библиотека как файловая система: дерево, `listFolder`, `readFile`, `resolveImages`, проверка путей |
| `src/lib/turbo/constants.ts` | `TURBO_AGENT_MODEL`, `TURBO_MAX_STEPS`, `TURBO_TIMEOUT_MS` |
| `src/lib/turbo/codex-events.ts` | типы обмена админки с входом Codex (безопасны для фронтенда) |
| `src/lib/turbo/codex-auth.ts` | хранилище токенов в БД, менеджер входа, статус, проверка, поток входа по коду |
| `src/lib/turbo/codex-images.ts` | запрос к Codex Images (`/images/edits`, `/images/generations`) |
| `src/lib/prompts/canon.ts` (создать скриптом) | общие блоки канона «42» |
| `src/lib/prompts/style42.system.ts` (изменить скриптом) | инструкция обогащения, собирается из общих блоков |
| `src/lib/prompts/turbo.system.ts` (создать скриптом) | `buildTurboSystem(tree)`: инструкция агента |
| `src/lib/turbo/errors.ts` | `TurboError`, коды, общее сообщение пользователю |
| `src/lib/turbo/tools.ts` | инструменты агента и состояние запуска |
| `src/lib/turbo/agent.ts` | `runTurbo`: цикл агента, классификация ошибок |
| `src/lib/turbo/service.ts` | `generateTurbo`: списание, запуск, хранение, запись, возврат |
| `src/lib/turbo/runtime.ts` | боевые зависимости сервиса (вход, S3, SQL) |
| `src/api/generate.ts` (изменить) | `/api/models` с Турбо при рабочем входе, ветка `turbo` в `/api/generate` |
| `src/api/codex-admin.ts`, `src/api/admin.ts`, `src/server.ts` | админ-эндпоинты входа Codex |
| `src/components/ui/tabs.tsx` (CLI) | переключатель «Изображение / Турбо» |
| `src/components/graphics.tsx`, `src/index.css` | общий компонент ожидания `PopWait` |
| `src/components/Generate.tsx`, `ModelPicker.tsx` | режимы интерфейса |
| `src/components/CodexAccess.tsx`, `Admin.tsx` | блок «Вход Codex» в админке |
| `scripts/smoke-codex.ts`, `sync-library.ts`, `eval-turbo.ts` | проверка допущений, заливка библиотеки, прогон агента |

---

### Задача 1: Зависимости и проверка допущений на аккаунте владельца

Все допущения спецификации о приватном эндпоинте Codex проверяются до остального кода: если одно из них не подтвердится, остальные задачи меняются.

**Файлы:**
- Изменить: `package.json`, `bun.lock`
- Создать: `scripts/smoke-codex.ts`
- Изменить: `docs/superpowers/specs/2026-10-05-turbo-mode-design.md` (раздел «Риски и проверка»)

**Интерфейсы:**
- Потребляет: ничего.
- Производит: результаты проверки (в спецификации): принимается ли `originator`, потолок числа входных изображений, доступность `gpt-6-luna`, способ передачи инструкции агента, время ответа Codex Images.

- [ ] **Шаг 1: Установить зависимости**

Версии закреплены: `openai-oauth-ai-provider` 0.2.1 требует `@ai-sdk/openai` ровно 4.0.28.

```bash
bun add openai-oauth-ai-provider@0.2.1 @ai-sdk/openai@4.0.28 zod@^4.1.8
```

Ожидается: `installed openai-oauth-ai-provider@0.2.1`, `installed @ai-sdk/openai@4.0.28`, `installed zod@4.x`. В `package.json` три новые строки, `bun.lock` изменён.

- [ ] **Шаг 2: Создать скрипт проверки**

Файл `scripts/smoke-codex.ts` (не трогает ни базу, ни приложение; токены лежат в файле пакета `~/.config/openai-oauth-ai-provider/auth.json`):

```typescript
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
	const models = await codex({ auth, originator }).listCodexModels();
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
```

- [ ] **Шаг 3: Войти и проверить модели и агента**

```bash
bun scripts/smoke-codex.ts --skip-images
```

Скрипт напечатает ссылку и код: попросить владельца открыть ссылку, войти в нужный аккаунт ChatGPT и ввести код. Ожидаемый вывод (время и числа зависят от аккаунта):

```
Вход выполнен
PASS  модель gpt-6-luna на аккаунте
      доступны: gpt-6-luna, ...
PASS  агент (инструкция: сообщением): 25 с, шагов 3, токенов 40000
      вызовы: listFolder → readFile → generateImage
      итог: ...
```

Как читать результат:

| Результат | Действие |
|---|---|
| `FAIL модель gpt-6-luna` | взять из списка «доступны» модель с поддержкой изображений и вызова функций и записать её слаг в `TURBO_AGENT_MODEL` (задача 5); в скрипте заменить `AGENT_MODEL` и перезапустить |
| `PASS агент (инструкция: сообщением)` | оставить код задачи 8 как есть |
| `FAIL ... сообщением`, но `PASS ... через instructions` | в задаче 8 заменить `instructions: system` на `providerOptions: { openai: { instructions: system } }` (точный фрагмент в задаче 8) |
| оба `FAIL` | остановиться и сообщить владельцу текст ошибки: приватный эндпоинт мог измениться; дальнейший план зависит от решения (запасной путь из спецификации: AI Gateway или API-ключ OpenAI) |

- [ ] **Шаг 4: Проверить картинки: заголовок originator и потолок числа изображений**

Расходует лимит подписки на три генерации.

```bash
bun scripts/smoke-codex.ts --only-images
```

Скрипт берёт самые тяжёлые изображения библиотеки (худший случай по размеру тела запроса) и пробует 1, 5 и 10 входных; результаты сохраняются в `docs/evals/images/smoke-codex/`. Ожидаемый вывод:

```
PASS  картинки: 1 входных: 60 с, тело 5.4 МБ, размер 1024x1024, качество medium → docs/evals/images/smoke-codex/edit-1.png
PASS  картинки: 5 входных: ...
PASS  картинки: 10 входных: ...
```

| Результат | Действие |
|---|---|
| `HTTP 401/403` или текст про `originator` | повторить с `CODEX_ORIGINATOR=codex_cli_rs bun scripts/smoke-codex.ts --only-images` (значение, которое отправляет клиент Codex); принятое значение задавать через переменную окружения `CODEX_ORIGINATOR` (код задачи 5 её читает) |
| `FAIL` на 10, `PASS` на 5 | уменьшить `MAX_INPUT_IMAGES` в `src/lib/turbo/library.ts` (задача 4) до наибольшего прошедшего числа и поправить слова «десять» и «10» в разделе про лимит инструкции агента (задача 7) |
| `FAIL` на всех, тело больше ~25 МБ | потолок по размеру тела: в задаче 4 добавить уменьшение изображений больше 2048 px по длинной стороне при заливке библиотеки (`scripts/sync-library.ts`) |
| картинки приходят 1024x1536 вместо 1024x1024 | так и задумано: размер решает сервер, сервис Турбо запишет фактический |

Открыть сохранённые картинки и убедиться, что люди и предметы с входных изображений узнаются.

- [ ] **Шаг 5: Записать результаты в спецификацию**

В `docs/superpowers/specs/2026-10-05-turbo-mode-design.md`, в конец раздела «Риски и проверка», добавить блок с фактами (подставить реальные значения и дату проверки):

```markdown
### Результаты проверки на аккаунте владельца (ДАТА)

- `originator`: принимается значение пакета / потребовалось `codex_cli_rs`.
- Потолок входных изображений: прошло N из 10; лимит в коде: N.
- `gpt-6-luna`: доступна / заменена на СЛАГ.
- Инструкция агента: передаётся сообщением / через `providerOptions.openai.instructions`.
- Codex Images: время на 1 / 5 / 10 входных изображений: X / Y / Z с; размер ответа: ...
```

- [ ] **Шаг 6: Коммит**

```bash
git add package.json bun.lock scripts/smoke-codex.ts docs/superpowers/specs/2026-10-05-turbo-mode-design.md
```

```bash
git commit -m "chore(turbo): зависимости Codex и проверка допущений на аккаунте" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 2: Реестр движков: `turbo`

**Файлы:**
- Изменить: `src/lib/models.ts`, `src/lib/hf.ts`, `src/components/ModelPicker.tsx`, `src/components/Generate.tsx` (два типа), `src/api/generate.ts` (временная привязка к движкам Space)
- Тест: `src/lib/__tests__/models.test.ts`

**Интерфейсы:**
- Потребляет: ничего.
- Производит (для задач 9 и 11):
  - `type SpaceEngine = "krea" | "ideogram"`, `type ImageEngine = SpaceEngine | "turbo"`
  - `TURBO_MODEL: { label: "Турбо"; cost: 10 }`
  - `isSpaceEngine(value: unknown): value is SpaceEngine`, `isImageEngine(value: unknown): value is ImageEngine`
  - `resolveImageEngine(value: unknown, turboAvailable?: boolean): ImageEngine` (без `turboAvailable` значение `"turbo"` сводится к `krea`)
  - `getImageModel(engine: SpaceEngine): ImageModelDef`, `getEngineCost(engine: ImageEngine): number`
  - `publicImageModels(options?: { turbo?: boolean }): PublicImageModel[]` (`id: ImageEngine`)

- [ ] **Шаг 1: Написать падающие тесты**

Заменить файл `src/lib/__tests__/models.test.ts` целиком:

```typescript
import { describe, expect, test } from "bun:test";
import {
	getEngineCost,
	getImageModel,
	isImageEngine,
	isSpaceEngine,
	publicImageModels,
	resolveImageEngine,
	TURBO_MODEL,
} from "../models";

describe("Image models", () => {
	test("Ideogram 4 дороже Krea 2", () => {
		expect(getImageModel("krea").cost).toBe(1);
		expect(getImageModel("ideogram").cost).toBe(3);
	});

	test("Турбо стоит 10 кредитов", () => {
		expect(TURBO_MODEL.cost).toBe(10);
		expect(getEngineCost("turbo")).toBe(10);
		expect(getEngineCost("krea")).toBe(1);
		expect(getEngineCost("ideogram")).toBe(3);
	});

	test("адреса Space разведены по движкам", () => {
		expect(getImageModel("krea").apiBase).toContain("krea-krea-2");
		expect(getImageModel("ideogram").apiBase).toContain(
			"ideogram-ai-ideogram4",
		);
	});

	test("resolveImageEngine: известное значение сохраняется, прочее → krea", () => {
		expect(resolveImageEngine("ideogram")).toBe("ideogram");
		expect(resolveImageEngine("krea")).toBe("krea");
		expect(resolveImageEngine("midjourney")).toBe("krea");
		expect(resolveImageEngine(undefined)).toBe("krea");
	});

	test("turbo без рабочего входа Codex неотличим от неизвестного движка", () => {
		expect(resolveImageEngine("turbo")).toBe("krea");
		expect(resolveImageEngine("turbo", false)).toBe("krea");
		expect(resolveImageEngine("turbo", true)).toBe("turbo");
		expect(resolveImageEngine("ideogram", true)).toBe("ideogram");
	});

	test("isImageEngine и isSpaceEngine", () => {
		expect(isImageEngine("krea")).toBe(true);
		expect(isImageEngine("ideogram")).toBe(true);
		expect(isImageEngine("turbo")).toBe(true);
		expect(isImageEngine("nope")).toBe(false);
		expect(isSpaceEngine("turbo")).toBe(false);
		expect(isSpaceEngine("krea")).toBe(true);
	});

	test("publicImageModels отдаёт только id, label и cost", () => {
		const list = publicImageModels();
		expect(new Set(list.map((m) => m.id))).toEqual(
			new Set(["krea", "ideogram"]),
		);
		for (const model of list) {
			expect(Object.keys(model).sort()).toEqual(["cost", "id", "label"]);
		}
	});

	test("Турбо попадает в список только когда доступен", () => {
		expect(publicImageModels({ turbo: false }).map((m) => m.id)).toEqual([
			"krea",
			"ideogram",
		]);
		const withTurbo = publicImageModels({ turbo: true });
		expect(withTurbo.map((m) => m.id)).toEqual(["krea", "ideogram", "turbo"]);
		expect(withTurbo.at(-1)).toEqual({ id: "turbo", label: "Турбо", cost: 10 });
	});
});
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
bun test src/lib/__tests__/models.test.ts
```

Ожидается: FAIL (`getEngineCost`, `isSpaceEngine`, `TURBO_MODEL` не экспортируются).

- [ ] **Шаг 3: Реализовать реестр**

Заменить файл `src/lib/models.ts` целиком:

```typescript
export type SpaceEngine = "krea" | "ideogram";
export type ImageEngine = SpaceEngine | "turbo";

export interface ImageModelDef {
	/** Отображаемое имя для интерфейса */
	label: string;
	/** Стоимость одной генерации в кредитах */
	cost: number;
	/** Базовый адрес Gradio API Space */
	apiBase: string;
	/** Именованный эндпоинт Space */
	apiName: string;
	/** Сколько ждать результат (очередь ZeroGPU + генерация), мс */
	pollTimeoutMs: number;
}

export const IMAGE_MODELS: Record<SpaceEngine, ImageModelDef> = {
	krea: {
		label: "Krea 2",
		cost: 1,
		apiBase: "https://krea-krea-2.hf.space/gradio_api",
		apiName: "generate",
		pollTimeoutMs: 120_000,
	},
	ideogram: {
		label: "Ideogram 4",
		cost: 3,
		apiBase: "https://ideogram-ai-ideogram4.hf.space/gradio_api",
		apiName: "generate",
		pollTimeoutMs: 180_000,
	},
};

/** Турбо: агент подбирает изображения из библиотеки и рисует через подписку ChatGPT. Без адреса Space. */
export const TURBO_MODEL = { label: "Турбо", cost: 10 } as const;

export const DEFAULT_IMAGE_ENGINE: SpaceEngine = "krea";

/** Пресет Ideogram 4: режим и число шагов фиксированы */
export const IDEOGRAM_MODE = "Default · 20 steps";
export const IDEOGRAM_STEPS = 20;

/** Имена движков для клиентского фолбэка, пока список моделей не загрузился */
export const IMAGE_ENGINE_LABELS: Record<ImageEngine, string> = {
	krea: IMAGE_MODELS.krea.label,
	ideogram: IMAGE_MODELS.ideogram.label,
	turbo: TURBO_MODEL.label,
};

export function isSpaceEngine(value: unknown): value is SpaceEngine {
	return value === "krea" || value === "ideogram";
}

export function isImageEngine(value: unknown): value is ImageEngine {
	return isSpaceEngine(value) || value === "turbo";
}

/**
 * Приводит произвольное значение из запроса к известному движку. Турбо принимается
 * только при рабочем входе Codex: иначе он «неизвестен», как любое другое значение.
 */
export function resolveImageEngine(
	value: unknown,
	turboAvailable = false,
): ImageEngine {
	if (value === "turbo") return turboAvailable ? "turbo" : DEFAULT_IMAGE_ENGINE;
	return isSpaceEngine(value) ? value : DEFAULT_IMAGE_ENGINE;
}

export function getImageModel(engine: SpaceEngine): ImageModelDef {
	return IMAGE_MODELS[engine];
}

export function getEngineCost(engine: ImageEngine): number {
	return engine === "turbo" ? TURBO_MODEL.cost : IMAGE_MODELS[engine].cost;
}

export interface PublicImageModel {
	id: ImageEngine;
	label: string;
	cost: number;
}

/** Безопасный для клиента список моделей (без внутренних адресов Space); Турбо — только когда доступен */
export function publicImageModels(
	options: { turbo?: boolean } = {},
): PublicImageModel[] {
	const spaces = (Object.keys(IMAGE_MODELS) as SpaceEngine[]).map((id) => ({
		id,
		label: IMAGE_MODELS[id].label,
		cost: IMAGE_MODELS[id].cost,
	}));
	return options.turbo
		? [
				...spaces,
				{ id: "turbo", label: TURBO_MODEL.label, cost: TURBO_MODEL.cost },
			]
		: spaces;
}
```

- [ ] **Шаг 4: Привести потребителей к `SpaceEngine`**

`src/lib/hf.ts`:

```diff
--- a/src/lib/hf.ts
+++ b/src/lib/hf.ts
@@ -1,13 +1,14 @@
 import {
+	DEFAULT_IMAGE_ENGINE,
 	getImageModel,
 	IDEOGRAM_MODE,
-	type ImageEngine,
-	resolveImageEngine,
+	isSpaceEngine,
+	type SpaceEngine,
 } from "./models";
 
 interface GenerateParams {
 	/** Движок генерации; по умолчанию Krea 2 */
-	engine?: ImageEngine;
+	engine?: SpaceEngine;
 	prompt: string;
 	negativePrompt?: string;
 	model?: "Turbo" | "Raw";
@@ -204,7 +205,7 @@
 }
 
 function buildPayload(
-	engine: ImageEngine,
+	engine: SpaceEngine,
 	params: GenerateParams,
 ): Record<string, unknown> {
 	const {
@@ -260,7 +261,9 @@
 	params: GenerateParams,
 	apiKey: string,
 ): Promise<GenerateResult> {
-	const engine = resolveImageEngine(params.engine);
+	const engine = isSpaceEngine(params.engine)
+		? params.engine
+		: DEFAULT_IMAGE_ENGINE;
 	const model = getImageModel(engine);
 
 	const data = await callSpace({
```

`src/components/ModelPicker.tsx` (в чипе только движки Space, Турбо переключается вкладками):

```diff
--- a/src/components/ModelPicker.tsx
+++ b/src/components/ModelPicker.tsx
@@ -15,12 +15,13 @@
 } from "@/components/ui/dropdown-menu";
 import {
 	IMAGE_ENGINE_LABELS,
-	type ImageEngine,
+	isSpaceEngine,
 	type PublicImageModel,
+	type SpaceEngine,
 } from "@/lib/models";
 
 const MODEL_ICONS: Record<
-	ImageEngine,
+	SpaceEngine,
 	ComponentType<{ className?: string }>
 > = {
 	krea: IconBrush,
@@ -29,8 +30,8 @@
 
 interface ModelPickerProps {
 	models: PublicImageModel[];
-	value: ImageEngine;
-	onChange: (engine: ImageEngine) => void;
+	value: SpaceEngine;
+	onChange: (engine: SpaceEngine) => void;
 	disabled?: boolean;
 }
 
@@ -40,9 +41,14 @@
 	onChange,
 	disabled,
 }: ModelPickerProps) {
-	const selected = models.find((model) => model.id === value);
+	// режим «Турбо» переключается вкладками, в чипе только движки Space
+	const spaceModels = models.filter(
+		(model): model is PublicImageModel & { id: SpaceEngine } =>
+			isSpaceEngine(model.id),
+	);
+	const selected = spaceModels.find((model) => model.id === value);
 	const label = selected?.label ?? IMAGE_ENGINE_LABELS[value];
-	const available = models.length > 0;
+	const available = spaceModels.length > 0;
 
 	const SelectedIcon = MODEL_ICONS[value] ?? IconSparkles;
 
@@ -65,9 +71,9 @@
 			<DropdownMenuContent align="start" className="w-44">
 				<DropdownMenuRadioGroup
 					value={value}
-					onValueChange={(next) => onChange(next as ImageEngine)}
+					onValueChange={(next) => onChange(next as SpaceEngine)}
 				>
-					{models.map((model) => {
+					{spaceModels.map((model) => {
 						const Icon = MODEL_ICONS[model.id] ?? IconSparkles;
 						return (
 							<DropdownMenuRadioItem
```

`src/components/Generate.tsx`: в импорте заменить `ImageEngine` на `SpaceEngine`, в состоянии тоже:

```tsx
import type { PublicImageModel, SpaceEngine } from "@/lib/models";
```

```tsx
const [engine, setEngine] = useState<SpaceEngine>("krea");
```

`src/api/generate.ts`: пока ветки Турбо нет, обработчик остаётся на движках Space (в задаче 9 эта привязка заменяется полной веткой):

```diff
--- a/src/api/generate.ts
+++ b/src/api/generate.ts
@@ -21,16 +21,17 @@
 	updateKeyQuota,
 } from "../lib/keys";
 import {
-	DEFAULT_IMAGE_ENGINE,
 	getImageModel,
 	IDEOGRAM_MODE,
 	IDEOGRAM_STEPS,
-	isSpaceEngine,
 	publicImageModels,
 	resolveImageEngine,
 } from "../lib/models";
 import { checkRateLimit } from "../lib/rate-limit";
 import { getImageUrl, uploadImage } from "../lib/storage";
+import { isTurboAvailable } from "../lib/turbo/codex-auth";
+import { turboDeps } from "../lib/turbo/runtime";
+import { generateTurbo } from "../lib/turbo/service";
 
 const MAX_ATTEMPTS = 5;
 
@@ -85,11 +86,13 @@
 
 export const generateRoutes = {
 	"/api/models": {
-		// публичный каталог движков: без секретов, можно кэшировать
-		GET: () =>
-			Response.json(publicImageModels(), {
-				headers: { "Cache-Control": "public, max-age=300" },
-			}),
+		// каталог движков без секретов; Турбо в нём только пока рабочий вход Codex
+		GET: async () => {
+			const turbo = await isTurboAvailable().catch(() => false);
+			return Response.json(publicImageModels({ turbo }), {
+				headers: { "Cache-Control": "private, max-age=60" },
+			});
+		},
 	},
 
 	"/api/generate": {
@@ -109,17 +112,26 @@
 			const body = await req.json();
 			const { prompt, negativePrompt, model, width, height, steps, seed } =
 				body;
-			const requested = resolveImageEngine(body.engine);
-			// Турбо подключается отдельной веткой (задача про сервис Турбо): до неё остаётся движок Space
-			const engine = isSpaceEngine(requested)
-				? requested
-				: DEFAULT_IMAGE_ENGINE;
-			const { cost } = getImageModel(engine);
+			// без рабочего входа Codex «turbo» ничем не отличается от неизвестного движка
+			const turboAvailable =
+				body.engine === "turbo" &&
+				(await isTurboAvailable().catch(() => false));
+			const engine = resolveImageEngine(body.engine, turboAvailable);
 
 			if (!prompt || prompt.length > 1000) {
 				return Response.json({ error: "Некорректный промпт" }, { status: 400 });
 			}
 
+			if (engine === "turbo") {
+				const outcome = await generateTurbo(
+					{ userId: session.user.id, prompt },
+					turboDeps,
+				);
+				return Response.json(outcome.body, { status: outcome.status });
+			}
+
+			const { cost } = getImageModel(engine);
+
 			let creditSpent = false;
 			let currentKey: Awaited<ReturnType<typeof getAvailableKey>> | null = null;
 			let enhanced: Awaited<ReturnType<typeof enhancePrompt>> | null = null;
```

- [ ] **Шаг 5: Тесты, типы, линтер**

```bash
bun test
```

```bash
bun run typecheck
```

```bash
bun run lint:fix
```

Ожидается: все тесты проходят, `typecheck` без ошибок, линтер без замечаний.

- [ ] **Шаг 6: Коммит**

```bash
git add src/lib/models.ts src/lib/hf.ts src/components/ModelPicker.tsx src/components/Generate.tsx src/api/generate.ts src/lib/__tests__/models.test.ts
```

```bash
git commit -m "feat(turbo): движок turbo в реестре моделей" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 3: Миграция БД

**Файлы:**
- Изменить: `migrations/custom-tables.sql` (дописать в конец)

**Интерфейсы:**
- Производит: колонка `generations.input_images text[]`; `generations_engine_check` допускает `turbo`; таблица `codex_auth` (одна строка: `id = 1`, `tokens jsonb`, `account_id`, `plan_type`, `last_error`, `updated_at`).

- [ ] **Шаг 1: Дописать миграцию**

В конец `migrations/custom-tables.sql` добавить (пустая строка в начале нужна):

```sql

-- Режим «Турбо»: движок turbo, входные изображения агента, вход подписки Codex
ALTER TABLE generations ADD COLUMN IF NOT EXISTS input_images TEXT[];

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_engine_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%turbo%'
  ) THEN
    ALTER TABLE generations DROP CONSTRAINT generations_engine_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generations_engine_check'
  ) THEN
    ALTER TABLE generations
      ADD CONSTRAINT generations_engine_check
      CHECK (engine IN ('krea', 'ideogram', 'turbo'));
  END IF;
END $$;

-- Вход подписки ChatGPT (одна строка): токены нужны и агенту, и запросу картинок
CREATE TABLE IF NOT EXISTS codex_auth (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tokens JSONB,
  account_id TEXT,
  plan_type TEXT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Блок сам обновляет прежнее ограничение (создаётся выше без `turbo`) и безопасен при повторном запуске.

- [ ] **Шаг 2: Накатить на dev-ветку базы дважды**

`db:migrate:dev` использует `.env.development` (ветка `dev`, продовую базу не трогает).

```bash
bun run db:migrate:dev
```

```bash
bun run db:migrate:dev
```

Ожидается оба раза: `✅ Миграции применены` (замечания `NOTICE ... already exists, skipping` допустимы).

- [ ] **Шаг 3: Проверить результат**

```bash
NODE_ENV=development bun -e 'import { sql } from "./src/lib/db"; console.log(await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ${"generations_engine_check"}`); console.log(await sql`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name = ${"codex_auth"} OR (table_name = ${"generations"} AND column_name = ${"input_images"}) ORDER BY table_name, ordinal_position`); process.exit(0)'
```

Ожидается: в `def` есть `'turbo'`; колонки `codex_auth` (`id`, `tokens jsonb`, `account_id`, `plan_type`, `last_error`, `updated_at`) и `generations.input_images ARRAY`.

- [ ] **Шаг 4: Коммит**

```bash
git add migrations/custom-tables.sql
```

```bash
git commit -m "feat(turbo): миграция — input_images, движок turbo, codex_auth" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 4: Библиотека изображений и её заливка

**Файлы:**
- Изменить: `src/lib/storage.ts`
- Создать: `src/lib/turbo/library.ts`, `scripts/sync-library.ts`
- Тест: `src/lib/__tests__/turbo-library.test.ts`

**Интерфейсы:**
- Потребляет: ничего из прежних задач.
- Производит (для задач 8, 9 и скриптов):
  - `LIBRARY_PREFIX = "library/"`, `DESCRIPTIONS_FILE = "описания.txt"`, `MAX_INPUT_IMAGES = 10`
  - `interface LibraryStorage { list(prefix: string): Promise<{ key: string; size: number }[]>; read(key: string): Promise<Uint8Array | null> }`
  - `class Library` с методами: `describeTree(): Promise<string>`; `listFolder(path: string): Promise<ListFolderResult>`; `readFile(path: string): Promise<ReadFileResult>`; `resolveImages(paths: string[]): Promise<ResolveImagesResult>`
  - `ResolvedImage = { path: string; mediaType: string; bytes: Uint8Array }`
  - `imageMediaType(name: string): string | null`, `parseLibraryPath`, `closestNames`, `pluralImages`
  - `listObjects(prefix): Promise<{ key: string; size: number }[]>` и `readObject(key): Promise<Uint8Array | null>` в `src/lib/storage.ts`

- [ ] **Шаг 1: Написать падающие тесты**

Создать `src/lib/__tests__/turbo-library.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test";
import {
	closestNames,
	Library,
	type LibraryStorage,
	MAX_INPUT_IMAGES,
	parseLibraryPath,
	pluralImages,
} from "../turbo/library";

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function makeStorage(extra: Record<string, Uint8Array> = {}) {
	const objects: Record<string, Uint8Array> = {
		"library/пятерка/a.png": PNG,
		"library/пятерка/b.png": PNG,
		"library/пятерка/описания.txt": new TextEncoder().encode(
			"a.png — первая\nb.png — вторая",
		),
		"library/эмблемы/flag_of_42.png": PNG,
		"library/скриншоты/описания.txt": new Uint8Array(),
		...extra,
	};
	const list = mock(async (prefix: string) =>
		Object.entries(objects)
			.filter(([key]) => key.startsWith(prefix))
			.map(([key, bytes]) => ({ key, size: bytes.byteLength })),
	);
	const read = mock(async (key: string) => objects[key] ?? null);
	return { storage: { list, read } satisfies LibraryStorage, list, read };
}

describe("parseLibraryPath", () => {
	test("принимает только «папка/файл»", () => {
		expect(parseLibraryPath("пятерка/a.png")).toEqual({
			folder: "пятерка",
			name: "a.png",
		});
		for (const bad of [
			"",
			"a.png",
			"../a.png",
			"пятерка/../a.png",
			"/пятерка/a.png",
			"пятерка/вложенная/a.png",
			"пятерка\\a.png",
			"пятерка/",
			"./a.png",
		]) {
			expect(parseLibraryPath(bad)).toBeNull();
		}
	});

	test("приводит имя к NFC", () => {
		const decomposed = "эмблемы/й.png";
		expect(parseLibraryPath(decomposed)?.name).toBe("й.png");
	});
});

describe("pluralImages", () => {
	test("склоняет число изображений", () => {
		expect(pluralImages(1)).toBe("1 изображение");
		expect(pluralImages(2)).toBe("2 изображения");
		expect(pluralImages(5)).toBe("5 изображений");
		expect(pluralImages(11)).toBe("11 изображений");
		expect(pluralImages(21)).toBe("21 изображение");
		expect(pluralImages(0)).toBe("0 изображений");
	});
});

describe("closestNames", () => {
	test("ставит похожие имена первыми", () => {
		expect(
			closestNames("flag_of_42.pn", ["a.png", "flag_of_42.png"], 1),
		).toEqual(["flag_of_42.png"]);
	});
});

describe("Library", () => {
	test("дерево: папки, число изображений, пустые помечены", async () => {
		const { storage } = makeStorage();
		const tree = await new Library(storage).describeTree();
		expect(tree).toBe(
			[
				"пятерка/ — 2 изображения",
				"скриншоты/ — пусто",
				"эмблемы/ — 1 изображение",
			].join("\n"),
		);
	});

	test("список кэшируется на минуту", async () => {
		const { storage, list } = makeStorage();
		let now = 1_000;
		const library = new Library(storage, () => now);
		await library.describeTree();
		await library.listFolder("пятерка");
		expect(list).toHaveBeenCalledTimes(1);
		now += 61_000;
		await library.describeTree();
		expect(list).toHaveBeenCalledTimes(2);
	});

	test("listFolder отдаёт файлы с типом, неизвестная папка — список папок", async () => {
		const library = new Library(makeStorage().storage);
		const ok = await library.listFolder("пятерка");
		expect(ok).toEqual({
			ok: true,
			path: "пятерка",
			files: [
				{ name: "a.png", kind: "image" },
				{ name: "b.png", kind: "image" },
				{ name: "описания.txt", kind: "text" },
			],
		});
		const missing = await library.listFolder("люди");
		expect(missing.ok).toBe(false);
		if (!missing.ok) {
			expect(missing.folders).toEqual(["пятерка", "скриншоты", "эмблемы"]);
		}
	});

	test("readFile: текст возвращается строкой, изображение — base64", async () => {
		const library = new Library(makeStorage().storage);
		const text = await library.readFile("пятерка/описания.txt");
		expect(text).toEqual({
			ok: true,
			kind: "text",
			path: "пятерка/описания.txt",
			text: "a.png — первая\nb.png — вторая",
		});
		const image = await library.readFile("пятерка/a.png");
		expect(image).toEqual({
			ok: true,
			kind: "image",
			path: "пятерка/a.png",
			mediaType: "image/png",
			base64: Buffer.from(PNG).toString("base64"),
		});
	});

	test("readFile: нет файла — ошибка с ближайшими именами", async () => {
		const library = new Library(makeStorage().storage);
		const result = await library.readFile("пятерка/a.pn");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.nearest[0]).toBe("a.png");
		}
	});

	test("readFile: путь вне формата не доходит до хранилища", async () => {
		const { storage, read } = makeStorage();
		const result = await new Library(storage).readFile("../.env");
		expect(result.ok).toBe(false);
		expect(read).not.toHaveBeenCalled();
	});

	test("resolveImages: сохраняет порядок и отдаёт байты", async () => {
		const library = new Library(makeStorage().storage);
		const result = await library.resolveImages([
			"эмблемы/flag_of_42.png",
			"пятерка/b.png",
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.images.map((image) => image.path)).toEqual([
				"эмблемы/flag_of_42.png",
				"пятерка/b.png",
			]);
			expect(result.images[0]!.bytes).toEqual(PNG);
			expect(result.images[0]!.mediaType).toBe("image/png");
		}
	});

	test("resolveImages: повтор файла разрешён, пустой список тоже", async () => {
		const library = new Library(makeStorage().storage);
		const twice = await library.resolveImages([
			"пятерка/a.png",
			"пятерка/a.png",
		]);
		expect(twice.ok && twice.images.length).toBe(2);
		expect(await library.resolveImages([])).toEqual({ ok: true, images: [] });
	});

	test("resolveImages: больше лимита и несуществующие пути отклоняются", async () => {
		const library = new Library(makeStorage().storage);
		const tooMany = await library.resolveImages(
			Array.from({ length: MAX_INPUT_IMAGES + 1 }, () => "пятерка/a.png"),
		);
		expect(tooMany.ok).toBe(false);
		const broken = await library.resolveImages([
			"пятерка/a.png",
			"пятерка/нет.png",
			"пятерка/описания.txt",
		]);
		expect(broken.ok).toBe(false);
		if (!broken.ok) {
			expect(broken.error).toContain("нет.png");
			expect(broken.error).toContain("не изображение");
		}
	});
});
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
bun test src/lib/__tests__/turbo-library.test.ts
```

Ожидается: FAIL, `Cannot find module '../turbo/library'`.

- [ ] **Шаг 3: Реализовать библиотеку**

Создать `src/lib/turbo/library.ts`. Библиотека для агента, это файловая система только для чтения: папки и файлы, пути вида `папка/файл`, всё остальное отклоняется до обращения к хранилищу.

```typescript
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

	/** Дерево для системной инструкции: папки и число изображений, пустые помечены */
	async describeTree(): Promise<string> {
		const folders = await this.folders();
		return [...folders.keys()]
			.sort((a, b) => a.localeCompare(b))
			.map((folder) => {
				const images = folders
					.get(folder)!
					.filter((file) => file.kind === "image").length;
				return `${folder}/ — ${images === 0 ? "пусто" : pluralImages(images)}`;
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
```

Если в задаче 1 потолок оказался меньше 10, изменить `MAX_INPUT_IMAGES`.

- [ ] **Шаг 4: Чтение бакета в `storage.ts`**

```diff
--- a/src/lib/storage.ts
+++ b/src/lib/storage.ts
@@ -35,3 +35,34 @@
 	const file = s3Client.file(key);
 	await file.delete();
 }
+
+export interface StoredObject {
+	key: string;
+	size: number;
+}
+
+/** Все объекты под префиксом (постранично) */
+export async function listObjects(prefix: string): Promise<StoredObject[]> {
+	const objects: StoredObject[] = [];
+	let continuationToken: string | undefined;
+	do {
+		const page = await s3Client.list({
+			prefix,
+			...(continuationToken ? { continuationToken } : {}),
+		});
+		for (const item of page.contents ?? []) {
+			objects.push({ key: item.key, size: item.size ?? 0 });
+		}
+		continuationToken = page.isTruncated
+			? page.nextContinuationToken
+			: undefined;
+	} while (continuationToken);
+	return objects;
+}
+
+/** Содержимое объекта; нет объекта — null */
+export async function readObject(key: string): Promise<Uint8Array | null> {
+	const file = s3Client.file(key);
+	if (!(await file.exists())) return null;
+	return file.bytes();
+}
```

- [ ] **Шаг 5: Тесты проходят**

```bash
bun test src/lib/__tests__/turbo-library.test.ts
```

Ожидается: `13 pass`.

- [ ] **Шаг 6: Скрипт заливки библиотеки**

Создать `scripts/sync-library.ts`. Он идемпотентен (объект того же размера пропускается), показывает, в какое хранилище льёт, и на prod работает только с флагом `--yes-prod` и только при полных описаниях:

```typescript
/**
 * Заливает библиотеку входных изображений Турбо в хранилище (префикс library/).
 * Источник — папка library/ в корне репозитория: за его пределы скрипт не смотрит.
 * Идемпотентно: объект с тем же размером пропускается. Агент о хранилище не знает.
 *
 *   bun scripts/sync-library.ts [--dry-run]                    # dev (.env.development)
 *   NODE_ENV=production bun scripts/sync-library.ts --yes-prod # prod, только с разрешения владельца
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
```

- [ ] **Шаг 7: Залить библиотеку в dev-бакет и проверить кириллические ключи**

Сначала пробный прогон:

```bash
bun scripts/sync-library.ts --dry-run
```

Ожидается: строка `Хранилище: ..., бакет ...` (убедиться, что это dev-бакет), 34 строки `[пробно] загрузка library/...` (33 изображения и один маркер `скриншоты/описания.txt`: так в бакете появляется пустая папка), список `Проблемы с описаниями` (описаний пока нет, для dev это допустимо). Затем настоящая заливка:

```bash
bun scripts/sync-library.ts
```

И повторный запуск должен ничего не грузить:

```bash
bun scripts/sync-library.ts
```

Ожидается во второй раз: `Готово: загружено 0, без изменений 34, лишних 0`.

Проверка чтения и дерева (в том числе кириллические имена папок и файлов в S3):

```bash
bun -e 'import { Library } from "./src/lib/turbo/library"; import { listObjects, readObject } from "./src/lib/storage"; const lib = new Library({ list: listObjects, read: readObject }); console.log(await lib.describeTree()); const r = await lib.readFile("пятерка/pyatorka_defo_grayscale.png"); console.log(r.ok ? r.kind + " " + r.base64.length : r); process.exit(0)'
```

Ожидается:

```
артефакты/ — 7 изображений
личности/ — 7 изображений
одежда/ — 1 изображение
пятерка/ — 10 изображений
скриншоты/ — пусто
существа/ — 4 изображения
эмблемы/ — 4 изображения
image 406284
```

(число после `image` — длина base64: файл 304712 байт даёт 406284 символа.)

- [ ] **Шаг 8: Линтер и коммит**

```bash
bun run lint:fix
```

```bash
bun run typecheck
```

```bash
git add src/lib/storage.ts src/lib/turbo/library.ts src/lib/__tests__/turbo-library.test.ts scripts/sync-library.ts
```

```bash
git commit -m "feat(turbo): библиотека изображений и скрипт заливки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 5: Вход Codex: хранилище токенов, статус, проверка, поток входа

**Файлы:**
- Создать: `src/lib/turbo/constants.ts`, `src/lib/turbo/codex-events.ts`, `src/lib/turbo/codex-auth.ts`
- Тест: `src/lib/__tests__/turbo-codex-auth.test.ts`

**Интерфейсы:**
- Потребляет: таблицу `codex_auth` (задача 3).
- Производит (для задач 8, 9, 10, 11 и скриптов):
  - `constants.ts`: `TURBO_AGENT_MODEL = "gpt-6-luna"`, `TURBO_MAX_STEPS = 12`, `TURBO_TIMEOUT_MS = 270_000`
  - `codex-events.ts`: `CodexStatus { loggedIn; planType; updatedAt; lastError }`, `CodexLoginEvent` (`code` | `done` | `error`), `CodexCheckResult`
  - `codex-auth.ts`: `class DbTokenStore implements TokenStore` (`load`, `save`, `clear`, `withLock`); `createCodexAuth(db?): OpenAIOAuth`; `codexFetch(auth): typeof fetch`; `codexLanguageModel(auth, modelId)`; `getCodexStatus(db?)`; `isTurboAvailable(db?)`; `recordCodexError(message, db?)`; `checkCodex(auth, db?)`; `codexLoginStream(auth, signal?): ReadableStream<Uint8Array>`; `CODEX_ORIGINATOR`

Токены хранятся в БД так же, как ключи в `api_keys` (открытым текстом, наружу не отдаются). `OpenAIOAuth` создаётся на каждое использование: он помнит токены только на время своей жизни, поэтому чужое обновление или выход подхватываются из базы. Обновление токена идёт под `pg_advisory_xact_lock`, чтобы параллельные запросы не ломали сессию.

- [ ] **Шаг 1: Константы и типы обмена**

`src/lib/turbo/constants.ts` (если в задаче 1 модель заменена, записать её слаг):

```typescript
/** Модель агента Турбо в подписке ChatGPT (проверяется кнопкой «Проверить» в админке) */
export const TURBO_AGENT_MODEL = "gpt-6-luna";
/** Верхняя граница ходов агента; обычный прогон — 2–4 раунда */
export const TURBO_MAX_STEPS = 12;
/** Весь запуск должен уложиться в лимит функции Vercel (300 с) с запасом на загрузку и запись */
export const TURBO_TIMEOUT_MS = 270_000;
```

`src/lib/turbo/codex-events.ts` (типы без серверных импортов: их использует фронтенд админки):

```typescript
/** Типы обмена админки с входом Codex: без серверных импортов, чтобы фронтенд мог их использовать */

export interface CodexStatus {
	loggedIn: boolean;
	planType: string | null;
	updatedAt: string | null;
	lastError: string | null;
}

/** События потока входа по коду (NDJSON, по одному JSON в строке) */
export type CodexLoginEvent =
	| {
			type: "code";
			userCode: string;
			verificationUrl: string;
			expiresAt: number;
	  }
	| { type: "done"; planType: string | null }
	| { type: "error"; message: string };

export type CodexCheckResult =
	| { ok: true; models: string[] }
	| { ok: false; models: string[]; error: string };
```

- [ ] **Шаг 2: Написать падающие тесты**

Создать `src/lib/__tests__/turbo-codex-auth.test.ts`:

```typescript
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	MemoryTokenStore,
	OpenAIOAuth,
	type OpenAIOAuthTokens,
} from "openai-oauth-ai-provider/core";
import {
	checkCodex,
	codexLoginStream,
	DbTokenStore,
	getCodexStatus,
	isTurboAvailable,
} from "../turbo/codex-auth";

const TOKENS: OpenAIOAuthTokens = {
	accessToken: "access",
	idToken: "id",
	refreshToken: "refresh",
	accountId: "acc-1",
	planType: "plus",
	updatedAt: Date.now(),
};

function fakeSql(responses: Record<string, unknown[]> = {}) {
	const queries: { text: string; values: unknown[] }[] = [];
	const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
		const text = strings.join("?");
		queries.push({ text, values });
		for (const [pattern, rows] of Object.entries(responses)) {
			if (text.includes(pattern)) return Promise.resolve(rows);
		}
		return Promise.resolve([]);
	};
	fn.json = (value: unknown) => ({ json: value });
	fn.begin = async (callback: (tx: typeof fn) => unknown) => callback(fn);
	return { sql: fn as never, queries };
}

describe("DbTokenStore", () => {
	test("save: одна строка, токены как json, ошибка сбрасывается", async () => {
		const { sql, queries } = fakeSql();
		await new DbTokenStore(sql).save(TOKENS);
		const query = queries[0]!;
		expect(query.text).toContain("INSERT INTO codex_auth");
		expect(query.text).toContain("ON CONFLICT (id) DO UPDATE");
		expect(query.text).toContain("last_error = NULL");
		expect(query.values).toContain("acc-1");
		expect(query.values).toContain("plus");
		expect(query.values).toContainEqual({ json: TOKENS });
	});

	test("load: возвращает токены, пустую таблицу и мусор — как отсутствие входа", async () => {
		const present = fakeSql({ "SELECT tokens": [{ tokens: TOKENS }] });
		expect(await new DbTokenStore(present.sql).load()).toEqual(TOKENS);
		expect(await new DbTokenStore(fakeSql().sql).load()).toBeUndefined();
		const broken = fakeSql({
			"SELECT tokens": [{ tokens: { accessToken: 1 } }],
		});
		expect(await new DbTokenStore(broken.sql).load()).toBeUndefined();
	});

	test("clear удаляет строку", async () => {
		const { sql, queries } = fakeSql();
		await new DbTokenStore(sql).clear();
		expect(queries[0]!.text).toContain("DELETE FROM codex_auth");
	});

	test("withLock берёт advisory-блокировку до операции и отдаёт её результат", async () => {
		const { sql, queries } = fakeSql();
		const order: string[] = [];
		const store = new DbTokenStore(sql);
		const result = await store.withLock(async () => {
			order.push(`операция после ${queries.length} запросов`);
			return 42;
		});
		expect(result).toBe(42);
		expect(queries[0]!.text).toContain("pg_advisory_xact_lock");
		expect(order).toEqual(["операция после 1 запросов"]);
	});
});

describe("состояние входа", () => {
	test("getCodexStatus: нет строки — не вошли", async () => {
		expect(await getCodexStatus(fakeSql().sql)).toEqual({
			loggedIn: false,
			planType: null,
			updatedAt: null,
			lastError: null,
		});
	});

	test("getCodexStatus: тариф, время и ошибка", async () => {
		const { sql } = fakeSql({
			"FROM codex_auth": [
				{
					plan_type: "plus",
					last_error: "refresh_failed",
					updated_at: new Date("2026-10-05T10:00:00Z"),
					logged_in: true,
				},
			],
		});
		expect(await getCodexStatus(sql)).toEqual({
			loggedIn: true,
			planType: "plus",
			updatedAt: "2026-10-05T10:00:00.000Z",
			lastError: "refresh_failed",
		});
	});

	test("isTurboAvailable: нужен вход без пометки об ошибке", async () => {
		const yes = fakeSql({ "FROM codex_auth": [{ "?column?": 1 }] });
		expect(await isTurboAvailable(yes.sql)).toBe(true);
		expect(yes.queries[0]!.text).toContain("last_error IS NULL");
		expect(await isTurboAvailable(fakeSql().sql)).toBe(false);
	});
});

describe("codexLoginStream", () => {
	async function readEvents(stream: ReadableStream<Uint8Array>) {
		const text = await new Response(stream).text();
		return text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	}

	test("код и ссылка, затем итог", async () => {
		const stream = codexLoginStream({
			loginWithDeviceCode: async ({ onVerification }) => {
				await onVerification?.({
					userCode: "ABCD-1234",
					verificationUrl: "https://auth.openai.com/codex/device",
					expiresAt: 123,
				});
				return TOKENS;
			},
		});
		expect(await readEvents(stream)).toEqual([
			{
				type: "code",
				userCode: "ABCD-1234",
				verificationUrl: "https://auth.openai.com/codex/device",
				expiresAt: 123,
			},
			{ type: "done", planType: "plus" },
		]);
	});

	test("ошибка входа — событие error, поток закрывается", async () => {
		const stream = codexLoginStream({
			loginWithDeviceCode: async () => {
				throw new Error("device_authorization_timeout");
			},
		});
		expect(await readEvents(stream)).toEqual([
			{ type: "error", message: "device_authorization_timeout" },
		]);
	});
});

describe("checkCodex", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function authWithTokens() {
		return new OpenAIOAuth({ tokenStore: new MemoryTokenStore(TOKENS) });
	}

	test("модель агента есть — ошибка сбрасывается", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ models: [{ slug: "gpt-6-luna" }, { slug: "gpt-5.4" }] }),
		) as never;
		const { sql, queries } = fakeSql();
		const result = await checkCodex(authWithTokens(), sql);
		expect(result).toEqual({ ok: true, models: ["gpt-6-luna", "gpt-5.4"] });
		expect(queries[0]!.text).toContain("last_error = NULL");
	});

	test("модели агента нет — ошибка записывается, Турбо скроется", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ models: [{ slug: "gpt-5.4" }] }),
		) as never;
		const { sql, queries } = fakeSql();
		const result = await checkCodex(authWithTokens(), sql);
		expect(result.ok).toBe(false);
		expect(queries[0]!.text).toContain("SET last_error =");
		expect(String(queries[0]!.values[0])).toContain("gpt-6-luna");
	});

	test("запрос моделей упал — ошибка записывается", async () => {
		globalThis.fetch = mock(
			async () => new Response("no", { status: 403 }),
		) as never;
		const { sql, queries } = fakeSql();
		const result = await checkCodex(authWithTokens(), sql);
		expect(result.ok).toBe(false);
		expect(queries[0]!.text).toContain("SET last_error =");
	});
});
```

- [ ] **Шаг 3: Убедиться, что тесты падают**

```bash
bun test src/lib/__tests__/turbo-codex-auth.test.ts
```

Ожидается: FAIL, `Cannot find module '../turbo/codex-auth'`.

- [ ] **Шаг 4: Реализовать вход**

Создать `src/lib/turbo/codex-auth.ts`:

```typescript
import { createOpenAIOAuthProvider } from "openai-oauth-ai-provider/ai-sdk";
import { codex } from "openai-oauth-ai-provider/codex";
import {
	createAuthenticatedFetch,
	DEFAULT_ORIGINATOR,
	type DeviceAuthorization,
	OpenAIOAuth,
	type OpenAIOAuthTokens,
	type TokenStore,
} from "openai-oauth-ai-provider/core";
import { sql as defaultSql } from "../db";
import type {
	CodexCheckResult,
	CodexLoginEvent,
	CodexStatus,
} from "./codex-events";
import { TURBO_AGENT_MODEL } from "./constants";

type Sql = typeof defaultSql;

/**
 * Заголовок originator для запросов подписки. Если Codex перестанет принимать значение
 * пакета, задайте CODEX_ORIGINATOR в окружении (клиент Codex шлёт `codex_cli_rs`).
 */
export const CODEX_ORIGINATOR =
	process.env.CODEX_ORIGINATOR ?? DEFAULT_ORIGINATOR;

/** Ключ блокировки Postgres: обновление токена идёт строго по одному, во всех экземплярах функции */
const REFRESH_LOCK_KEY = 4_200_042;

function isTokens(value: unknown): value is OpenAIOAuthTokens {
	if (typeof value !== "object" || value === null) return false;
	const tokens = value as Partial<OpenAIOAuthTokens>;
	return (
		typeof tokens.accessToken === "string" &&
		typeof tokens.idToken === "string" &&
		typeof tokens.refreshToken === "string" &&
		typeof tokens.updatedAt === "number"
	);
}

/** Токены подписки в таблице `codex_auth` (одна строка). Наружу не отдаются. */
export class DbTokenStore implements TokenStore {
	constructor(private readonly db: Sql = defaultSql) {}

	async load(): Promise<OpenAIOAuthTokens | undefined> {
		const rows = await this.db`SELECT tokens FROM codex_auth WHERE id = 1`;
		const tokens = rows[0]?.tokens;
		return isTokens(tokens) ? tokens : undefined;
	}

	async save(tokens: OpenAIOAuthTokens): Promise<void> {
		const json = this.db.json(tokens as unknown as Parameters<Sql["json"]>[0]);
		await this.db`
      INSERT INTO codex_auth (id, tokens, account_id, plan_type, last_error, updated_at)
      VALUES (1, ${json}, ${tokens.accountId ?? null}, ${tokens.planType ?? null}, NULL, NOW())
      ON CONFLICT (id) DO UPDATE SET
        tokens = EXCLUDED.tokens,
        account_id = EXCLUDED.account_id,
        plan_type = EXCLUDED.plan_type,
        last_error = NULL,
        updated_at = NOW()
    `;
	}

	async clear(): Promise<void> {
		await this.db`DELETE FROM codex_auth WHERE id = 1`;
	}

	async withLock<T>(operation: () => Promise<T>): Promise<T> {
		const result = await this.db.begin(async (tx) => {
			await tx`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_KEY}::bigint)`;
			return operation();
		});
		return result as T;
	}
}

/**
 * Новый менеджер входа на каждое использование: он помнит токены только в
 * пределах своей жизни, поэтому чужое обновление или выход подхватываются
 * из базы, а не из памяти давно живущего экземпляра функции.
 */
export function createCodexAuth(db: Sql = defaultSql): OpenAIOAuth {
	return new OpenAIOAuth({ tokenStore: new DbTokenStore(db) });
}

/** fetch для запросов к Codex с подставленным входом (заголовки, обновление токена) */
export function codexFetch(auth: OpenAIOAuth): typeof globalThis.fetch {
	return createAuthenticatedFetch(auth, { originator: CODEX_ORIGINATOR });
}

/** Языковая модель агента через подписку */
export function codexLanguageModel(auth: OpenAIOAuth, modelId: string) {
	return createOpenAIOAuthProvider({ auth, originator: CODEX_ORIGINATOR })(
		modelId,
	);
}

export async function getCodexStatus(
	db: Sql = defaultSql,
): Promise<CodexStatus> {
	const rows = await db`
    SELECT plan_type, last_error, updated_at, tokens IS NOT NULL AS logged_in
    FROM codex_auth WHERE id = 1
  `;
	const row = rows[0];
	if (!row) {
		return {
			loggedIn: false,
			planType: null,
			updatedAt: null,
			lastError: null,
		};
	}
	return {
		loggedIn: Boolean(row.logged_in),
		planType: row.plan_type ?? null,
		updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
		lastError: row.last_error ?? null,
	};
}

/** Турбо существует для пользователей, пока есть вход и он не помечен нерабочим */
export async function isTurboAvailable(db: Sql = defaultSql): Promise<boolean> {
	const rows = await db`
    SELECT 1 FROM codex_auth
    WHERE id = 1 AND tokens IS NOT NULL AND last_error IS NULL
  `;
	return rows.length > 0;
}

export async function recordCodexError(
	message: string,
	db: Sql = defaultSql,
): Promise<void> {
	await db`
    UPDATE codex_auth SET last_error = ${message.slice(0, 1000)}, updated_at = NOW()
    WHERE id = 1
  `;
}

async function clearCodexError(db: Sql): Promise<void> {
	await db`UPDATE codex_auth SET last_error = NULL WHERE id = 1`;
}

/** «Проверить»: вход жив и на аккаунте есть модель агента */
export async function checkCodex(
	auth: OpenAIOAuth,
	db: Sql = defaultSql,
): Promise<CodexCheckResult> {
	const client = codex({ auth, originator: CODEX_ORIGINATOR });
	let slugs: string[];
	try {
		slugs = (await client.listCodexModels()).map((model) => model.slug);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await recordCodexError(message, db);
		return { ok: false, models: [], error: message };
	}
	if (!slugs.includes(TURBO_AGENT_MODEL)) {
		const message = `Модель ${TURBO_AGENT_MODEL} недоступна на этом аккаунте`;
		await recordCodexError(message, db);
		return { ok: false, models: slugs, error: message };
	}
	await clearCodexError(db);
	return { ok: true, models: slugs };
}

export interface DeviceLogin {
	loginWithDeviceCode(options: {
		onVerification?: (
			authorization: DeviceAuthorization,
		) => void | Promise<void>;
		signal?: AbortSignal;
	}): Promise<OpenAIOAuthTokens>;
}

/**
 * Вход по коду как поток NDJSON: сначала код и ссылка, затем итог. Пакет держит
 * ожидание подтверждения в памяти этого вызова, поэтому ответ живёт, пока админ
 * вводит код.
 */
export function codexLoginStream(
	auth: DeviceLogin,
	signal?: AbortSignal,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: CodexLoginEvent) => {
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};
			try {
				const tokens = await auth.loginWithDeviceCode({
					...(signal ? { signal } : {}),
					onVerification: ({ userCode, verificationUrl, expiresAt }) =>
						send({ type: "code", userCode, verificationUrl, expiresAt }),
				});
				send({ type: "done", planType: tokens.planType ?? null });
			} catch (error) {
				send({
					type: "error",
					message: error instanceof Error ? error.message : String(error),
				});
			} finally {
				controller.close();
			}
		},
	});
}
```

Импорты берутся из подпутей пакета (`/core`, `/ai-sdk`, `/codex`), чтобы в серверный бандл не попадал адаптер TanStack.

- [ ] **Шаг 5: Тесты проходят**

```bash
bun test src/lib/__tests__/turbo-codex-auth.test.ts
```

Ожидается: `12 pass`.

- [ ] **Шаг 6: Проверка на настоящей базе (dev-ветка)**

Модульные тесты используют подменённый SQL. Здесь проверяются запись токенов в `jsonb` без двойного кодирования и взаимное исключение `withLock`. Скрипт отказывается работать, если в `codex_auth` уже есть вход (чтобы не затереть вход владельца).

```bash
NODE_ENV=development bun -e 'import { sql } from "./src/lib/db"; import { DbTokenStore } from "./src/lib/turbo/codex-auth"; const existing = await sql`SELECT 1 FROM codex_auth`; if (existing.length) { console.log("ПРОПУСК: в dev-базе уже есть вход Codex"); process.exit(0); } const store = new DbTokenStore(sql); const t = { accessToken: "a", idToken: "i", refreshToken: "r", accountId: "acc", planType: "plus", updatedAt: 123 }; await store.save(t); console.log("roundtrip:", Bun.deepEquals(await store.load(), t), "тип в БД:", (await sql`SELECT jsonb_typeof(tokens) AS t FROM codex_auth`)[0]?.t); const order: string[] = []; await Promise.all([1, 2].map((n) => store.withLock(async () => { order.push("start" + n); await Bun.sleep(300); order.push("end" + n); }))); console.log("порядок:", order.join(" ")); await store.clear(); console.log("после clear:", await store.load()); process.exit(0)'
```

Ожидается: `roundtrip: true тип в БД: object`, порядок без перемежения (`start1 end1 start2 end2` или `start2 end2 start1 end1`), `после clear: undefined`.

- [ ] **Шаг 7: Линтер, типы, коммит**

```bash
bun run lint:fix
```

```bash
bun run typecheck
```

```bash
git add src/lib/turbo/constants.ts src/lib/turbo/codex-events.ts src/lib/turbo/codex-auth.ts src/lib/__tests__/turbo-codex-auth.test.ts
```

```bash
git commit -m "feat(turbo): вход Codex — токены в БД, статус, проверка, поток входа" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 6: Клиент Codex Images

**Файлы:**
- Создать: `src/lib/turbo/codex-images.ts`
- Тест: `src/lib/__tests__/turbo-codex-images.test.ts`

**Интерфейсы:**
- Потребляет: ничего (получает готовый `fetch` с входом).
- Производит (для задач 8 и 9):
  - `CODEX_IMAGE_MODEL = "gpt-image-2"`
  - `interface CodexImageInput { mediaType: string; bytes: Uint8Array }`
  - `interface EditImageParams { fetch: typeof fetch; prompt: string; images: CodexImageInput[]; signal?: AbortSignal }`
  - `interface EditImageResult { png: Uint8Array; size: string | null; quality: string | null }`
  - `class CodexImageError extends Error { status: number | null }`
  - `editImage(params: EditImageParams): Promise<EditImageResult>`: без входных изображений идёт в `/images/generations`, с ними в `/images/edits` (изображения inline как data URL, порядок массива задаёт Image 1…N)

- [ ] **Шаг 1: Написать падающие тесты**

Создать `src/lib/__tests__/turbo-codex-images.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test";
import { CodexImageError, editImage } from "../turbo/codex-images";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function fakeFetch(response: Response) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = mock(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return response;
	});
	return { fetch: fn as unknown as typeof fetch, calls };
}

describe("editImage", () => {
	test("с изображениями — /images/edits, inline data URL в порядке массива", async () => {
		const ok = Response.json({
			created: 1,
			data: [{ b64_json: Buffer.from(PNG).toString("base64") }],
			size: "1024x1536",
			quality: "medium",
		});
		const { fetch, calls } = fakeFetch(ok);
		const result = await editImage({
			fetch,
			prompt: "Image 1 on a throne",
			images: [
				{ mediaType: "image/png", bytes: new Uint8Array([1, 2]) },
				{ mediaType: "image/jpeg", bytes: new Uint8Array([3]) },
			],
		});

		expect(calls[0]!.url).toBe(
			"https://chatgpt.com/backend-api/codex/images/edits",
		);
		const body = JSON.parse(String(calls[0]!.init.body));
		expect(body).toEqual({
			prompt: "Image 1 on a throne",
			model: "gpt-image-2",
			n: 1,
			quality: "medium",
			size: "1024x1024",
			images: [
				{ image_url: "data:image/png;base64,AQI=" },
				{ image_url: "data:image/jpeg;base64,Aw==" },
			],
		});
		expect(calls[0]!.init.method).toBe("POST");
		expect(result.png).toEqual(PNG);
		expect(result.size).toBe("1024x1536");
		expect(result.quality).toBe("medium");
	});

	test("без изображений — /images/generations без поля images", async () => {
		const ok = Response.json({
			data: [{ b64_json: Buffer.from(PNG).toString("base64") }],
		});
		const { fetch, calls } = fakeFetch(ok);
		const result = await editImage({ fetch, prompt: "a cat", images: [] });
		expect(calls[0]!.url).toBe(
			"https://chatgpt.com/backend-api/codex/images/generations",
		);
		expect(JSON.parse(String(calls[0]!.init.body)).images).toBeUndefined();
		expect(result.size).toBeNull();
	});

	test("не-2xx превращается в CodexImageError со статусом и текстом", async () => {
		const { fetch } = fakeFetch(
			new Response("content policy", { status: 400 }),
		);
		const error = await editImage({ fetch, prompt: "x", images: [] }).catch(
			(e) => e,
		);
		expect(error).toBeInstanceOf(CodexImageError);
		expect(error.status).toBe(400);
		expect(error.message).toContain("content policy");
	});

	test("ответ без картинки — ошибка", async () => {
		const { fetch } = fakeFetch(Response.json({ data: [] }));
		await expect(editImage({ fetch, prompt: "x", images: [] })).rejects.toThrow(
			"не вернул изображение",
		);
	});

	test("сетевая ошибка оборачивается, отмена пробрасывается как есть", async () => {
		const network = (async () => {
			throw new Error("socket closed");
		}) as unknown as typeof fetch;
		const wrapped = await editImage({
			fetch: network,
			prompt: "x",
			images: [],
		}).catch((e) => e);
		expect(wrapped).toBeInstanceOf(CodexImageError);
		expect(wrapped.status).toBeNull();

		const controller = new AbortController();
		controller.abort();
		const aborted = await editImage({
			fetch: network,
			prompt: "x",
			images: [],
			signal: controller.signal,
		}).catch((e) => e);
		expect(aborted).not.toBeInstanceOf(CodexImageError);
	});
});
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
bun test src/lib/__tests__/turbo-codex-images.test.ts
```

Ожидается: FAIL, `Cannot find module '../turbo/codex-images'`.

- [ ] **Шаг 3: Реализовать клиент**

Создать `src/lib/turbo/codex-images.ts`:

```typescript
import { CHATGPT_CODEX_BASE_URL } from "openai-oauth-ai-provider/core";

/** Модель, качество и размер Codex считает рекомендацией: окончательно решает сервер */
export const CODEX_IMAGE_MODEL = "gpt-image-2";
export const CODEX_IMAGE_QUALITY = "medium";
export const CODEX_IMAGE_SIZE = "1024x1024";

export interface CodexImageInput {
	mediaType: string;
	bytes: Uint8Array;
}

export interface EditImageParams {
	/** fetch с подставленным входом подписки (`createAuthenticatedFetch`) */
	fetch: typeof globalThis.fetch;
	prompt: string;
	/** Входные изображения; Image 1…N в промпте — порядок этого массива */
	images: CodexImageInput[];
	signal?: AbortSignal;
}

export interface EditImageResult {
	png: Uint8Array;
	/** Фактические параметры, которые выбрал сервер */
	size: string | null;
	quality: string | null;
}

export class CodexImageError extends Error {
	constructor(
		message: string,
		public readonly status: number | null,
	) {
		super(message);
		this.name = "CodexImageError";
	}
}

const MAX_ERROR_BODY = 500;

function toDataUrl(image: CodexImageInput): string {
	return `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`;
}

interface ImageResponseBody {
	data?: { b64_json?: unknown }[];
	size?: unknown;
	quality?: unknown;
}

/**
 * Рисует картинку через Codex Images. Без входных изображений — `/images/generations`,
 * с ними — `/images/edits` (изображения уходят inline как data URL).
 */
export async function editImage(
	params: EditImageParams,
): Promise<EditImageResult> {
	const { images, prompt } = params;
	const base = {
		prompt,
		model: CODEX_IMAGE_MODEL,
		n: 1,
		quality: CODEX_IMAGE_QUALITY,
		size: CODEX_IMAGE_SIZE,
	};
	const path = images.length > 0 ? "images/edits" : "images/generations";
	const body =
		images.length > 0
			? {
					...base,
					images: images.map((image) => ({ image_url: toDataUrl(image) })),
				}
			: base;

	let response: Response;
	try {
		response = await params.fetch(`${CHATGPT_CODEX_BASE_URL}/${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(body),
			...(params.signal ? { signal: params.signal } : {}),
		});
	} catch (error) {
		if (params.signal?.aborted) throw error;
		throw new CodexImageError(
			`Не удалось обратиться к Codex Images: ${error instanceof Error ? error.message : String(error)}`,
			null,
		);
	}

	if (!response.ok) {
		const text = (await response.text().catch(() => "")).slice(
			0,
			MAX_ERROR_BODY,
		);
		throw new CodexImageError(
			`Codex Images ответил ${response.status}: ${text}`,
			response.status,
		);
	}

	let json: ImageResponseBody;
	try {
		json = (await response.json()) as ImageResponseBody;
	} catch {
		throw new CodexImageError("Codex Images вернул не JSON", response.status);
	}
	const b64 = json.data?.[0]?.b64_json;
	if (typeof b64 !== "string" || b64.length === 0) {
		throw new CodexImageError(
			"Codex Images не вернул изображение",
			response.status,
		);
	}
	return {
		png: new Uint8Array(Buffer.from(b64, "base64")),
		size: typeof json.size === "string" ? json.size : null,
		quality: typeof json.quality === "string" ? json.quality : null,
	};
}
```

- [ ] **Шаг 4: Тесты проходят, коммит**

```bash
bun test src/lib/__tests__/turbo-codex-images.test.ts
```

Ожидается: `5 pass`.

```bash
bun run lint:fix
```

```bash
git add src/lib/turbo/codex-images.ts src/lib/__tests__/turbo-codex-images.test.ts
```

```bash
git commit -m "feat(turbo): клиент Codex Images" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 7: Промпты: общие блоки канона и инструкция агента

Блоки канона, которые в черновике инструкции агента совпадают с `style42.system.ts` дословно, выносятся в `canon.ts` и подключаются в обе инструкции. Разделение делает одноразовый скрипт, чтобы не переписывать сотни строк вручную. Хеш `STYLE_VERSION` инструкции обогащения при этом **не должен измениться**: по нему сравниваются итерации стиля и он пишется в `generations.style_version`.

**Файлы:**
- Создать скриптом: `src/lib/prompts/canon.ts`, `src/lib/prompts/turbo.system.ts`
- Изменить скриптом: `src/lib/prompts/style42.system.ts`
- Изменить: `docs/superpowers/specs/2026-10-05-turbo-agent-prompt.md` (пометка в шапке)
- Тест: `src/lib/__tests__/turbo-prompt.test.ts`

**Интерфейсы:**
- Потребляет: `STYLE_SYSTEM`, `STYLE_VERSION` из `src/lib/prompts` (должны остаться прежними).
- Производит (для задач 8 и 9): `buildTurboSystem(tree: string): string` из `src/lib/prompts/turbo.system.ts`; константы `CANON_FIDELITY`, `CANON_CORE`, `CANON_EFFECTS_AND_MEDIUMS`, `CANON_TEXT_POLICY`, `CANON_COMPOSITION_AND_VARIATIONS` из `src/lib/prompts/canon.ts`.

- [ ] **Шаг 1: Запомнить хеш до разделения**

```bash
bun -e 'import { STYLE_VERSION, STYLE_SYSTEM } from "./src/lib/prompts"; console.log(STYLE_VERSION, STYLE_SYSTEM.length)'
```

Ожидается: `804cbceb749ac8bc 35934`. Если значения другие (кто-то менял стиль), записать фактические: сравнивать нужно с ними.

- [ ] **Шаг 2: Сохранить скрипт разделения вне репозитория**

Сохранить как `split_prompts.py` в папке для временных файлов вне репозитория (ниже она обозначена `$SCRATCH`; скрипт не коммитится):

```python
"""Одноразовое разделение промптов «42»: общие блоки канона уходят в canon.ts,
style42.system.ts собирается из них (хеш STYLE_VERSION не меняется),
turbo.system.ts генерируется из черновика инструкции агента.

Запуск из корня репозитория: uv run <путь к скрипту> [корень]
"""

import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
STYLE = ROOT / "src/lib/prompts/style42.system.ts"
CANON_OUT = ROOT / "src/lib/prompts/canon.ts"
TURBO_OUT = ROOT / "src/lib/prompts/turbo.system.ts"
DRAFT = ROOT / "docs/superpowers/specs/2026-10-05-turbo-agent-prompt.md"

# (имя константы, первый заголовок блока, заголовок, с которого начинается следующий кусок)
BLOCKS = [
    ("CANON_FIDELITY", "## Верность запросу", "## Безопасность и границы"),
    ("CANON_CORE", "# ИЕРАРХИЯ И ЭКШЕН", "## Символика культа"),
    ("CANON_EFFECTS_AND_MEDIUMS", "## Эффекты", "## Запрещённая эстетика"),
    ("CANON_TEXT_POLICY", "# ТЕКСТ ТОЛЬКО ПО ЗАПРОСУ", "# КОМПОЗИЦИЯ И КАМЕРА"),
    ("CANON_COMPOSITION_AND_VARIATIONS", "# КОМПОЗИЦИЯ И КАМЕРА", "# КРАЕВЫЕ СЛУЧАИ"),
]

HEADER = "export const STYLE_SYSTEM_42 = `"
source = STYLE.read_text(encoding="utf-8")
if not source.startswith(HEADER) or not source.rstrip().endswith("`;"):
    raise SystemExit("style42.system.ts уже разделён или имеет неожиданный вид")
body = source[len(HEADER) : source.rindex("`;")]
lines = body.split("\n")


def heading_index(prefix: str, begin: int = 0) -> int:
    for i in range(begin, len(lines)):
        if lines[i].startswith(prefix):
            return i
    raise SystemExit(f"заголовок не найден: {prefix}")


ranges = []
for name, first, after in BLOCKS:
    a = heading_index(first)
    b = heading_index(after, a + 1)
    # блок заканчивается последней непустой строкой перед следующим заголовком
    while lines[b - 1] == "":
        b -= 1
    ranges.append((name, a, b))

raw_blocks = {}
for name, a, b in ranges:
    text = "\n".join(lines[a:b])
    if "${" in text:
        raise SystemExit(f"в блоке {name} есть ${{…}}")
    raw_blocks[name] = text

# новый style42.system.ts: блоки заменены интерполяциями
new_lines = list(lines)
for name, a, b in sorted(ranges, key=lambda r: r[1], reverse=True):
    new_lines[a:b] = ["${" + name + "}"]
imports = ", ".join(name for name, _, _ in BLOCKS)
style_ts = (
    f'import {{ {imports} }} from "./canon";\n\n'
    + HEADER
    + "\n".join(new_lines)
    + "`;\n"
)

# canon.ts
canon_parts = [
    "/**",
    " * Общие блоки канона «42»: из них собираются и инструкция обогащения",
    " * (`style42.system.ts`), и инструкция агента Турбо (`turbo.system.ts`).",
    " */",
    "",
]
for name, _, _ in ranges:
    canon_parts.append(f"export const {name} = `{raw_blocks[name]}`;\n")
canon_ts = "\n".join(canon_parts)

# turbo.system.ts из черновика
draft = DRAFT.read_text(encoding="utf-8")
if "\n---\n" not in draft:
    raise SystemExit("в черновике нет разделителя ---")
prompt = draft.split("\n---\n", 1)[1].strip("\n")

for name, _, _ in ranges:
    unescaped = raw_blocks[name].replace("\\`", "`")
    if prompt.count(unescaped) != 1:
        raise SystemExit(f"блок {name} встречается в черновике {prompt.count(unescaped)} раз")
    prompt = prompt.replace(unescaped, f"\u0000{name}\u0000")

tree = re.search(r"<library>\n.*?\n</library>", prompt, flags=re.S)
if not tree:
    raise SystemExit("в черновике нет блока <library>")
prompt = prompt.replace(tree.group(0), "<library>\n\u0000TREE\u0000\n</library>")

escaped = prompt.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
for name, _, _ in ranges:
    escaped = escaped.replace(f"\u0000{name}\u0000", "${" + name + "}")
escaped = escaped.replace("\u0000TREE\u0000", "${tree}")
if "\u0000" in escaped:
    raise SystemExit("остались неразобранные маркеры")

turbo_ts = (
    f'import {{ {imports} }} from "./canon";\n\n'
    "/**\n"
    " * Системная инструкция агента Турбо. Дерево библиотеки подставляется на каждый\n"
    " * запрос; хеш считается от инструкции с пустым деревом.\n"
    " */\n"
    "export function buildTurboSystem(tree: string): string {\n"
    "\treturn `" + escaped + "\n`;\n"
    "}\n"
)

STYLE.write_text(style_ts, encoding="utf-8")
CANON_OUT.write_text(canon_ts, encoding="utf-8")
TURBO_OUT.write_text(turbo_ts, encoding="utf-8")
print("canon.ts, style42.system.ts и turbo.system.ts записаны")
```

- [ ] **Шаг 3: Запустить скрипт из корня репозитория**

```bash
uv run "$SCRATCH/split_prompts.py"
```

Ожидается: `canon.ts, style42.system.ts и turbo.system.ts записаны`. Скрипт сам останавливается с понятной ошибкой, если заголовок не найден или блок встречается в черновике не один раз.

- [ ] **Шаг 4: Привести форматирование и проверить, что хеш не изменился**

```bash
bun run lint:fix
```

```bash
bun -e 'import { STYLE_VERSION, STYLE_SYSTEM } from "./src/lib/prompts"; console.log(STYLE_VERSION, STYLE_SYSTEM.length)'
```

Ожидается то же `804cbceb749ac8bc 35934`, что в шаге 1. Если хеш другой, не продолжать: откатить `git checkout src/lib/prompts/style42.system.ts`, удалить созданные файлы и разобраться, какой блок исказился.

- [ ] **Шаг 5: Написать тест**

Создать `src/lib/__tests__/turbo-prompt.test.ts` (общие блоки входят в обе инструкции дословно; дерево подставляется; запретов не ради качества нет):

```typescript
import { describe, expect, test } from "bun:test";
import { STYLE_SYSTEM } from "../prompts";
import {
	CANON_COMPOSITION_AND_VARIATIONS,
	CANON_CORE,
	CANON_EFFECTS_AND_MEDIUMS,
	CANON_FIDELITY,
	CANON_TEXT_POLICY,
} from "../prompts/canon";
import { buildTurboSystem } from "../prompts/turbo.system";
import { systemVersionOf } from "../turbo/agent";

const SHARED = {
	CANON_FIDELITY,
	CANON_CORE,
	CANON_EFFECTS_AND_MEDIUMS,
	CANON_TEXT_POLICY,
	CANON_COMPOSITION_AND_VARIATIONS,
};

describe("общие блоки канона", () => {
	for (const [name, block] of Object.entries(SHARED)) {
		test(`${name} входит в обе инструкции дословно`, () => {
			expect(block.length).toBeGreaterThan(100);
			expect(STYLE_SYSTEM).toContain(block);
			expect(buildTurboSystem("")).toContain(block);
		});
	}
});

describe("инструкция агента Турбо", () => {
	const system = buildTurboSystem("пятерка/ — 2 изображения");

	test("содержит разделы роли, библиотеки, инструментов и правил", () => {
		for (const heading of [
			"# РОЛЬ И МИССИЯ",
			"# БИБЛИОТЕКА ВХОДНЫХ ИЗОБРАЖЕНИЙ",
			"# РАБОЧИЙ ЦИКЛ",
			"# ИНСТРУМЕНТЫ",
			"## listFolder",
			"## readFile",
			"## generateImage",
			"# ЖЕЛЕЗНЫЕ ПРАВИЛА",
			"# ПАСПОРТ СТИЛЯ 42",
			"# САМОПРОВЕРКА",
		]) {
			expect(system).toContain(heading);
		}
	});

	test("дерево библиотеки подставляется в блок <library>", () => {
		expect(system).toContain("<library>\nпятерка/ — 2 изображения\n</library>");
		expect(system).not.toContain("{tree}");
	});

	test("запретов не ради качества в инструкции нет", () => {
		expect(system).not.toContain("реальные государственные флаги");
		expect(system).not.toContain("заменяет любые реальные лица");
	});

	test("версия не зависит от дерева", () => {
		expect(systemVersionOf(buildTurboSystem("a"))).not.toBe(
			systemVersionOf(buildTurboSystem("b")),
		);
		expect(systemVersionOf(buildTurboSystem(""))).toMatch(/^[0-9a-f]{16}$/);
	});
});
```

```bash
bun test src/lib/__tests__/turbo-prompt.test.ts src/lib/__tests__/style42-prompt.test.ts
```

Ожидается: все проходят (в том числе прежние тесты стиля).

- [ ] **Шаг 6: Пометить черновик**

В `docs/superpowers/specs/2026-10-05-turbo-agent-prompt.md` заменить третью строку «Черновик на согласование (режим «Турбо», brainstorming). Код не написан.» на:

```markdown
Исходник инструкции теперь `src/lib/prompts/turbo.system.ts` (общие блоки канона в `canon.ts`). Этот файл остаётся как история проектирования и больше не обновляется.
```

- [ ] **Шаг 7: Коммит**

```bash
bun run typecheck
```

```bash
git add src/lib/prompts docs/superpowers/specs/2026-10-05-turbo-agent-prompt.md src/lib/__tests__/turbo-prompt.test.ts
```

```bash
git commit -m "feat(turbo): инструкция агента и общие блоки канона 42" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 8: Агент: ошибки, инструменты, цикл

**Файлы:**
- Создать: `src/lib/turbo/errors.ts`, `src/lib/turbo/tools.ts`, `src/lib/turbo/agent.ts`
- Изменить: `src/lib/generation-error.ts`, `src/lib/__tests__/generation-error.test.ts`
- Тест: `src/lib/__tests__/turbo-agent.test.ts`

**Интерфейсы:**
- Потребляет: `Library`, `ResolvedImage`, `MAX_INPUT_IMAGES` (задача 4); `TURBO_MAX_STEPS`, `TURBO_TIMEOUT_MS` (задача 5); `EditImageResult`, `CodexImageError` (задача 6); `buildUserMessage`, `pickAnchors` и подсказки стиля из `src/lib/prompts` (уже есть).
- Производит (для задачи 9):
  - `errors.ts`: `type TurboErrorCode = "codex_auth_required" | "agent_failed" | "agent_no_generation" | "generation_rejected" | "agent_timeout"`; `class TurboError extends Error { code; details: { prompt?: string; inputImages?: string[] } }`; `TURBO_PUBLIC_ERROR`
  - `tools.ts`: `type EditFn = (params: { prompt: string; images: ResolvedImage[]; signal?: AbortSignal }) => Promise<EditImageResult>`; `TurboRun`; `createTurboRun()`; `isRunFinished(run)`; `createTurboTools({ library, edit, run })` (инструменты `listFolder`, `readFile`, `generateImage`)
  - `agent.ts`: `runTurbo(userInput: string, deps: RunTurboDeps): Promise<TurboResult>`; `TurboResult { png; prompt; inputImages; size; inputTokens; outputTokens; durationMs; systemVersion }`; `systemVersionOf(template)`; `classifyAgentError(error, signal)`; `buildAgentMessage(userInput)`

Правила, которые реализуют инструменты (из спецификации): `generateImage` принимает 0–10 путей; при ошибке аргументов отвечает `ok: false, retryable: true` не больше двух раз, на третий раз прогон завершается кодом `agent_no_generation`; отказ Codex даёт `ok: false, retryable: false` и код `generation_rejected` (401 и 403 дают `codex_auth_required`); готовый PNG кладётся в состояние запуска, агент его не видит. Прогон останавливается, как только картинка получена или генерация окончательно отклонена; иначе по лимиту ходов.

- [ ] **Шаг 1: Написать падающие тесты**

Тесты цикла агента используют `MockLanguageModelV4` из `ai/test` (подменённая модель с заранее заданными ответами). Создать `src/lib/__tests__/turbo-agent.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { runTurbo, systemVersionOf } from "../turbo/agent";
import { CodexImageError } from "../turbo/codex-images";
import { TURBO_MAX_STEPS } from "../turbo/constants";
import { TurboError } from "../turbo/errors";
import { Library, type LibraryStorage } from "../turbo/library";
import type { EditFn } from "../turbo/tools";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const RESULT_PNG = new Uint8Array([9, 9, 9]);

const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function storage(): LibraryStorage {
	const objects: Record<string, Uint8Array> = {
		"library/пятерка/a.png": PNG,
		"library/пятерка/описания.txt": new TextEncoder().encode("a.png — первая"),
	};
	return {
		list: async (prefix) =>
			Object.entries(objects)
				.filter(([key]) => key.startsWith(prefix))
				.map(([key, bytes]) => ({ key, size: bytes.byteLength })),
		read: async (key) => objects[key] ?? null,
	};
}

function toolCalls(...calls: { id: string; name: string; input: unknown }[]) {
	return {
		content: calls.map((call) => ({
			type: "tool-call" as const,
			toolCallId: call.id,
			toolName: call.name,
			input: JSON.stringify(call.input),
		})),
		finishReason: { unified: "tool-calls" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function text(value: string) {
	return {
		content: [{ type: "text" as const, text: value }],
		finishReason: { unified: "stop" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function setup(
	steps: ConstructorParameters<typeof MockLanguageModelV4>[0],
	edit = mock<EditFn>(async () => ({
		png: RESULT_PNG,
		size: "1024x1024",
		quality: "medium",
	})),
) {
	const model = new MockLanguageModelV4(steps);
	const library = new Library(storage());
	const deps = {
		model,
		library,
		edit,
		buildSystem: (tree: string) => `SYSTEM\n<library>\n${tree}\n</library>`,
	};
	return { model, edit, deps };
}

describe("runTurbo", () => {
	test("успех: параллельные listFolder и readFile, затем generateImage", async () => {
		const { model, edit, deps } = setup({
			doGenerate: [
				toolCalls(
					{ id: "1", name: "listFolder", input: { path: "пятерка" } },
					{
						id: "2",
						name: "readFile",
						input: { path: "пятерка/описания.txt" },
					},
					{ id: "3", name: "readFile", input: { path: "пятерка/a.png" } },
				),
				toolCalls({
					id: "4",
					name: "generateImage",
					input: {
						prompt: "The person from Image 1 on a throne",
						images: ["пятерка/a.png"],
					},
				}),
			],
		});

		const result = await runTurbo("пятёрка на троне", deps);

		expect(result.png).toEqual(RESULT_PNG);
		expect(result.prompt).toBe("The person from Image 1 on a throne");
		expect(result.inputImages).toEqual(["пятерка/a.png"]);
		expect(result.inputTokens).toBe(20);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(edit).toHaveBeenCalledTimes(1);
		const editArgs = edit.mock.calls[0]![0];
		expect(editArgs.images).toHaveLength(1);
		expect(editArgs.images[0]!.path).toBe("пятерка/a.png");

		// агент видел дерево и пользовательское сообщение
		const firstPrompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
		expect(firstPrompt).toContain("пятерка/ — 1 изображение");
		expect(firstPrompt).toContain("USER_REQUEST");
		// изображение дошло до модели как файл в результате инструмента
		const secondPrompt = JSON.stringify(model.doGenerateCalls[1]!.prompt);
		expect(secondPrompt).toContain("image/png");
	});

	test("generateImage без изображений допустим", async () => {
		const { deps, edit } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "a cat", images: [] },
				}),
			],
		});
		const result = await runTurbo("кот", deps);
		expect(result.inputImages).toEqual([]);
		expect(edit.mock.calls[0]![0].images).toEqual([]);
	});

	test("ошибка аргументов — retryable, агент исправляется и рисует", async () => {
		const { model, deps } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/нет.png"] },
				}),
				toolCalls({
					id: "2",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/a.png"] },
				}),
			],
		});
		const result = await runTurbo("пятёрка", deps);
		expect(result.inputImages).toEqual(["пятерка/a.png"]);
		expect(model.doGenerateCalls).toHaveLength(2);
		// агент получил retryable:true и подсказку
		expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain(
			"retryable",
		);
	});

	test("третья ошибка аргументов подряд — agent_no_generation", async () => {
		const bad = toolCalls({
			id: "1",
			name: "generateImage",
			input: { prompt: "", images: [] },
		});
		const { deps, edit } = setup({ doGenerate: [bad, bad, bad, bad] });
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error).toBeInstanceOf(TurboError);
		expect(error.code).toBe("agent_no_generation");
		expect(edit).not.toHaveBeenCalled();
	});

	test("отказ Codex — generation_rejected, повторов нет", async () => {
		const edit = mock<EditFn>(async () => {
			throw new CodexImageError("Codex Images ответил 400: policy", 400);
		});
		const { model, deps } = setup(
			{
				doGenerate: [
					toolCalls({
						id: "1",
						name: "generateImage",
						input: { prompt: "x", images: [] },
					}),
					text("не должно быть вызвано"),
				],
			},
			edit,
		);
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error.code).toBe("generation_rejected");
		expect(model.doGenerateCalls).toHaveLength(1);
	});

	test("401 от Codex Images — codex_auth_required", async () => {
		const edit = mock<EditFn>(async () => {
			throw new CodexImageError("Codex Images ответил 401", 401);
		});
		const { deps } = setup(
			{
				doGenerate: [
					toolCalls({
						id: "1",
						name: "generateImage",
						input: { prompt: "x", images: [] },
					}),
				],
			},
			edit,
		);
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error.code).toBe("codex_auth_required");
	});

	test("агент закончил текстом без generateImage — agent_no_generation", async () => {
		const { deps } = setup({ doGenerate: [text("Готово")] });
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error.code).toBe("agent_no_generation");
	});

	test("лимит ходов без картинки — agent_no_generation", async () => {
		const loop = toolCalls({
			id: "1",
			name: "listFolder",
			input: { path: "пятерка" },
		});
		const { model, deps } = setup({ doGenerate: async () => loop });
		const error = await runTurbo("кот", { ...deps, maxSteps: 3 }).catch(
			(e) => e,
		);
		expect(error.code).toBe("agent_no_generation");
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(TURBO_MAX_STEPS).toBeGreaterThan(3);
	});

	test("сбой модели — agent_failed, 401 провайдера — codex_auth_required", async () => {
		const failing = (status: number) =>
			setup({
				doGenerate: async () => {
					throw new APICallError({
						message: "boom",
						url: "https://chatgpt.com/backend-api/codex/responses",
						requestBodyValues: {},
						statusCode: status,
						isRetryable: false,
					});
				},
			}).deps;
		const failed = await runTurbo("кот", failing(500)).catch((e) => e);
		expect(failed.code).toBe("agent_failed");
		const unauthorized = await runTurbo("кот", failing(401)).catch((e) => e);
		expect(unauthorized.code).toBe("codex_auth_required");
	});

	test("превышение времени — agent_timeout", async () => {
		const { deps } = setup({
			doGenerate: async ({ abortSignal }) => {
				await new Promise((resolve, reject) => {
					const timer = setTimeout(resolve, 500);
					abortSignal?.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(abortSignal.reason);
					});
				});
				return text("поздно");
			},
		});
		const error = await runTurbo("кот", { ...deps, timeoutMs: 20 }).catch(
			(e) => e,
		);
		expect(error.code).toBe("agent_timeout");
	});
});

describe("systemVersionOf", () => {
	test("хеш стабилен и 16 hex-символов", () => {
		expect(systemVersionOf("a")).toBe(systemVersionOf("a"));
		expect(systemVersionOf("a")).toMatch(/^[0-9a-f]{16}$/);
		expect(systemVersionOf("a")).not.toBe(systemVersionOf("b"));
	});
});
```

В `src/lib/__tests__/generation-error.test.ts` добавить код ошибок Турбо:

```diff
--- a/src/lib/__tests__/generation-error.test.ts
+++ b/src/lib/__tests__/generation-error.test.ts
@@ -3,6 +3,7 @@
 import { describeGenerationError } from "../generation-error";
 import { KeyExhaustedError, QueueTimeoutError } from "../hf";
 import { AllKeysExhaustedError } from "../keys";
+import { TurboError } from "../turbo/errors";
 
 describe("describeGenerationError", () => {
 	test("известные ошибки получают код причины", () => {
@@ -20,6 +21,17 @@
 		);
 	});
 
+	test("ошибки Турбо получают свой код", () => {
+		expect(
+			describeGenerationError(
+				new TurboError("generation_rejected", "Codex Images ответил 400"),
+			),
+		).toBe("generation_rejected: Codex Images ответил 400");
+		expect(
+			describeGenerationError(new TurboError("agent_timeout", "Время вышло")),
+		).toBe("agent_timeout: Время вышло");
+	});
+
 	test("прочие ошибки сохраняют текст", () => {
 		expect(
 			describeGenerationError(new Error("Не удалось скачать изображение: 502")),
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
bun test src/lib/__tests__/turbo-agent.test.ts src/lib/__tests__/generation-error.test.ts
```

Ожидается: FAIL, `Cannot find module '../turbo/agent'` и отсутствие `../turbo/errors`.

- [ ] **Шаг 3: Ошибки Турбо**

Создать `src/lib/turbo/errors.ts`:

```typescript
export type TurboErrorCode =
	| "codex_auth_required"
	| "agent_failed"
	| "agent_no_generation"
	| "generation_rejected"
	| "agent_timeout";

/** Что успело получиться до сбоя; пишется в историю для отладки */
export interface TurboErrorDetails {
	prompt?: string;
	inputImages?: string[];
}

/** Сбой режима «Турбо»: код попадает в `generations.error_message`, пользователю — общее сообщение */
export class TurboError extends Error {
	readonly details: TurboErrorDetails;

	constructor(
		public readonly code: TurboErrorCode,
		message: string,
		options: { cause?: unknown; details?: TurboErrorDetails } = {},
	) {
		super(message, { cause: options.cause });
		this.name = "TurboError";
		this.details = options.details ?? {};
	}
}

/** Единственный текст, который видит пользователь при любом сбое Турбо */
export const TURBO_PUBLIC_ERROR =
	"Не удалось создать изображение, кредиты возвращены";
```

И научить историю записывать их коды, `src/lib/generation-error.ts`:

```diff
--- a/src/lib/generation-error.ts
+++ b/src/lib/generation-error.ts
@@ -1,6 +1,7 @@
 import { InsufficientCreditsError } from "./credits";
 import { KeyExhaustedError, QueueTimeoutError } from "./hf";
 import { AllKeysExhaustedError } from "./keys";
+import { TurboError } from "./turbo/errors";
 
 const MAX_ERROR_LENGTH = 2000;
 
@@ -20,6 +21,8 @@
 		reason = `key_exhausted (${error.status})`;
 	} else if (error instanceof QueueTimeoutError) {
 		reason = "queue_timeout";
+	} else if (error instanceof TurboError) {
+		reason = error.code;
 	} else {
 		reason = "error";
 	}
```

- [ ] **Шаг 4: Инструменты агента**

Создать `src/lib/turbo/tools.ts`. Картинку из библиотеки `readFile` отдаёт модели как файл в результате инструмента (`toModelOutput`), а в остальных случаях обычным JSON:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { CodexImageError, type EditImageResult } from "./codex-images";
import { TurboError } from "./errors";
import { type Library, MAX_INPUT_IMAGES, type ResolvedImage } from "./library";

/** Сколько раз агент может поправить аргументы generateImage после ошибки проверки */
const MAX_ARGUMENT_RETRIES = 2;

export type EditFn = (params: {
	prompt: string;
	images: ResolvedImage[];
	signal?: AbortSignal;
}) => Promise<EditImageResult>;

/** Итог запуска: инструменты кладут сюда результат, агент картинку не видит */
export interface TurboRun {
	png: Uint8Array | null;
	prompt: string | null;
	inputImages: string[];
	/** Размер, который выбрал сервер (например «1024x1536») */
	size: string | null;
	failure: TurboError | null;
	argumentErrors: number;
}

export function createTurboRun(): TurboRun {
	return {
		png: null,
		prompt: null,
		inputImages: [],
		size: null,
		failure: null,
		argumentErrors: 0,
	};
}

/** Запуск закончен: картинка получена или генерацию окончательно отклонили */
export function isRunFinished(run: TurboRun): boolean {
	return run.png !== null || run.failure !== null;
}

export type GenerateImageOutput =
	| { ok: true }
	| { ok: false; retryable: boolean; error: string };

export function createTurboTools(deps: {
	library: Library;
	edit: EditFn;
	run: TurboRun;
}) {
	const { library, edit, run } = deps;

	return {
		listFolder: tool({
			description:
				"Показывает файлы папки библиотеки с типом (изображение или текст). Вход: имя папки из дерева, например «пятерка».",
			inputSchema: z.object({
				path: z.string().describe("Имя папки из дерева библиотеки"),
			}),
			execute: async ({ path }) => library.listFolder(path),
		}),

		readFile: tool({
			description:
				"Читает файл библиотеки. Текст приходит строкой, изображение ты видишь сам. Вход: полный путь «папка/файл».",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Полный путь, например «эмблемы/flag_of_42.png»"),
			}),
			execute: async ({ path }) => library.readFile(path),
			toModelOutput: ({ output }) => {
				if (output.ok && output.kind === "image") {
					return {
						type: "content",
						value: [
							{ type: "text", text: `Изображение ${output.path}` },
							{
								type: "file",
								mediaType: output.mediaType,
								data: { type: "data", data: output.base64 },
							},
						],
					};
				}
				return { type: "json", value: output };
			},
		}),

		generateImage: tool({
			description: `Рисует итоговую картинку по промпту и выбранным изображениям. Вызывается один раз за прогон, это финальный шаг. images — от 0 до ${MAX_INPUT_IMAGES} путей «папка/файл»; порядок задаёт номера Image 1…N в промпте.`,
			inputSchema: z.object({
				prompt: z.string().describe("Готовый промпт на английском"),
				images: z
					.array(z.string())
					.describe("Пути входных изображений, пустой массив — без них"),
			}),
			execute: async (
				{ prompt, images },
				{ abortSignal },
			): Promise<GenerateImageOutput> => {
				const rejectArguments = (error: string): GenerateImageOutput => {
					run.argumentErrors += 1;
					if (run.argumentErrors > MAX_ARGUMENT_RETRIES) {
						run.failure = new TurboError(
							"agent_no_generation",
							`Агент не смог собрать допустимые аргументы generateImage: ${error}`,
						);
						return { ok: false, retryable: false, error };
					}
					return { ok: false, retryable: true, error };
				};

				if (prompt.trim().length === 0) {
					return rejectArguments("Пустой промпт");
				}
				const resolved = await library.resolveImages(images);
				if (!resolved.ok) {
					return rejectArguments(resolved.error);
				}

				try {
					const result = await edit({
						prompt,
						images: resolved.images,
						...(abortSignal ? { signal: abortSignal } : {}),
					});
					run.png = result.png;
					run.prompt = prompt;
					run.inputImages = resolved.images.map((image) => image.path);
					run.size = result.size;
					return { ok: true };
				} catch (error) {
					const unauthorized =
						error instanceof CodexImageError &&
						(error.status === 401 || error.status === 403);
					run.failure = new TurboError(
						unauthorized ? "codex_auth_required" : "generation_rejected",
						error instanceof Error ? error.message : String(error),
						{
							cause: error,
							details: {
								prompt,
								inputImages: resolved.images.map((image) => image.path),
							},
						},
					);
					return {
						ok: false,
						retryable: false,
						error: "Генерация отклонена или не удалась",
					};
				}
			},
		}),
	};
}
```

- [ ] **Шаг 5: Цикл агента**

Создать `src/lib/turbo/agent.ts`. Рассуждение `high`, остановка по готовой картинке или по лимиту ходов, общий таймаут через `AbortSignal.timeout`, все сбои приводятся к `TurboError`:

```typescript
import { createHash } from "node:crypto";
import { isStepCount, type LanguageModel, ToolLoopAgent } from "ai";
import { buildUserMessage, pickAnchors } from "../prompts/anchors";
import {
	detectUserMedium,
	extractQuotedTexts,
	requestsText,
} from "../prompts/style-hints";
import { TURBO_MAX_STEPS, TURBO_TIMEOUT_MS } from "./constants";
import { TurboError } from "./errors";
import type { Library } from "./library";
import {
	createTurboRun,
	createTurboTools,
	type EditFn,
	isRunFinished,
} from "./tools";

export interface RunTurboDeps {
	model: LanguageModel;
	library: Library;
	edit: EditFn;
	/** Системная инструкция из дерева библиотеки этого запроса */
	buildSystem: (tree: string) => string;
	maxSteps?: number;
	timeoutMs?: number;
}

export interface TurboResult {
	png: Uint8Array;
	/** Итоговый промпт, который агент отдал генератору */
	prompt: string;
	inputImages: string[];
	/** Размер, который выбрал сервер */
	size: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	durationMs: number;
	/** Хеш инструкции без дерева: по нему сравниваются итерации */
	systemVersion: string;
}

export function systemVersionOf(template: string): string {
	return createHash("sha256").update(template).digest("hex").slice(0, 16);
}

function statusOf(error: unknown): number | null {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const candidate = current as {
			statusCode?: unknown;
			lastError?: unknown;
			cause?: unknown;
		};
		if (typeof candidate.statusCode === "number") return candidate.statusCode;
		current = candidate.lastError ?? candidate.cause;
	}
	return null;
}

function isAuthFailure(error: unknown): boolean {
	const status = statusOf(error);
	if (status === 401 || status === 403) return true;
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const code = (current as { code?: unknown }).code;
		if (
			code === "auth_required" ||
			code === "refresh_failed" ||
			code === "workspace_mismatch"
		) {
			return true;
		}
		current =
			(current as { lastError?: unknown; cause?: unknown }).lastError ??
			(current as { cause?: unknown }).cause;
	}
	return false;
}

/** Всё, что пришло из агента, превращает в TurboError с понятным кодом */
export function classifyAgentError(
	error: unknown,
	signal: AbortSignal,
): TurboError {
	if (error instanceof TurboError) return error;
	const message = error instanceof Error ? error.message : String(error);
	const name = (error as { name?: string } | null)?.name;
	if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
		return new TurboError("agent_timeout", message, { cause: error });
	}
	if (isAuthFailure(error)) {
		return new TurboError("codex_auth_required", message, { cause: error });
	}
	return new TurboError("agent_failed", message, { cause: error });
}

/** Сообщение пользователя для агента: запрос, признак текста и якоря, как у обычного обогащения */
export function buildAgentMessage(userInput: string): string {
	const anchors = pickAnchors();
	const userMedium = detectUserMedium(userInput);
	if (userMedium) anchors.medium = userMedium;
	const exactTexts = extractQuotedTexts(userInput);
	const textRequested = requestsText(userInput) || exactTexts.length > 0;
	return buildUserMessage(userInput, anchors, { textRequested, exactTexts });
}

export async function runTurbo(
	userInput: string,
	deps: RunTurboDeps,
): Promise<TurboResult> {
	const started = Date.now();
	const run = createTurboRun();
	const signal = AbortSignal.timeout(deps.timeoutMs ?? TURBO_TIMEOUT_MS);

	try {
		const tree = await deps.library.describeTree();
		const system = deps.buildSystem(tree);
		const agent = new ToolLoopAgent({
			model: deps.model,
			instructions: system,
			tools: createTurboTools({ library: deps.library, edit: deps.edit, run }),
			reasoning: "high",
			stopWhen: [
				() => isRunFinished(run),
				isStepCount(deps.maxSteps ?? TURBO_MAX_STEPS),
			],
		});
		const result = await agent.generate({
			prompt: buildAgentMessage(userInput),
			abortSignal: signal,
		});

		if (run.png && run.prompt) {
			return {
				png: run.png,
				prompt: run.prompt,
				inputImages: run.inputImages,
				size: run.size,
				inputTokens: result.usage.inputTokens ?? null,
				outputTokens: result.usage.outputTokens ?? null,
				durationMs: Date.now() - started,
				systemVersion: systemVersionOf(deps.buildSystem("")),
			};
		}
		if (run.failure) throw run.failure;
		if (signal.aborted) {
			throw new TurboError("agent_timeout", "Время запуска вышло");
		}
		throw new TurboError(
			"agent_no_generation",
			"Агент завершил работу, не вызвав generateImage",
		);
	} catch (error) {
		// провал внутри generateImage важнее обёртки, в которую его мог завернуть SDK
		if (run.failure) throw run.failure;
		throw classifyAgentError(error, signal);
	}
}
```

Если в задаче 1 инструкция сообщением не прошла, а через `instructions` прошла, в `new ToolLoopAgent({...})` заменить строку `instructions: system,` на:

```ts
providerOptions: { openai: { instructions: system } },
```

- [ ] **Шаг 6: Тесты проходят**

```bash
bun test src/lib/__tests__/turbo-agent.test.ts src/lib/__tests__/generation-error.test.ts
```

Ожидается: `11 pass` в `turbo-agent`, в `generation-error` все проходят.

- [ ] **Шаг 7: Линтер, типы, коммит**

```bash
bun run lint:fix
```

```bash
bun run typecheck
```

```bash
git add src/lib/turbo/errors.ts src/lib/turbo/tools.ts src/lib/turbo/agent.ts src/lib/generation-error.ts src/lib/__tests__/turbo-agent.test.ts src/lib/__tests__/generation-error.test.ts
```

```bash
git commit -m "feat(turbo): агент — инструменты библиотеки, generateImage, цикл и ошибки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 9: Сервис Турбо и ветка в `/api/generate`

**Файлы:**
- Создать: `src/lib/turbo/service.ts`, `src/lib/turbo/runtime.ts`
- Изменить: `src/api/generate.ts`
- Тест: `src/lib/__tests__/turbo-service.test.ts`

**Интерфейсы:**
- Потребляет: `runTurbo`, `TurboResult` (8), `TurboError`, `TURBO_PUBLIC_ERROR` (8), `TURBO_MODEL` (2), `isTurboAvailable`, `createCodexAuth`, `codexFetch`, `codexLanguageModel`, `recordCodexError` (5), `editImage`, `CODEX_IMAGE_MODEL` (6), `Library` (4), `buildTurboSystem` (7), `listObjects`, `readObject`, `uploadImage`, `getImageUrl` (storage), `deductCredits`, `refundCredits`, `InsufficientCreditsError` (credits), `describeGenerationError`.
- Производит: `generateTurbo(input: { userId: string; prompt: string }, deps: TurboServiceDeps): Promise<TurboOutcome>` (`status: 200 | 402 | 502`, тело ответа); `turboDeps: TurboServiceDeps` (боевые зависимости); `parseImageSize`.

Поведение сервиса: списывает 10 кредитов, запускает агента, сохраняет PNG в `generations/<user>/<время>.png`, пишет строку `completed`. Любой сбой: возврат 10 кредитов, строка `failed` с `cost = 0` и кодом в `error_message`, ответ 502 с общим сообщением. Нехватка кредитов: 402 и строка `failed`. Если сбой вызван мёртвым входом Codex, он помечается в `codex_auth.last_error` и Турбо пропадает у пользователей до «Проверить» или нового входа.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `src/lib/__tests__/turbo-service.test.ts`:

```typescript
import { describe, expect, mock, test } from "bun:test";
import { InsufficientCreditsError } from "../credits";
import type { TurboResult } from "../turbo/agent";
import { TURBO_PUBLIC_ERROR, TurboError } from "../turbo/errors";
import {
	generateTurbo,
	parseImageSize,
	type TurboServiceDeps,
} from "../turbo/service";

const RESULT: TurboResult = {
	png: new Uint8Array([1, 2, 3]),
	prompt: "The person from Image 1 on a throne",
	inputImages: ["пятерка/a.png"],
	size: "1024x1536",
	inputTokens: 100,
	outputTokens: 50,
	durationMs: 90_000,
	systemVersion: "abcdef0123456789",
};

function makeDeps(overrides: Partial<TurboServiceDeps> = {}) {
	let clock = 1_000;
	const deps = {
		deductCredits: mock(async () => 90),
		refundCredits: mock(async () => {}),
		run: mock(async () => RESULT),
		storeImage: mock(async () => ({
			key: "generations/u1/1.png",
			url: "https://s3/img",
		})),
		recordCompleted: mock(async () => {}),
		recordFailed: mock(async () => {}),
		onAuthFailure: mock(async () => {}),
		now: () => (clock += 500),
		newId: () => "gen-1",
		...overrides,
	};
	return deps as typeof deps & TurboServiceDeps;
}

describe("generateTurbo", () => {
	test("успех: списывает 10, сохраняет картинку и пишет историю", async () => {
		const deps = makeDeps();
		const outcome = await generateTurbo(
			{ userId: "u1", prompt: "пятёрка на троне" },
			deps,
		);

		expect(deps.deductCredits).toHaveBeenCalledWith("u1", 10);
		expect(deps.refundCredits).not.toHaveBeenCalled();
		expect(outcome).toEqual({
			status: 200,
			body: {
				id: "gen-1",
				image_url: "https://s3/img",
				seed: null,
				duration: 500,
				engine: "turbo",
				cost: 10,
			},
		});
		expect(deps.recordCompleted).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			prompt: "пятёрка на троне",
			enhancedPrompt: "The person from Image 1 on a throne",
			imageKey: "generations/u1/1.png",
			inputImages: ["пятерка/a.png"],
			width: 1024,
			height: 1536,
			durationMs: 500,
			agentTokens: 150,
			systemVersion: "abcdef0123456789",
			cost: 10,
		});
	});

	test("мало кредитов: 402, агент не запускается, возврата нет", async () => {
		const deps = makeDeps({
			deductCredits: mock(async () => {
				throw new InsufficientCreditsError();
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome).toEqual({
			status: 402,
			body: { error: "Недостаточно кредитов" },
		});
		expect(deps.run).not.toHaveBeenCalled();
		expect(deps.refundCredits).not.toHaveBeenCalled();
		expect(deps.recordFailed).toHaveBeenCalledTimes(1);
	});

	test("отказ генерации: возврат, запись failed с промптом, общее сообщение", async () => {
		const error = new TurboError(
			"generation_rejected",
			"Codex Images ответил 400",
			{
				details: { prompt: "final prompt", inputImages: ["пятерка/a.png"] },
			},
		);
		const deps = makeDeps({
			run: mock(async () => {
				throw error;
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
		expect(deps.refundCredits).toHaveBeenCalledWith("u1", 10);
		expect(deps.recordFailed).toHaveBeenCalledWith({
			userId: "u1",
			prompt: "x",
			enhancedPrompt: "final prompt",
			inputImages: ["пятерка/a.png"],
			durationMs: 500,
			error,
		});
		expect(deps.onAuthFailure).not.toHaveBeenCalled();
		expect(deps.storeImage).not.toHaveBeenCalled();
	});

	test("умерший вход Codex помечается для админки", async () => {
		const error = new TurboError("codex_auth_required", "refresh_failed");
		const deps = makeDeps({
			run: mock(async () => {
				throw error;
			}),
		});
		await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(deps.onAuthFailure).toHaveBeenCalledWith(error);
	});

	test("любая другая ошибка тоже возвращает кредиты", async () => {
		const deps = makeDeps({
			storeImage: mock(async () => {
				throw new Error("S3 недоступен");
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome.status).toBe(502);
		expect(deps.refundCredits).toHaveBeenCalledWith("u1", 10);
		expect(deps.recordCompleted).not.toHaveBeenCalled();
		expect(deps.recordFailed).toHaveBeenCalledTimes(1);
	});

	test("сбой возврата или записи не подменяет ответ пользователю", async () => {
		const deps = makeDeps({
			run: mock(async () => {
				throw new TurboError("agent_failed", "boom");
			}),
			refundCredits: mock(async () => {
				throw new Error("db down");
			}),
			recordFailed: mock(async () => {
				throw new Error("db down");
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
	});
});

describe("parseImageSize", () => {
	test("разбирает размер сервера, остальное — квадрат", () => {
		expect(parseImageSize("1024x1536")).toEqual({ width: 1024, height: 1536 });
		expect(parseImageSize(null)).toEqual({ width: 1024, height: 1024 });
		expect(parseImageSize("auto")).toEqual({ width: 1024, height: 1024 });
	});
});
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

```bash
bun test src/lib/__tests__/turbo-service.test.ts
```

Ожидается: FAIL, `Cannot find module '../turbo/service'`.

- [ ] **Шаг 3: Реализовать сервис**

Создать `src/lib/turbo/service.ts`. Он не знает ни про базу, ни про S3: всё приходит через `deps`.

```typescript
import { InsufficientCreditsError } from "../credits";
import { TURBO_MODEL } from "../models";
import type { TurboResult } from "./agent";
import { TURBO_AGENT_MODEL } from "./constants";
import { TURBO_PUBLIC_ERROR, TurboError } from "./errors";

export interface CompletedTurboRecord {
	id: string;
	userId: string;
	/** Исходный запрос пользователя */
	prompt: string;
	/** Итоговый промпт агента */
	enhancedPrompt: string;
	imageKey: string;
	inputImages: string[];
	width: number;
	height: number;
	durationMs: number;
	agentTokens: number | null;
	systemVersion: string;
	cost: number;
}

export interface FailedTurboRecord {
	userId: string;
	prompt: string;
	/** Что успело получиться до сбоя */
	enhancedPrompt: string | null;
	inputImages: string[];
	durationMs: number;
	error: unknown;
}

export interface TurboServiceDeps {
	deductCredits(userId: string, amount: number): Promise<number>;
	refundCredits(userId: string, amount: number): Promise<void>;
	run(prompt: string): Promise<TurboResult>;
	storeImage(
		userId: string,
		png: Uint8Array,
	): Promise<{ key: string; url: string }>;
	recordCompleted(record: CompletedTurboRecord): Promise<void>;
	recordFailed(record: FailedTurboRecord): Promise<void>;
	/** Вход Codex умер: пометить в админке и скрыть Турбо */
	onAuthFailure(error: TurboError): Promise<void>;
	now(): number;
	newId(): string;
}

export type TurboOutcome =
	| {
			status: 200;
			body: {
				id: string;
				image_url: string;
				seed: null;
				duration: number;
				engine: "turbo";
				cost: number;
			};
	  }
	| { status: 402 | 502; body: { error: string } };

const DEFAULT_SIZE = { width: 1024, height: 1024 };

/** «1024x1536» → размеры; всё непонятное — стандартный квадрат */
export function parseImageSize(size: string | null): {
	width: number;
	height: number;
} {
	const match = size?.match(/^(\d{2,5})x(\d{2,5})$/);
	if (!match) return DEFAULT_SIZE;
	return { width: Number(match[1]), height: Number(match[2]) };
}

async function safely(label: string, action: () => Promise<void>) {
	try {
		await action();
	} catch (error) {
		console.error(`${label}:`, error);
	}
}

/**
 * Одна генерация в режиме «Турбо»: списание, запуск агента, сохранение картинки,
 * запись в историю. Любой сбой возвращает кредиты, пишется как `failed`, а
 * пользователь получает одно общее сообщение.
 */
export async function generateTurbo(
	input: { userId: string; prompt: string },
	deps: TurboServiceDeps,
): Promise<TurboOutcome> {
	const { userId, prompt } = input;
	const cost = TURBO_MODEL.cost;
	const started = deps.now();
	let spent = false;

	try {
		await deps.deductCredits(userId, cost);
		spent = true;

		const result = await deps.run(prompt);
		const stored = await deps.storeImage(userId, result.png);
		const id = deps.newId();
		const durationMs = deps.now() - started;
		await deps.recordCompleted({
			id,
			userId,
			prompt,
			enhancedPrompt: result.prompt,
			imageKey: stored.key,
			inputImages: result.inputImages,
			...parseImageSize(result.size),
			durationMs,
			agentTokens:
				result.inputTokens === null && result.outputTokens === null
					? null
					: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
			systemVersion: result.systemVersion,
			cost,
		});

		return {
			status: 200,
			body: {
				id,
				image_url: stored.url,
				seed: null,
				duration: durationMs,
				engine: "turbo",
				cost,
			},
		};
	} catch (error) {
		if (spent) {
			await safely("Не удалось вернуть кредиты за Турбо", () =>
				deps.refundCredits(userId, cost),
			);
		}
		const details = error instanceof TurboError ? error.details : {};
		await safely("Не удалось записать неуспешную генерацию Турбо", () =>
			deps.recordFailed({
				userId,
				prompt,
				enhancedPrompt: details.prompt ?? null,
				inputImages: details.inputImages ?? [],
				durationMs: deps.now() - started,
				error,
			}),
		);

		if (error instanceof InsufficientCreditsError) {
			return { status: 402, body: { error: "Недостаточно кредитов" } };
		}
		if (error instanceof TurboError && error.code === "codex_auth_required") {
			await safely("Не удалось пометить вход Codex", () =>
				deps.onAuthFailure(error),
			);
		}
		console.error(`Turbo error (${TURBO_AGENT_MODEL}):`, error);
		return { status: 502, body: { error: TURBO_PUBLIC_ERROR } };
	}
}
```

- [ ] **Шаг 4: Боевые зависимости**

Создать `src/lib/turbo/runtime.ts`: новый менеджер входа на запуск, библиотека поверх бакета, запись в `generations` (колонки совпадают с миграцией задачи 3):

```typescript
import { deductCredits, refundCredits } from "../credits";
import { sql } from "../db";
import { describeGenerationError } from "../generation-error";
import { buildTurboSystem } from "../prompts/turbo.system";
import { getImageUrl, listObjects, readObject, uploadImage } from "../storage";
import { runTurbo } from "./agent";
import {
	codexFetch,
	codexLanguageModel,
	createCodexAuth,
	recordCodexError,
} from "./codex-auth";
import { CODEX_IMAGE_MODEL, editImage } from "./codex-images";
import { TURBO_AGENT_MODEL } from "./constants";
import { Library } from "./library";
import type { TurboServiceDeps } from "./service";

/** Библиотека читается из бакета с префиксом library/; кэш дерева живёт минуту */
const library = new Library({ list: listObjects, read: readObject });

/** Боевые зависимости сервиса Турбо: вход подписки, S3 и запись в `generations` */
export const turboDeps: TurboServiceDeps = {
	deductCredits,
	refundCredits,

	async run(prompt) {
		// новый менеджер входа на запуск: токены читаются из базы, а не из памяти экземпляра
		const auth = createCodexAuth();
		const authenticatedFetch = codexFetch(auth);
		return runTurbo(prompt, {
			model: codexLanguageModel(auth, TURBO_AGENT_MODEL),
			library,
			buildSystem: buildTurboSystem,
			edit: ({ prompt: finalPrompt, images, signal }) =>
				editImage({
					fetch: authenticatedFetch,
					prompt: finalPrompt,
					images,
					...(signal ? { signal } : {}),
				}),
		});
	},

	async storeImage(userId, png) {
		const key = `generations/${userId}/${Date.now()}.png`;
		await uploadImage(key, Buffer.from(png), "image/png");
		return { key, url: await getImageUrl(key) };
	},

	async recordCompleted(record) {
		await sql`
      INSERT INTO generations
        (id, user_id, prompt, enhanced_prompt, model, width, height, steps,
         image_key, status, duration_ms, llm_model, llm_tokens, enhance_ms,
         style_version, engine, cost, input_images)
      VALUES
        (${record.id}, ${record.userId}, ${record.prompt},
         ${record.enhancedPrompt}, ${CODEX_IMAGE_MODEL}, ${record.width},
         ${record.height}, 0, ${record.imageKey}, 'completed',
         ${record.durationMs}, ${TURBO_AGENT_MODEL}, ${record.agentTokens},
         ${record.durationMs}, ${record.systemVersion}, 'turbo', ${record.cost},
         ${sql.array(record.inputImages)})
    `;
	},

	async recordFailed(record) {
		await sql`
      INSERT INTO generations
        (id, user_id, prompt, enhanced_prompt, model, width, height, steps,
         status, error_message, duration_ms, llm_model, engine, cost,
         input_images)
      VALUES
        (${crypto.randomUUID()}, ${record.userId}, ${record.prompt},
         ${record.enhancedPrompt}, ${CODEX_IMAGE_MODEL}, 1024, 1024, 0,
         'failed', ${describeGenerationError(record.error)},
         ${record.durationMs}, ${TURBO_AGENT_MODEL}, 'turbo', 0,
         ${sql.array(record.inputImages)})
    `;
	},

	async onAuthFailure(error) {
		await recordCodexError(`${error.code}: ${error.message}`);
	},

	now: Date.now,
	newId: () => crypto.randomUUID(),
};
```

- [ ] **Шаг 5: Ветка Турбо в `/api/generate` и `/api/models`**

В `src/api/generate.ts` заменить временную привязку из задачи 2 полной веткой. Без рабочего входа Codex `"turbo"` сводится к движку по умолчанию, как неизвестное значение.

```diff
--- a/src/api/generate.ts
+++ b/src/api/generate.ts
@@ -21,16 +21,17 @@
 	updateKeyQuota,
 } from "../lib/keys";
 import {
-	DEFAULT_IMAGE_ENGINE,
 	getImageModel,
 	IDEOGRAM_MODE,
 	IDEOGRAM_STEPS,
-	isSpaceEngine,
 	publicImageModels,
 	resolveImageEngine,
 } from "../lib/models";
 import { checkRateLimit } from "../lib/rate-limit";
 import { getImageUrl, uploadImage } from "../lib/storage";
+import { isTurboAvailable } from "../lib/turbo/codex-auth";
+import { turboDeps } from "../lib/turbo/runtime";
+import { generateTurbo } from "../lib/turbo/service";
 
 const MAX_ATTEMPTS = 5;
 
@@ -85,11 +86,13 @@
 
 export const generateRoutes = {
 	"/api/models": {
-		// публичный каталог движков: без секретов, можно кэшировать
-		GET: () =>
-			Response.json(publicImageModels(), {
-				headers: { "Cache-Control": "public, max-age=300" },
-			}),
+		// каталог движков без секретов; Турбо в нём только пока рабочий вход Codex
+		GET: async () => {
+			const turbo = await isTurboAvailable().catch(() => false);
+			return Response.json(publicImageModels({ turbo }), {
+				headers: { "Cache-Control": "private, max-age=60" },
+			});
+		},
 	},
 
 	"/api/generate": {
@@ -109,17 +112,26 @@
 			const body = await req.json();
 			const { prompt, negativePrompt, model, width, height, steps, seed } =
 				body;
-			const requested = resolveImageEngine(body.engine);
-			// Турбо подключается отдельной веткой (задача про сервис Турбо): до неё остаётся движок Space
-			const engine = isSpaceEngine(requested)
-				? requested
-				: DEFAULT_IMAGE_ENGINE;
-			const { cost } = getImageModel(engine);
+			// без рабочего входа Codex «turbo» ничем не отличается от неизвестного движка
+			const turboAvailable =
+				body.engine === "turbo" &&
+				(await isTurboAvailable().catch(() => false));
+			const engine = resolveImageEngine(body.engine, turboAvailable);
 
 			if (!prompt || prompt.length > 1000) {
 				return Response.json({ error: "Некорректный промпт" }, { status: 400 });
 			}
 
+			if (engine === "turbo") {
+				const outcome = await generateTurbo(
+					{ userId: session.user.id, prompt },
+					turboDeps,
+				);
+				return Response.json(outcome.body, { status: outcome.status });
+			}
+
+			const { cost } = getImageModel(engine);
+
 			let creditSpent = false;
 			let currentKey: Awaited<ReturnType<typeof getAvailableKey>> | null = null;
 			let enhanced: Awaited<ReturnType<typeof enhancePrompt>> | null = null;
```

- [ ] **Шаг 6: Проверки**

```bash
bun test src/lib/__tests__/turbo-service.test.ts
```

Ожидается: `7 pass`.

```bash
bun run typecheck
```

Проверка маршрутов на dev-сервере (запустить `bun dev` в фоне, затем остановить):

```bash
curl -s http://localhost:3000/api/models
```

Ожидается без входа Codex: `[{"id":"krea","label":"Krea 2","cost":1},{"id":"ideogram","label":"Ideogram 4","cost":3}]` (Турбо в списке нет).

```bash
curl -s -X POST http://localhost:3000/api/generate -H "Content-Type: application/json" -d '{"prompt":"кот","engine":"turbo"}'
```

Ожидается: `{"error":"Unauthorized"}` (401 без сессии).

- [ ] **Шаг 7: Линтер и коммит**

```bash
bun run lint:fix
```

```bash
git add src/lib/turbo/service.ts src/lib/turbo/runtime.ts src/api/generate.ts src/lib/__tests__/turbo-service.test.ts
```

```bash
git commit -m "feat(turbo): сервис генерации и ветка turbo в /api/generate" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 10: Админ-эндпоинты входа Codex

**Файлы:**
- Изменить: `src/api/admin.ts` (экспорт `checkAdmin` и `adminResponse`), `src/server.ts`
- Создать: `src/api/codex-admin.ts`

**Интерфейсы:**
- Потребляет: `getCodexStatus`, `createCodexAuth`, `checkCodex`, `codexLoginStream` (задача 5); `checkAdmin`, `adminResponse` из `src/api/admin.ts`.
- Производит эндпоинты (для задачи 11), все только для админа (иначе 403):
  - `GET /api/admin/codex` → `CodexStatus`
  - `POST /api/admin/codex/login` → поток `application/x-ndjson` из событий `CodexLoginEvent`, живёт до подтверждения кода (не дольше 280 с)
  - `POST /api/admin/codex/check` → `CodexCheckResult`, статус 200 или 502
  - `DELETE /api/admin/codex` → `{ success: true }` (выход, токены стираются)

- [ ] **Шаг 1: Экспортировать общие функции админки**

```diff
--- a/src/api/admin.ts
+++ b/src/api/admin.ts
@@ -15,7 +15,7 @@
 
 class AdminError extends Error {}
 
-async function checkAdmin(req: Request) {
+export async function checkAdmin(req: Request) {
 	const session = await auth.api.getSession({ headers: req.headers });
 	if (!session || session.user.email !== ADMIN_EMAIL) {
 		throw new AdminError("Unauthorized");
@@ -23,7 +23,7 @@
 	return session;
 }
 
-function adminResponse<T>(fn: () => Promise<T>) {
+export function adminResponse<T>(fn: () => Promise<T>) {
 	return fn().catch((err) => {
 		if (err instanceof AdminError) {
 			return Response.json({ error: "Forbidden" }, { status: 403 });
```

- [ ] **Шаг 2: Создать роуты**

Создать `src/api/codex-admin.ts`:

```typescript
import {
	checkCodex,
	codexLoginStream,
	createCodexAuth,
	getCodexStatus,
} from "../lib/turbo/codex-auth";
import { adminResponse, checkAdmin } from "./admin";

/** Вход по коду живёт до подтверждения; функция Vercel — не больше 300 с */
const LOGIN_TIMEOUT_MS = 280_000;

export const codexAdminRoutes = {
	"/api/admin/codex": {
		GET: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				return Response.json(await getCodexStatus());
			}),

		DELETE: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				await createCodexAuth().logout();
				return Response.json({ success: true });
			}),
	},

	"/api/admin/codex/login": {
		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				const signal = AbortSignal.any([
					req.signal,
					AbortSignal.timeout(LOGIN_TIMEOUT_MS),
				]);
				return new Response(codexLoginStream(createCodexAuth(), signal), {
					headers: {
						"Content-Type": "application/x-ndjson; charset=utf-8",
						"Cache-Control": "no-store",
					},
				});
			}),
	},

	"/api/admin/codex/check": {
		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				const result = await checkCodex(createCodexAuth());
				return Response.json(result, { status: result.ok ? 200 : 502 });
			}),
	},
};
```

- [ ] **Шаг 3: Подключить роуты в сервере**

```diff
--- a/src/server.ts
+++ b/src/server.ts
@@ -3,6 +3,7 @@
 import { serve } from "bun";
 import { adminRoutes } from "./api/admin";
 import { authRoutes } from "./api/auth";
+import { codexAdminRoutes } from "./api/codex-admin";
 import { generateRoutes } from "./api/generate";
 
 const DIST_DIR = join(process.cwd(), "dist");
@@ -38,6 +39,10 @@
 		"/api/admin/keys": adminRoutes["/api/admin/keys"],
 		"/api/admin/keys/:id": adminRoutes["/api/admin/keys/:id"],
 		"/api/admin/stats": adminRoutes["/api/admin/stats"],
+
+		"/api/admin/codex": codexAdminRoutes["/api/admin/codex"],
+		"/api/admin/codex/login": codexAdminRoutes["/api/admin/codex/login"],
+		"/api/admin/codex/check": codexAdminRoutes["/api/admin/codex/check"],
 	},
 
 	fetch: async (req) => {
```

- [ ] **Шаг 4: Проверка**

```bash
bun run typecheck
```

Запустить `bun dev` в фоне и убедиться, что без админской сессии эндпоинты закрыты:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/codex
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/codex/login
```

Ожидается оба раза: `403`. Остановить сервер.

- [ ] **Шаг 5: Коммит**

```bash
bun run lint:fix
```

```bash
git add src/api/admin.ts src/api/codex-admin.ts src/server.ts
```

```bash
git commit -m "feat(turbo): админ-эндпоинты входа Codex" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 11: Интерфейс: переключатель режимов, ожидание, вход Codex в админке

**Перед правками загрузить скиллы `shadcn` и `design-taste-frontend`** (проект требует скилл `shadcn` для любых правок интерфейса; из `design-taste-frontend` использовать только то, что относится к состояниям загрузки и движению: движение осмысленное, `prefers-reduced-motion` обязателен, анимируются только простые свойства). Остальное в нём про лендинги и к этому экрану не относится.

**Файлы:**
- Создать (CLI): `src/components/ui/tabs.tsx`
- Изменить: `src/components/graphics.tsx`, `src/index.css`, `src/components/Generate.tsx`, `src/components/Admin.tsx`
- Создать: `src/components/CodexAccess.tsx`

**Интерфейсы:**
- Потребляет: `PublicImageModel`, `TURBO_MODEL`, `SpaceEngine` (задача 2); эндпоинты и типы `CodexStatus`, `CodexLoginEvent`, `CodexCheckResult` (задачи 5 и 10).
- Производит: переключатель «Изображение / Турбо» (виден, только если `/api/models` отдал `turbo`; выбранный режим запоминается в `localStorage` по ключу `gen42-mode`); общий компонент ожидания `PopWait` вместо `PopSkeleton` на экране генерации; блок «Вход Codex» в админке.

Решения по дизайну: переключатель сверху по центру (как «Чат / Работа» в ChatGPT), активный сегмент с градиентом проекта (`--pop-gradient`, единственное место для градиента сегментов по `index.css`), форма «таблетка» как у чипа модели. Ожидание: на холсте дорисовывается число 42 (штрих прорисовывается, держится и гаснет), рядом дрейфуют две искры. Движение осмысленное: оно показывает, что кадр собирается. При `prefers-reduced-motion` число 42 нарисовано целиком и неподвижно. Подпись для Турбо честно предупреждает, что это займёт пару минут.

- [ ] **Шаг 1: Добавить компонент Tabs через CLI**

```bash
bunx --bun shadcn@latest add tabs --yes
```

Если команда зависла дольше двух минут, остановить и повторить. Затем прочитать созданный `src/components/ui/tabs.tsx` и проверить:
- импорт `cn` должен быть `from "@/lib/utils"`; если CLI записал `from "cn"` и добавил пакет `cn` в `package.json`, заменить импорт и удалить пакет (`bun remove cn`);
- иконки у `TabsTrigger` получают размер от самого компонента (`[&_svg:not([class*='size-'])]:size-4`), в `Generate.tsx` они без классов.

- [ ] **Шаг 2: Подогнать Tabs под стиль проекта**

Форма «таблетка», активный сегмент с градиентом. В `tabsListVariants` заменить `rounded-lg` на `rounded-full`; в `TabsTrigger` заменить `rounded-md` на `rounded-full`, а строку

```
"data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
```

на

```
"data-[state=active]:bg-[image:var(--pop-gradient)] data-[state=active]:text-white dark:data-[state=active]:border-transparent dark:data-[state=active]:text-white",
```

- [ ] **Шаг 3: Компонент ожидания**

В `src/components/graphics.tsx` изменить первую строку импорта и дописать компонент в конец файла:

```diff
--- a/src/components/graphics.tsx
+++ b/src/components/graphics.tsx
@@ -1,4 +1,4 @@
-import type { CSSProperties } from "react";
+import { type CSSProperties, useId } from "react";
 import { cn } from "@/lib/utils";
 
 /* Пузырьковый градиентный вордмарк + искра */
@@ -205,3 +205,66 @@
 		/>
 	);
 }
+
+/* Ожидание генерации: на холсте дорисовывается число 42, рядом дрейфуют искры */
+export function PopWait({
+	className,
+	label = "Собираем кадр",
+}: {
+	className?: string;
+	label?: string;
+}) {
+	const gradientId = useId();
+	return (
+		<div
+			role="status"
+			aria-live="polite"
+			className={cn(
+				"pop-skeleton flex flex-col items-center justify-center gap-6",
+				className,
+			)}
+		>
+			<svg
+				viewBox="0 0 200 112"
+				fill="none"
+				className="relative w-1/2 max-w-64"
+				aria-hidden="true"
+			>
+				<defs>
+					<linearGradient
+						id={gradientId}
+						x1="0"
+						y1="0"
+						x2="200"
+						y2="0"
+						gradientUnits="userSpaceOnUse"
+					>
+						<stop stopColor="#6c5cff" />
+						<stop offset="1" stopColor="#ff5ca8" />
+					</linearGradient>
+				</defs>
+				<g
+					stroke={`url(#${gradientId})`}
+					strokeWidth="9"
+					strokeLinecap="round"
+					strokeLinejoin="round"
+				>
+					<path
+						className="pop-wait-stroke"
+						pathLength="1"
+						d="M64 14 18 72h64M64 14v84"
+					/>
+					<path
+						className="pop-wait-stroke [animation-delay:0.9s]"
+						pathLength="1"
+						transform="translate(100 0)"
+						d="M18 38C18 12 78 8 78 38c0 20-30 36-60 62h64"
+					/>
+				</g>
+			</svg>
+			<SparkStar className="animate-float-slow absolute right-[12%] top-[14%] size-8" />
+			<SparkStar className="animate-float-slow absolute bottom-[16%] left-[10%] size-5 [animation-delay:1.8s]" />
+			<p className="relative text-sm text-muted-foreground">{label}</p>
+		</div>
+	);
+}
```

В `src/index.css` добавить анимацию и её отключение при `prefers-reduced-motion`:

```diff
--- a/src/index.css
+++ b/src/index.css
@@ -152,6 +152,31 @@
   }
 }
 
+/* Число 42 на холсте ожидания: линия прорисовывается, держится и гаснет */
+@keyframes pop-draw {
+  0% {
+    stroke-dashoffset: 1;
+    opacity: 1;
+  }
+  45% {
+    stroke-dashoffset: 0;
+  }
+  85% {
+    stroke-dashoffset: 0;
+    opacity: 1;
+  }
+  100% {
+    stroke-dashoffset: 0;
+    opacity: 0;
+  }
+}
+
+.pop-wait-stroke {
+  stroke-dasharray: 1;
+  stroke-dashoffset: 1;
+  animation: pop-draw 3.6s ease-in-out infinite;
+}
+
 @keyframes float-slow {
   0%,
   100% {
@@ -230,6 +255,12 @@
     animation: none;
   }
 
+  /* без движения число 42 просто нарисовано целиком */
+  .pop-wait-stroke {
+    animation: none;
+    stroke-dashoffset: 0;
+  }
+
   .pop-lift,
   .pop-lift:hover {
     transform: none;
```

- [ ] **Шаг 4: Режимы на экране генерации**

```diff
--- a/src/components/Generate.tsx
+++ b/src/components/Generate.tsx
@@ -1,10 +1,12 @@
 import {
+	IconBolt,
 	IconCheck,
 	IconChevronLeft,
 	IconChevronRight,
 	IconCoins,
 	IconCopy,
 	IconDownload,
+	IconPhoto,
 	IconPhotoOff,
 	IconSparkles,
 	IconX,
@@ -14,15 +16,21 @@
 import {
 	InputGroup,
 	InputGroupAddon,
+	InputGroupText,
 	InputGroupTextarea,
 } from "@/components/ui/input-group";
 import { Label } from "@/components/ui/label";
+import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
 import { imageExtension } from "@/lib/image-format";
-import type { PublicImageModel, SpaceEngine } from "@/lib/models";
+import {
+	type PublicImageModel,
+	type SpaceEngine,
+	TURBO_MODEL,
+} from "@/lib/models";
 import {
 	EmptyCanvasArt,
-	PopSkeleton,
 	PopSpinner,
+	PopWait,
 	SparkStar,
 	StickerBurst,
 } from "./graphics";
@@ -35,6 +43,19 @@
 
 const HISTORY_LIMIT = 8;
 
+type Mode = "image" | "turbo";
+const MODE_STORAGE_KEY = "gen42-mode";
+
+function readStoredMode(): Mode {
+	try {
+		return localStorage.getItem(MODE_STORAGE_KEY) === "turbo"
+			? "turbo"
+			: "image";
+	} catch {
+		return "image";
+	}
+}
+
 export function Generate({ balance, onBalanceChange }: GenerateProps) {
 	const [prompt, setPrompt] = useState("");
 	const [loading, setLoading] = useState(false);
@@ -45,10 +66,27 @@
 	const [selected, setSelected] = useState<number | null>(null);
 	const [models, setModels] = useState<PublicImageModel[]>([]);
 	const [engine, setEngine] = useState<SpaceEngine>("krea");
+	const [mode, setMode] = useState<Mode>(readStoredMode);
 
-	const cost = models.find((m) => m.id === engine)?.cost ?? 1;
+	// Турбо виден, только пока сервер отдаёт его в списке: иначе экран один, обычный
+	const turboModel = models.find((m) => m.id === "turbo");
+	const activeMode: Mode = turboModel ? mode : "image";
+	const cost =
+		activeMode === "turbo"
+			? (turboModel?.cost ?? TURBO_MODEL.cost)
+			: (models.find((m) => m.id === engine)?.cost ?? 1);
 	const outOfCredits = balance !== null && balance < cost;
 
+	function changeMode(next: string) {
+		const value: Mode = next === "turbo" ? "turbo" : "image";
+		setMode(value);
+		try {
+			localStorage.setItem(MODE_STORAGE_KEY, value);
+		} catch {
+			/* режим просто не запомнится */
+		}
+	}
+
 	useEffect(() => {
 		loadHistory();
 		loadModels();
@@ -121,14 +159,18 @@
 			const res = await fetch("/api/generate", {
 				method: "POST",
 				headers: { "Content-Type": "application/json" },
-				body: JSON.stringify({
-					prompt,
-					engine,
-					...(engine === "krea" ? { model: "Turbo", steps: 8 } : {}),
-					width: 1024,
-					height: 1024,
-					guidance: 0.0,
-				}),
+				body: JSON.stringify(
+					activeMode === "turbo"
+						? { prompt, engine: "turbo" }
+						: {
+								prompt,
+								engine,
+								...(engine === "krea" ? { model: "Turbo", steps: 8 } : {}),
+								width: 1024,
+								height: 1024,
+								guidance: 0.0,
+							},
+				),
 			});
 
 			if (!res.ok) {
@@ -186,6 +228,24 @@
 	return (
 		<div className="mx-auto max-w-3xl">
 			<div className="animate-pop-in">
+				{turboModel && (
+					<Tabs
+						value={activeMode}
+						onValueChange={changeMode}
+						className="mb-8 items-center"
+					>
+						<TabsList>
+							<TabsTrigger value="image" disabled={loading}>
+								<IconPhoto />
+								Изображение
+							</TabsTrigger>
+							<TabsTrigger value="turbo" disabled={loading}>
+								<IconBolt />
+								{turboModel.label}
+							</TabsTrigger>
+						</TabsList>
+					</Tabs>
+				)}
 				<div className="flex flex-col gap-2">
 					<div className="flex items-center gap-2">
 						<SparkStar className="h-4 w-4" />
@@ -206,12 +266,18 @@
 							className="min-h-36 text-lg leading-relaxed"
 						/>
 						<InputGroupAddon align="block-end" className="justify-between">
-							<ModelPicker
-								models={models}
-								value={engine}
-								onChange={setEngine}
-								disabled={loading}
-							/>
+							{activeMode === "image" ? (
+								<ModelPicker
+									models={models}
+									value={engine}
+									onChange={setEngine}
+									disabled={loading}
+								/>
+							) : (
+								<InputGroupText>
+									Сам подберёт образы и соберёт кадр
+								</InputGroupText>
+							)}
 							<span className="relative">
 								<Button
 									type="button"
@@ -254,12 +320,15 @@
 			</div>
 
 			{loading && (
-				<div
-					className="animate-pop-in mt-10"
-					aria-live="polite"
-					aria-label="Генерация идёт"
-				>
-					<PopSkeleton className="aspect-square w-full" />
+				<div className="animate-pop-in mt-10">
+					<PopWait
+						className="aspect-square w-full"
+						label={
+							activeMode === "turbo"
+								? "Собираем кадр, это займёт пару минут"
+								: "Собираем кадр"
+						}
+					/>
 				</div>
 			)}
 
```

Что делает правка: вкладки видны, только если сервер отдал Турбо; в режиме «Турбо» вместо чипа модели короткая подсказка без технических подробностей, кнопка с ценой 10, в запросе только `prompt` и `engine: "turbo"`; ожидание на `PopWait`.

- [ ] **Шаг 5: Блок «Вход Codex» в админке**

Создать `src/components/CodexAccess.tsx`. Показывает состояние (вошли ли, тариф, время, ошибка), код и ссылку во время входа, кнопки «Войти», «Проверить», «Выйти»:

```tsx
import {
	IconExternalLink,
	IconLogin2,
	IconLogout,
	IconRefresh,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
	CodexCheckResult,
	CodexLoginEvent,
	CodexStatus,
} from "@/lib/turbo/codex-events";

interface PendingLogin {
	userCode: string;
	verificationUrl: string;
}

type Busy = "login" | "check" | "logout" | null;

interface Notice {
	tone: "ok" | "error";
	text: string;
}

function formatDate(iso: string | null): string {
	if (!iso) return "нет данных";
	return new Date(iso).toLocaleString("ru", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Вход подписки ChatGPT для режима «Турбо»: один вход обслуживает и агента, и картинки */
export function CodexAccess() {
	const [status, setStatus] = useState<CodexStatus | null>(null);
	const [pending, setPending] = useState<PendingLogin | null>(null);
	const [busy, setBusy] = useState<Busy>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	const loginAbort = useRef<AbortController | null>(null);

	useEffect(() => {
		void loadStatus();
		return () => loginAbort.current?.abort();
	}, []);

	async function loadStatus() {
		try {
			const res = await fetch("/api/admin/codex");
			if (res.ok) setStatus(await res.json());
		} catch (error) {
			console.error("Не удалось получить состояние входа Codex:", error);
		}
	}

	function handleLoginEvent(event: CodexLoginEvent) {
		if (event.type === "code") {
			setPending({
				userCode: event.userCode,
				verificationUrl: event.verificationUrl,
			});
		} else if (event.type === "done") {
			setNotice({ tone: "ok", text: "Вход выполнен" });
		} else {
			setNotice({ tone: "error", text: event.message });
		}
	}

	async function login() {
		const controller = new AbortController();
		loginAbort.current = controller;
		setBusy("login");
		setNotice(null);
		try {
			const res = await fetch("/api/admin/codex/login", {
				method: "POST",
				signal: controller.signal,
			});
			if (!res.ok || !res.body) throw new Error("Не удалось начать вход");

			const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += value;
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (line.trim()) handleLoginEvent(JSON.parse(line));
				}
			}
		} catch (error) {
			if (!controller.signal.aborted) {
				setNotice({
					tone: "error",
					text: error instanceof Error ? error.message : "Вход не удался",
				});
			}
		} finally {
			loginAbort.current = null;
			setPending(null);
			setBusy(null);
			void loadStatus();
		}
	}

	async function check() {
		setBusy("check");
		setNotice(null);
		try {
			const res = await fetch("/api/admin/codex/check", { method: "POST" });
			const result: CodexCheckResult | { error: string } = await res.json();
			if ("ok" in result && result.ok) {
				setNotice({
					tone: "ok",
					text: `Вход рабочий, моделей на аккаунте: ${result.models.length}`,
				});
			} else {
				setNotice({
					tone: "error",
					text: "error" in result ? result.error : "Проверка не пройдена",
				});
			}
		} catch {
			setNotice({ tone: "error", text: "Проверка не удалась" });
		} finally {
			setBusy(null);
			void loadStatus();
		}
	}

	async function logout() {
		if (!window.confirm("Выйти из Codex? Режим «Турбо» пропадёт у всех.")) {
			return;
		}
		setBusy("logout");
		setNotice(null);
		try {
			await fetch("/api/admin/codex", { method: "DELETE" });
		} finally {
			setBusy(null);
			void loadStatus();
		}
	}

	const loggedIn = status?.loggedIn ?? false;
	const healthy = loggedIn && !status?.lastError;

	return (
		<section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:280ms]">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-display text-xl font-bold text-foreground">
					Вход Codex
				</h3>
				{status && (
					<Badge
						variant={
							healthy ? "default" : loggedIn ? "destructive" : "secondary"
						}
					>
						{healthy
							? "Турбо работает"
							: loggedIn
								? "Нужна проверка"
								: "Вход не выполнен"}
					</Badge>
				)}
			</div>

			<p className="mt-3 max-w-prose text-sm text-muted-foreground">
				Подписка ChatGPT, через которую работает режим «Турбо». Пока входа нет
				или он нерабочий, пользователи режима не видят.
			</p>

			{status && loggedIn && (
				<dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
					<dt className="text-muted-foreground">Тариф</dt>
					<dd className="text-foreground">{status.planType ?? "неизвестен"}</dd>
					<dt className="text-muted-foreground">Обновлён</dt>
					<dd className="text-foreground">{formatDate(status.updatedAt)}</dd>
					{status.lastError && (
						<>
							<dt className="text-muted-foreground">Ошибка</dt>
							<dd className="break-words text-destructive">
								{status.lastError}
							</dd>
						</>
					)}
				</dl>
			)}

			{pending && (
				<div className="mt-5 flex flex-col gap-3 rounded-[22px] border border-border bg-secondary/60 p-5">
					<p className="text-sm text-muted-foreground">
						Откройте ссылку, войдите в нужный аккаунт ChatGPT и введите код.
					</p>
					<p className="font-mono text-3xl font-bold tracking-widest text-foreground">
						{pending.userCode}
					</p>
					<div className="flex flex-wrap gap-2">
						<Button asChild variant="outline" size="sm">
							<a
								href={pending.verificationUrl}
								target="_blank"
								rel="noreferrer"
							>
								<IconExternalLink data-icon="inline-start" />
								Открыть страницу входа
							</a>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => loginAbort.current?.abort()}
						>
							<IconX data-icon="inline-start" />
							Отмена
						</Button>
					</div>
				</div>
			)}

			{notice && (
				<p
					role="status"
					className={`mt-4 text-sm ${notice.tone === "ok" ? "text-primary" : "text-destructive"}`}
				>
					{notice.text}
				</p>
			)}

			<div className="mt-6 flex flex-wrap gap-2">
				<Button onClick={login} disabled={busy !== null}>
					<IconLogin2 data-icon="inline-start" />
					{loggedIn ? "Войти заново" : "Войти"}
				</Button>
				<Button
					variant="outline"
					onClick={check}
					disabled={busy !== null || !loggedIn}
				>
					<IconRefresh data-icon="inline-start" />
					Проверить
				</Button>
				<Button
					variant="ghost"
					onClick={logout}
					disabled={busy !== null || !loggedIn}
					className="text-destructive hover:text-destructive"
				>
					<IconLogout data-icon="inline-start" />
					Выйти
				</Button>
			</div>
		</section>
	);
}
```

Подключить в `src/components/Admin.tsx`:

```diff
--- a/src/components/Admin.tsx
+++ b/src/components/Admin.tsx
@@ -24,6 +24,7 @@
 	TableHeader,
 	TableRow,
 } from "@/components/ui/table";
+import { CodexAccess } from "./CodexAccess";
 import { DecoScatter } from "./DecoScatter";
 import { PopSkeleton, SparkStar } from "./graphics";
 
@@ -682,6 +683,8 @@
 					</Table>
 				</div>
 			</section>
+
+			<CodexAccess />
 		</div>
 	);
 }
```

- [ ] **Шаг 6: Сборка и проверки**

```bash
bun run lint:fix
```

```bash
bun run typecheck
```

```bash
bun run build
```

Ожидается: тайпчек без ошибок, сборка пишет `dist/...` без ошибок. Визуальная проверка в браузере (вкладки, ожидание, админка) делается в задаче 12, когда будет вход Codex.

- [ ] **Шаг 7: Коммит**

```bash
git add src/components/ui/tabs.tsx src/components/graphics.tsx src/index.css src/components/Generate.tsx src/components/Admin.tsx src/components/CodexAccess.tsx package.json bun.lock
```

```bash
git commit -m "feat(turbo): переключатель режимов, ожидание «42», вход Codex в админке" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 12: Описания библиотеки, настройка агента, замер времени, сквозная проверка на dev

Эта задача выполняется вместе с владельцем: нужны его ответы про каждое изображение и его вход в аккаунт ChatGPT. Описания лежат в папке `library/<папка>/описания.txt` внутри репозитория (вне git, в коммиты не попадают).

**Файлы:**
- Создать: `scripts/eval-turbo.ts`
- Изменить при необходимости: `src/lib/prompts/turbo.system.ts` (настройка инструкции по результатам прогонов)
- Изменить: `docs/superpowers/specs/2026-10-05-turbo-mode-design.md` (замеры времени)

- [ ] **Шаг 1: Описания библиотеки вместе с владельцем**

Формат файла: по строке на изображение, `имя_файла — что на нём` (длинное тире с пробелами вокруг). Работать по одной картинке, один вопрос за сообщение:

1. Перечислить папки с изображениями (все, кроме пустой `скриншоты`) и спросить владельца, с какой начать.
2. Для каждого изображения открыть его (инструмент чтения изображений), назвать владельцу имя файла и одной фразой сказать, что на нём видно. Задать один вопрос: кто или что это и что агенту важно знать для кадра (имя героя, как его называют, поза, одежда, чем отличается от соседних изображений).
3. Записать строку в `описания.txt` папки дословно по ответу владельца, без украшений и пересказа. Описания должны отличать похожие изображения друг от друга: по ним агент выбирает, не открывая картинку.
4. После каждой папки показать файл целиком и дождаться подтверждения.

Описания для всех папок должны быть готовы до заливки на prod.

- [ ] **Шаг 2: Залить библиотеку с описаниями в dev-бакет**

```bash
bun scripts/sync-library.ts
```

Ожидается: загружены новые `описания.txt`, раздел `Проблемы с описаниями` пуст. Если скрипт сообщает об изображении без описания или описании несуществующего файла, исправить файл.

- [ ] **Шаг 3: Скрипт прогона агента**

Создать `scripts/eval-turbo.ts`. Он гоняет агента по набору запросов и печатает выбранные изображения и итоговый промпт. Без `--generate` картинки не рисуются (лимит подписки не тратится), с `--generate` ещё и замеряет время запуска:

```typescript
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
	"Бастер и Данджерлёха пьют Tornado на крыше",
	"флаг 42 над ратушей и салют",
	"кот",
	"смысл жизни",
	"плакат с надписью «СЛАВА 42»",
	"Мафаня в майке оранджэнг раздаёт слитки",
	"Даванков и Романцев играют в шахматы с бегемотом",
];

const generate = process.argv.includes("--generate");
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
	try {
		const result = await runTurbo(prompt, {
			model: codexLanguageModel(auth, TURBO_AGENT_MODEL),
			library,
			buildSystem: buildTurboSystem,
			edit: async ({ prompt: finalPrompt, images, signal }) =>
				generate
					? editImage({
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
			`# ${prompt}  (${seconds} с, токенов ${(result.inputTokens ?? 0) + (result.outputTokens ?? 0)})`,
		);
		console.log(`  изображения: ${result.inputImages.join(", ") || "нет"}`);
		console.log(`  промпт: ${result.prompt}\n`);
		await appendFile(
			jsonl,
			`${JSON.stringify({ prompt, version, seconds, inputImages: result.inputImages, finalPrompt: result.prompt, size: result.size })}\n`,
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
```

- [ ] **Шаг 4: Войти в Codex на dev**

Запустить `bun dev` в фоне, открыть `http://localhost:3000` в браузере, войти админом, открыть `#/admin`, в блоке «Вход Codex» нажать «Войти». Владелец открывает показанную ссылку, входит в аккаунт ChatGPT и вводит код (код живёт до ~5 минут). Затем нажать «Проверить».

Ожидается: бейдж «Турбо работает», тариф и время; сообщение «Вход рабочий, моделей на аккаунте: N».

- [ ] **Шаг 5: Прогон агента без рисования и настройка инструкции**

```bash
bun scripts/eval-turbo.ts
```

Разобрать вместе с владельцем каждый запрос: выбраны ли названные люди и предметы, лучшее ли изображение под кадр, нет ли лишнего просмотра картинок, хороши ли итоговые промпты (роли Image N, оговорки точности, формат 180–300 слов). Заодно отметить, заметно ли замедляет прогон просмотр больших изображений: если да, сообщить владельцу (уменьшенные копии для просмотра в этот план не входят, это решение по результатам замеров). Замечания вносить прямо в `src/lib/prompts/turbo.system.ts` (это единственный источник инструкции) и повторять прогон. Общие блоки канона правятся в `canon.ts` и затрагивают обе инструкции: перед такой правкой согласовать с владельцем.

- [ ] **Шаг 6: Замер времени запуска с рисованием**

Расходует лимит подписки на картинки: шесть запросов.

```bash
bun scripts/eval-turbo.ts --generate "пятёрка" "Бастер" "кот" "42" "СЛАВА" "Мафаня"
```

Ожидается в конце строка вида `Время запуска, с: мин X, медиана Y, p90 Z, макс W (прогонов 6)`. Открыть картинки в `docs/evals/images/` и оценить качество вместе с владельцем.

Правило из спецификации: если p90 или максимум больше ~200 с, сначала снизить рассуждение: в `src/lib/turbo/agent.ts` заменить `reasoning: "high"` на `reasoning: "medium"` и повторить замер. Если и после этого больше ~200 с, остановиться и спросить владельца: фоновый запуск (ответ клиенту сразу, результат по опросу статуса) или тариф Pro; в этот план они не входят. Записать замеры и принятое решение в раздел «Риски и проверка» спецификации (пункт «Время запуска»).

- [ ] **Шаг 7: Сквозная проверка интерфейса на dev**

В браузере (`http://localhost:3000`, вход обычным пользователем, у него должно быть не меньше 10 кредитов; админ может начислить через админку):

1. Сверху по центру переключатель «Изображение / Турбо». Переключить на «Турбо»: чип модели пропал, вместо него подсказка, на кнопке цена 10. Перезагрузить страницу: режим запомнился.
2. Ввести запрос с названным героем из библиотеки, нажать кнопку. Во время ожидания видна анимация с числом 42 и подпись про пару минут, вкладки заблокированы.
3. Появилась картинка; баланс уменьшился на 10; картинка есть в «Недавних» без пометок режима.
4. Запись в истории:

```bash
NODE_ENV=development bun -e 'import { sql } from "./src/lib/db"; console.log(await sql`SELECT engine, status, cost, input_images, llm_model, left(enhanced_prompt, 200) AS prompt, duration_ms, error_message FROM generations WHERE engine = ${"turbo"} ORDER BY created_at DESC LIMIT 3`); process.exit(0)'
```

Ожидается: `engine turbo`, `status completed`, `cost 10`, `input_images` с путями, `llm_model gpt-6-luna`, итоговый промпт.

5. Сбой: в админке нажать «Выйти» из Codex, обновить страницу пользователя: переключателя нет, один обычный экран. Запрос с `engine: "turbo"` обрабатывается как неизвестный движок:

```bash
curl -s http://localhost:3000/api/models
```

Ожидается: только `krea` и `ideogram`. Войти в Codex снова (шаг 4).
6. Проверить ожидание и админку с включённым `prefers-reduced-motion` (эмуляция в инструментах разработчика): число 42 нарисовано целиком и неподвижно.

- [ ] **Шаг 8: Коммит**

```bash
bun run lint:fix
```

```bash
git add scripts/eval-turbo.ts src/lib/prompts docs/superpowers/specs/2026-10-05-turbo-mode-design.md
```

```bash
git commit -m "feat(turbo): прогон агента, настройка инструкции и замеры времени" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Задача 13: Документация, итоговые проверки и PR

**Файлы:**
- Изменить: `AGENTS.md`, `README.md`

- [ ] **Шаг 1: Обновить `AGENTS.md`**

В разделе «Архитектура»:

Заменить пункт про `src/lib/models.ts` на:

```markdown
- `src/lib/models.ts` — реестр движков генерации `IMAGE_MODELS` (krea / ideogram): адрес Space, стоимость в кредитах, таймаут; Турбо описан отдельно (`TURBO_MODEL`, 10 кредитов, без Space); `publicImageModels({ turbo })` отдаёт клиенту только `id/label/cost` и добавляет Турбо только при рабочем входе Codex
```

В пункте про баланс заменить «(Krea 2 — 1, Ideogram 4 — 3)» на «(Krea 2 — 1, Ideogram 4 — 3, Турбо — 10)».

Перед разделом «Деплой на Vercel» добавить раздел:

```markdown
## Режим «Турбо»

- Третий движок `turbo`, 10 кредитов. Агент (AI SDK 7, `ToolLoopAgent`, модель `gpt-6-luna` через подписку ChatGPT, рассуждение `high`) сам выбирает входные изображения из библиотеки и один раз вызывает `generateImage`; картинку рисует прямой запрос к приватному Codex Images (`/backend-api/codex/images/edits`, до 10 входных, формат и качество запрашиваются 1:1 и medium, но решает сервер). Пользователь видит только запрос и итог
- Код в `src/lib/turbo/`: `library.ts` (библиотека как файловая система только для чтения), `tools.ts` (`listFolder`, `readFile`, `generateImage`), `agent.ts` (`runTurbo`, общий таймаут `TURBO_TIMEOUT_MS` = 270 с), `service.ts` (списание, запуск, хранение, запись, возврат), `runtime.ts` (боевые зависимости), `codex-auth.ts` и `codex-images.ts`. Инструкция агента — `src/lib/prompts/turbo.system.ts` (`buildTurboSystem(tree)`), общие блоки канона с обогащением лежат в `src/lib/prompts/canon.ts`; хеш инструкции без дерева пишется в `generations.style_version`
- Библиотека: бакет, префикс `library/`, ключи `library/<папка>/<файл>`; в каждой папке изображения и `описания.txt` со строками `имя_файла — что на нём`. Источник — папка `library/` в корне репозитория (вне git), заливка `bun scripts/sync-library.ts` (dev) и `NODE_ENV=production bun scripts/sync-library.ts --yes-prod` (prod, только с разрешения владельца). Дерево папок для инструкции строится на каждый запрос (кэш в памяти до минуты)
- Вход Codex: один на агента и картинки, токены в таблице `codex_auth` (одна строка, наружу не отдаются), обновление под `pg_advisory_xact_lock`. Админка → «Вход Codex»: «Войти» (код и ссылка, поток `POST /api/admin/codex/login` живёт до ~5 минут), «Проверить» (список моделей аккаунта, нужна `gpt-6-luna`), «Выйти». Второй вход (например, через Codex CLI) не создавать: он мешал бы обновлению токена. Если Codex перестанет принимать заголовок `originator` пакета, задать `CODEX_ORIGINATOR` (клиент Codex шлёт `codex_cli_rs`)
- Без рабочего входа Турбо для пользователей не существует: `/api/models` его не отдаёт, `engine: "turbo"` обрабатывается как неизвестный движок. Мёртвый вход помечается в `codex_auth.last_error` и тоже скрывает Турбо до «Проверить» или нового входа
- История: `engine = 'turbo'`, итоговый промпт агента в `enhanced_prompt`, пути выбранных изображений в `generations.input_images` (`text[]`, для отладки), `llm_model = 'gpt-6-luna'`, токены и время в `llm_tokens` и `enhance_ms`. Сбой пишется как `failed` с кодом `codex_auth_required` | `agent_failed` | `agent_no_generation` | `generation_rejected` | `agent_timeout`, кредиты возвращаются, пользователь видит одно сообщение «Не удалось создать изображение, кредиты возвращены»
- Эндпоинт подписки неофициальный и может измениться без предупреждения; лимит подписки общий на весь сайт. Проверка допущений на аккаунте: `bun scripts/smoke-codex.ts`; прогон агента без рисования: `bun scripts/eval-turbo.ts` (с `--generate` ещё и рисует, печатает время запуска)
```

В разделе «Деплой на Vercel» после пункта про `maxDuration` добавить:

```markdown
- Турбо укладывается в тот же лимит: агент и картинка вместе не дольше `TURBO_TIMEOUT_MS` (270 с). Если замеры (`bun scripts/eval-turbo.ts --generate`) покажут p90 больше ~200 с, снизить рассуждение до `medium`, затем думать о фоновом запуске или тарифе Pro
```

В разделе «Стиль UI» в пункт «Генерация» добавить в конец:

```markdown
; сверху по центру переключатель shadcn `Tabs` «Изображение / Турбо» (виден только при доступном Турбо, режим запоминается в `localStorage` `gen42-mode`): в режиме «Турбо» чипа модели нет, на кнопке цена 10; ожидание для всех движков — общий `PopWait` (рисуется число 42, при `prefers-reduced-motion` статично)
```

- [ ] **Шаг 2: Обновить `README.md`**

- Во вступлении заменить «(1 за Krea 2, 3 за Ideogram 4)» на «(1 за Krea 2, 3 за Ideogram 4, 10 за режим «Турбо»)».
- В «Как это работает» после пункта про движки добавить:

```markdown
- Режим «Турбо»: умный агент сам подбирает входные изображения из библиотеки культа и рисует кадр через подписку ChatGPT. Режим появляется у пользователей, только когда админ выполнил вход Codex в админке
```

- В таблицу переменных окружения добавить строку:

```markdown
| `CODEX_ORIGINATOR` | Необязательно. Заголовок `originator` для запросов подписки (по умолчанию значение пакета; если Codex его не принимает, `codex_cli_rs`) |
```

- В раздел «Структура» в список `lib/` добавить `turbo`, в `scripts/` упомянуть `sync-library.ts` (заливка библиотеки), `eval-turbo.ts` (прогон агента), `smoke-codex.ts` (проверка допущений).

- [ ] **Шаг 3: Итоговые проверки (свежие результаты, до заявлений о готовности)**

```bash
bun run typecheck
```

```bash
bun run lint
```

```bash
bunx biome format .
```

```bash
bun test
```

```bash
bun run build
```

Ожидается: всё без ошибок. Серверная часть и зависимости изменились, поэтому проверить бандл Vercel по процедуре из раздела «Деплой на Vercel» в `AGENTS.md`:

```bash
vercel build --prod
```

Затем материализовать файлы из `filePathMap` (`.vercel/output/functions/index.func/.vc-config.json`) в отдельную папку и запустить `bun src/server.mjs` с подложенным `.env`, обратиться к `GET /api/models`. Если в рантайме `Cannot find package 'X'` (пакет входа или его зависимости с разными условиями `exports`), добавить `X` в brace-глобу `includeFiles` в `vercel.json`, а не обходить в коде.

- [ ] **Шаг 4: Ревью диффа**

Запустить ревью субагентом (скилл `requesting-code-review`) по всему диффу ветки относительно `main`. Находки blocker и major закрыть, minor осознанно принять или закрыть. Отдельно попросить проверить: нигде ли токены Codex не попадают в логи, ответы API и сообщения ошибок; не раскрывает ли ответ пользователю причину сбоя или состояние входа; возвращаются ли кредиты на каждом пути сбоя.

- [ ] **Шаг 5: Коммит документации и PR**

```bash
git add AGENTS.md README.md
```

```bash
git commit -m "docs(turbo): режим «Турбо» в AGENTS.md и README" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Запушить ветку и открыть PR в `main` (скриншот интерфейса через скилл `before-and-after`: вкладки «Изображение / Турбо», ожидание, блок «Вход Codex»; в описании не писать про линтер, тесты и типы). После открытия привязать PR инструментами `ccd_pr` (`get_status`, при необходимости `bind_pr`), прочитать CI и предложить авто-исправление; ничего не вливать и автослияние не включать.

В конце описания PR перечислить для владельца действия, которые выполняются только с его разрешения, после слияния:

1. Миграция prod-базы: накатит GitHub Actions (`migrate-prod.yml`) при пуше в `main`.
2. Заливка библиотеки на prod: `NODE_ENV=production bun scripts/sync-library.ts --yes-prod` (описания всех папок должны быть готовы).
3. Вход Codex на prod: админка → «Вход Codex» → «Войти», затем «Проверить». Пока входа нет, Турбо на prod не существует.
4. Если Codex не принимает заголовок `originator` пакета: `vercel env add CODEX_ORIGINATOR production` и новый деплой (переменные окружения вступают в силу только после деплоя).
