# Турбо на Vercel Workflow: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запуск Турбо выполняется как воркфлоу Vercel Workflow: агент и рисование становятся отдельными устойчивыми шагами, каждый со своим лимитом 300 с, общего потолка на запуск нет.

**Architecture:** `POST /api/generate` (Турбо) создаёт строку `running`, списывает кредиты, запускает `turboWorkflow` через `start()` и сразу отвечает `202`; страница ждёт результат существующим опросом. Воркфлоу: `prepare`, цикл `WorkflowAgent` (вызовы модели и инструменты это шаги), `draw` (без повторов), `complete`; при любой ошибке `fail` возвращает кредиты. Модель Codex проходит границу шага через класс с протоколом сериализации. Обработчик очереди `flow` на Vercel это отдельная закрытая функция.

**Tech Stack:** Bun 1.4, `workflow@5.1.0`, `@ai-sdk/workflow@2.0.65`, `ai@7.0.133`, `@workflow/serde@4.1.0`, `@swc/core@1.15.3`, `bun:test`, Postgres (postgres.js), Neon Object Storage.

**Spec:** `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md` (контекст и замеры: `docs/superpowers/specs/2026-10-07-turbo-creative-direction-design.md`).

## Global Constraints

- Пакеты ставить только Bun 1.4.0 по абсолютному пути `/home/crbsnana/.local/share/reflex/bun/bin/bun` (`bun` из PATH, 1.3.11, портит `bun.lock`); после каждой установки `git diff --shortstat bun.lock`, `lockfileVersion` остаётся 2.
- `@swc/core` строго `1.15.3` (версия закреплена в пакетах Workflow; 1.16.x даёт «Failed to deserialize program received from host»).
- Документация версии проекта перед каждым шагом: `workflow-sdk.dev/docs` (`/docs/foundations/workflows-and-steps`, `/docs/foundations/errors-and-retries`, `/docs/foundations/serialization`, `/docs/api-reference/workflow-api/start`, `/worlds/local`, `/worlds/vercel`), `ai-sdk.dev/v7/docs/agents/workflow-agent`, `vercel.com/docs/queues/concepts`, `vercel.com/docs/functions/runtimes/bun`.
- Плюсы и минусы вариантов только по фактам: «подтверждено», «не проверено», «опровергнуто» с источником (правило `AGENTS.md`).
- Терминал: каждая команда отдельным вызовом, без склейки через `&&`; долгие процессы (dev-сервер) в фоне; `Edit`, `Read`, `Write` вместо `sed`/`cat`.
- TypeScript строгий (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`): типы импортируются через `import type`; отступы табами, кавычки двойные (Biome).
- Коммиты по ходу работы на ветке `feat/turbo-creative-direction`, сообщение по-русски, в конце строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Пуш, preview-деплой, PR и всё про `main` и прод только с разрешения владельца.
- Экран и тексты интерфейса без технических подробностей. Файл `src/components/Generate.tsx` это интерфейс: перед правкой загрузить скилл `shadcn` (правило проекта), менять только логику.
- Krea 2 и Ideogram 4, инструкцию `src/lib/prompts/turbo.system.ts` и схему БД не менять (строки инструкции про `retryable: false` остаются устаревшими, это отдельная задача: смена хеша `style_version`).
- Сообщение пользователю при любом сбое Турбо одно: «Не удалось создать изображение, кредиты возвращены».

## Файловая структура

Создать:
- `workflow-plugin.ts` — плагин Bun: преобразование кода приложения (`mode: "step"`).
- `workflows/turbo/index.ts` — `turboWorkflow`: оркестрация.
- `workflows/turbo/steps.ts` — шаги `prepareStep`, `listFolderStep`, `readFileStep`, `checkImageStep`, `drawStep`, `completeStep`, `failStep` (тонкие обёртки).
- `api/workflow-flow.ts` — закрытый потребитель очереди (вариант размещения уточняется в Задаче 2).
- `src/api/workflow-ping.ts` — временный маршрут проверки на preview (удаляется в Задаче 9).
- `src/lib/turbo/failure.ts` — `TurboFailure`, `toFailure`, `rethrowModelError`, `prefixedMessage`.
- `src/lib/turbo/size.ts` — `parseImageSize`.
- `src/lib/turbo/preview.ts` — `makePreview` (WebP до 1024 px через `Bun.Image`).
- `src/lib/turbo/ops.ts` — `readForAgent`, `checkImageArguments`, `drawImage`, тип `EditFn`.
- `src/lib/turbo/tool-defs.ts` — `createTurboTools(executors)`, тип `CheckImageOutput`.
- `src/lib/turbo/workflow-runtime.ts` — `TurboRuntime`, `getTurboRuntime`, `setTurboRuntime`.
- `src/lib/turbo/codex-agent-model.ts` — `CodexAgentModel` с протоколом сериализации.
- `src/lib/turbo/agent-definition.ts` — `createTurboAgent`, `runTurboAgent`, `pickAccepted`, условия остановки.
- `src/lib/turbo/start.ts` — `startTurbo(input, deps)`.
- `src/lib/turbo/start-deps.ts` — боевые зависимости `startTurbo` (только для публичного сервера).
- Тесты: `turbo-failure`, `turbo-size`, `turbo-preview`, `turbo-ops`, `turbo-codex-agent-model`, `turbo-agent-definition`, `turbo-steps`, `turbo-workflow`, `turbo-start` в `src/lib/__tests__/`, помощник `src/lib/__tests__/helpers/turbo-fakes.ts`.

Изменить: `package.json`, `bun.lock`, `bunfig.toml`, `.gitignore`, `tsconfig.json`, `vercel.json`, `src/server.ts`, `src/api/generate.ts`, `src/components/Generate.tsx`, `src/lib/generations.ts`, `src/lib/turbo/constants.ts`, `src/lib/turbo/agent.ts`, `src/lib/__tests__/turbo-agent.test.ts`, `scripts/eval-turbo.ts`, `AGENTS.md`, `README.md`, спека.

Удалить (Задача 9): `src/lib/turbo/tools.ts`, `src/lib/turbo/service.ts`, `src/lib/turbo/runtime.ts`, `src/lib/__tests__/turbo-service.test.ts`, `src/api/workflow-ping.ts`.

Порядок: до Задачи 9 старый код (`runTurbo`, `generateTurbo`) остаётся рабочим, поэтому после каждой задачи проекту нечего ломаться.

---

### Task 1: Зависимости и каркас Workflow

**Files:**
- Modify: `package.json`, `bun.lock`, `bunfig.toml`, `.gitignore`, `tsconfig.json`, `src/server.ts`
- Create: `workflow-plugin.ts`, `workflows/turbo/index.ts` (временная заглушка, заменяется в Задаче 8)

**Interfaces:**
- Produces: `bun run workflow:build` создаёт `.well-known/workflow/v1/flow.mjs`; в dev-сервере живёт `POST /.well-known/workflow/v1/flow`; `turboWorkflow(input: { id: string; userId: string; prompt: string })` из `workflows/turbo/index.ts`.

- [x] **Step 1: Поднять `ai` до версии, которую требует `@ai-sdk/workflow`**

`@ai-sdk/workflow@2.0.65` зависит от `ai` ровно `7.0.133` (в проекте `7.0.105`): две копии `ai` дали бы несовместимые типы.

Run: `/home/crbsnana/.local/share/reflex/bun/bin/bun add ai@^7.0.133`
Expected: `installed ai@7.0.133`.

Run: `git diff --shortstat bun.lock`
Expected: небольшой дифф; в начале `bun.lock` по-прежнему `"lockfileVersion": 2`.

- [x] **Step 2: Добавить пакеты Workflow**

Run: `/home/crbsnana/.local/share/reflex/bun/bin/bun add --exact workflow@5.1.0 @ai-sdk/workflow@2.0.65 @workflow/serde@4.1.0 @ai-sdk/provider@4.0.25 @swc/core@1.15.3`
Expected: все пять пакетов `installed`. В `package.json` в `dependencies` без `^`.

Run: `git diff --shortstat bun.lock`
Expected: только добавления пакетов; `lockfileVersion` 2.

- [x] **Step 3: Убедиться, что обновление `ai` ничего не сломало**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun test`
Expected: все тесты проходят (на момент начала работы: 248).

- [x] **Step 4: Плагин преобразования кода приложения**

Создать `workflow-plugin.ts`:

```ts
import { transform } from "@swc/core";
import { plugin } from "bun";

/**
 * Преобразование кода приложения для Workflow SDK (режим step): воркфлоу получают
 * идентификатор для `start()`, шаги регистрируются. Схема: «Framework
 * Integrations» из документации Workflow SDK (пример для Bun). Отличия от примера:
 * фильтр не трогает node_modules (onLoad для CommonJS-зависимостей ломает их
 * загрузку: «Missing 'default' export in module»), а `@swc/core` закреплён на
 * 1.15.3 (под эту версию собран плагин SWC).
 */
plugin({
	name: "workflow-transform",
	setup(build) {
		build.onLoad(
			{ filter: /^(?!.*[\\/]node_modules[\\/]).*\.(ts|tsx|js|jsx)$/ },
			async (args) => {
				const source = await Bun.file(args.path).text();
				if (!source.match(/(use step|use workflow)/)) {
					return { contents: source };
				}

				const result = await transform(source, {
					filename: args.path,
					jsc: {
						experimental: {
							plugins: [
								[require.resolve("@workflow/swc-plugin"), { mode: "step" }],
							],
						},
					},
				});

				return { contents: result.code, loader: "ts" };
			},
		);
	},
});
```

- [x] **Step 5: Подключить плагин, игнорирование и сборку**

В `bunfig.toml` первой строкой (до таблиц TOML) добавить `preload`. Файл целиком:

```toml
preload = ["./workflow-plugin.ts"]

[serve.static]
plugins = ["bun-plugin-tailwind"]
env = "BUN_PUBLIC_*"
```

В `.gitignore` в конец добавить:

```
# Workflow SDK: сборка бандлов, локальные данные Local World, кэш SWC
.well-known/workflow/
.workflow-data/
.swc/
```

В `tsconfig.json` заменить `"exclude"` на:

```json
"exclude": [
	"dist",
	"node_modules",
	"api/**/*",
	".well-known",
	".workflow-data",
	".swc",
	".vercel"
]
```

В `package.json` в `scripts` заменить `dev` и `build`, добавить `workflow:build`:

```json
"workflow:build": "workflow build",
"dev": "workflow build && PORT=3000 bun --hot src/server.ts",
"build": "workflow build && bun run build.ts",
```

(`PORT` нужен Local World: он по нему доставляет сообщения очереди в обработчик `flow`, см. `/worlds/local`.)

- [x] **Step 6: Временная заглушка воркфлоу**

Создать `workflows/turbo/index.ts`:

```ts
export interface TurboWorkflowInput {
	id: string;
	userId: string;
	prompt: string;
}

/** Заглушка для проверки сборки; настоящее тело появляется в Задаче 8 */
export async function turboWorkflow(input: TurboWorkflowInput) {
	"use workflow";
	return { ok: true as const, id: input.id };
}
```

- [x] **Step 7: Собрать бандлы**

Run: `bun run workflow:build`
Expected: `✓ Compiled workflows ... (… steps, 1 workflow)` и `Build completed successfully!`.

Run: `ls .well-known/workflow/v1`
Expected: `flow.mjs`, `__step_registrations.mjs`, `webhook.mjs`, `manifest.json`.

- [x] **Step 8: Подключить `flow` к dev-серверу**

В `src/server.ts` перед `const server = serve({` добавить:

```ts
/**
 * Локально обработчик очереди Workflow живёт в этом же сервере (Local World
 * доставляет сообщения на его порт). На Vercel это отдельная закрытая функция,
 * поэтому в продакшене маршрут не монтируется.
 */
async function workflowDevRoutes() {
	if (process.env.NODE_ENV === "production") return {};
	// путь в переменной: tsc не разбирает сгенерированный бандл на мегабайты
	const flowModule = "../.well-known/workflow/v1/flow.mjs";
	try {
		const flow = (await import(flowModule)) as {
			POST: (request: Request) => Promise<Response>;
		};
		return { "/.well-known/workflow/v1/flow": { POST: flow.POST } };
	} catch (error) {
		console.warn(
			"Обработчик Workflow не найден, выполните `bun run workflow:build`:",
			error,
		);
		return {};
	}
}
```

И в `routes` первой строкой добавить `...(await workflowDevRoutes()),`:

```ts
const server = serve({
	routes: {
		...(await workflowDevRoutes()),
		"/api/auth/*": async (req) => authRoutes["/api/auth/*"](req),
```

- [x] **Step 9: Проверить dev-сервер**

Run (в фоне): `bun dev`
Expected в выводе: `Server running at ...`, без предупреждения про отсутствующий обработчик.

Run: `curl -s --noproxy '*' -X POST "http://127.0.0.1:3000/.well-known/workflow/v1/flow?__health"`
Expected: `{"healthy":true,"endpoint":"/.well-known/workflow/v1/flow",...}`.

Остановить сервер: `ss -ltnp | grep 3000` для pid, затем `kill <pid>`.

- [x] **Step 10: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format .`
Expected: `No fixes applied`.

Run: `git add package.json bun.lock bunfig.toml .gitignore tsconfig.json workflow-plugin.ts workflows/turbo/index.ts src/server.ts`

Run: `git commit -m "Каркас Workflow: пакеты, плагин Bun, сборка бандлов, обработчик в dev-сервере" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 2: Размещение обработчика `flow` на Vercel (проверка на preview)

Это ворота плана. Цель: выяснить, какой способ размещения закрытой функции-потребителя очереди работает рядом с `src/server.ts` и пресетом `framework: bun`, и закрепить его. Статус на начало задачи по правилу: «не проверено».

> **Итог выполнения (2026-10-09):** локальная часть сделана (Step 1–5, 8, 9), Step 6–7 (пуш и preview) ждут разрешения владельца. Результат расходится с планом: варианты B и C не прошли или не годятся (B не собирается рядом с пресетом Bun, а пресет не применяет плагин Workflow к коду приложения), выбрана полная собственная сборка в формате Build Output API (`scripts/build-vercel.ts`, `vercel.json` с `framework: null`); триггер очереди в `vercel.json` пишется без поля `consumer`. Подробности и источники: таблица статусов спеки.

**Files:**
- Create: `api/workflow-flow.ts`, `src/api/workflow-ping.ts`
- Modify: `vercel.json`, `src/server.ts`, спека `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`

**Interfaces:**
- Consumes: `turboWorkflow` из Задачи 1, `flow.mjs` из `bun run workflow:build`.
- Produces: рабочие `vercel.json` и функция обработчика; в спеке записан выбранный вариант со статусом «подтверждено» и источником (URL preview, id прогона). Маршрут `GET /api/_workflow-ping` на preview возвращает `{ runId, result }`.

Документы для сверки: `https://workflow-sdk.dev/docs/how-it-works/framework-integrations` (раздел «Vercel queue configuration»), `https://vercel.com/docs/queues/concepts` (раздел «Consumer function security»), `https://vercel.com/docs/functions/runtimes/bun` (разделы «Deploy with the Bun framework preset», «Deploy a Bun server from /api»), `https://vercel.com/docs/services/config-reference`.

- [x] **Step 1: Зафиксировать базовый вывод пресета без изменений**

Run: `vercel build`
Expected: сборка заканчивается, появляется `.vercel/output`.

Run: `cat .vercel/output/config.json`
Expected: маршруты пресета Bun (запомнить содержимое).

Run: `ls .vercel/output/functions`
Expected: функция сайта (одна, на `src/server.ts`).

Run: `cp -r .vercel/output /tmp/claude-1000/-home-crbsnana--------------coding-jb-gen42/4bbd414d-7802-51dd-809c-e5437390df2b/scratchpad/vercel-output-baseline`

- [x] **Step 2: Вариант A (Build Output API, описан в документации Workflow): локальный осмотр**

Run: `bunx workflow build --target vercel-build-output-api`
Expected: в `.vercel/output/functions/.well-known/workflow/v1/flow.func/` лежит `.vc-config.json` с `experimentalTriggers`.

Run: `cat .vercel/output/config.json`
Expected и решающее правило: если после запуска в `config.json` остался только маршрут вебхука, а маршруты пресета пропали (сборщик пишет `config.json` целиком, это видно в `@workflow/builders/dist/vercel-build-output-api.js`), вариант A совместим с пресетом только через ручное слияние; записать статус «A: требует ручной сборки вывода, не выбран» и вернуть вывод пресета командой `rm -rf .vercel/output` и `cp -r <scratchpad>/vercel-output-baseline .vercel/output`. Если пресетные маршруты сохранились, записать «A: подтверждено локально» и перейти к Step 5 с этим вариантом.

- [x] **Step 3: Вариант B (`api/`-функция): создать файлы**

Создать `api/workflow-flow.ts` (по примеру «Deploy a Bun server from /api»: `Bun.serve` вызывается один раз при старте модуля):

```ts
import { POST } from "../.well-known/workflow/v1/flow.mjs";

/**
 * Закрытый потребитель очереди Workflow (триггер в vercel.json). Публичного адреса
 * у функции нет: её вызывает только инфраструктура очередей Vercel.
 */
Bun.serve({
	fetch(request) {
		return POST(request);
	},
});
```

В `vercel.json` в `functions` добавить вторую запись (значения триггера дословно из `getWorkflowQueueTrigger()` пакета `@workflow/builders`, проверено: `{"type":"queue/v2beta","topic":"__wkf_workflow_*","consumer":"default","retryAfterSeconds":5,"initialDelaySeconds":0}`; `maxDuration` 300 — максимум Hobby):

```json
"api/workflow-flow.ts": {
	"maxDuration": 300,
	"experimentalTriggers": [
		{
			"type": "queue/v2beta",
			"topic": "__wkf_workflow_*",
			"consumer": "default",
			"retryAfterSeconds": 5,
			"initialDelaySeconds": 0
		}
	]
}
```

- [x] **Step 4: Вариант B: локальный осмотр**

Run: `bun run workflow:build`
Expected: бандлы собраны.

Run: `vercel build`
Expected: сборка заканчивается.

Run: `ls .vercel/output/functions`
Expected: две функции: сайт и `api/workflow-flow.func`.

Run: `cat .vercel/output/functions/api/workflow-flow.func/.vc-config.json`
Expected: есть `experimentalTriggers` с топиком `__wkf_workflow_*`, `maxDuration` 300, тот же рантайм Bun, что у функции сайта.

Решающее правило: если функция не появилась, рантайм не Bun или триггер потерян, записать «B: опровергнуто локально» с выводом `vercel build` и перейти к варианту C (Step 8); иначе продолжить.

- [x] **Step 5: Временный маршрут проверки на preview**

Создать `src/api/workflow-ping.ts` (работает только на preview, иначе 404; удаляется в Задаче 9):

```ts
import { start } from "workflow/api";
import { turboWorkflow } from "../../workflows/turbo/index";

/** Временная проверка размещения Workflow на preview; удаляется вместе с заглушкой воркфлоу */
export const workflowPingRoutes = {
	"/api/_workflow-ping": {
		GET: async () => {
			if (process.env.VERCEL_ENV !== "preview") {
				return new Response("Not found", { status: 404 });
			}
			const run = await start(turboWorkflow, [
				{ id: "ping", userId: "ping", prompt: "ping" },
			]);
			const result = await run.returnValue;
			return Response.json({ runId: run.runId, result });
		},
	},
};
```

В `src/server.ts` добавить импорт `import { workflowPingRoutes } from "./api/workflow-ping";` и в `routes` строку `...workflowPingRoutes,` после `...(await workflowDevRoutes()),`.

Run: `bun run typecheck`
Expected: без ошибок.

- [ ] **Step 6: Разрешение владельца**

Preview-деплой это внешнее действие. Спросить владельца: «Для проверки размещения нужен пуш ветки `feat/turbo-creative-direction` (preview-деплой через GitHub) или `vercel deploy` без `--prod`. Разрешаете?» Без «да» дальше не идти; временно зафиксировать локальные выводы Step 1–4 в спеке и остановиться.

Закоммитить подготовленные файлы:

Run: `git add api/workflow-flow.ts src/api/workflow-ping.ts vercel.json src/server.ts`

Run: `git commit -m "Размещение обработчика Workflow на Vercel: функция api/workflow-flow и временный маршрут проверки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

- [ ] **Step 7: Проверка на preview (после разрешения)**

Run (одним из способов по разрешению): `git push -u origin feat/turbo-creative-direction` либо `vercel deploy --yes`.
Expected: URL preview-деплоя; сборка зелёная (`vercel inspect <url>` или панель).

В проекте Vercel должны быть включены системные переменные (Settings, Environment Variables, «Enable access to System Environment Variables»), иначе SDK выберет Local World: проверить в панели, при необходимости попросить владельца включить и передеплоить.

Run: `vercel curl /api/_workflow-ping --deployment <preview-url>`
Expected (успех): JSON `{"runId":"wrun_...","result":{"ok":true,"id":"ping"}}` за несколько секунд.

Разбор исходов:
- `start() ... invalid workflow function` значит, прод-рантайм не применил `preload` из `bunfig.toml`. Записать «bunfig: не применяется на Vercel». Остановиться и сообщить владельцу: нужен другой способ преобразования (предобработка `Bun.build` или идентификаторы из манифеста `workflow build -m`), без самовольного выбора.
- Запрос висит и завершается по таймауту: триггер очереди не сработал (прогон остаётся `pending`). Проверить `.vc-config.json` в деплое (`vercel inspect <url> --logs`), топик и права. Записать вывод; если вариант B не работает, перейти к варианту C.
- Успех: записать «B: подтверждено на preview».

Run: `npx workflow inspect runs --backend vercel --project gen42 --team <slug команды из vercel teams ls> --env preview`
Expected: прогон `ping` в статусе `completed`.

- [x] **Step 8: Вариант C (Vercel Services), только если A и B не подошли**

Сверить конфигурацию с `https://vercel.com/docs/services/config-reference` и разделом «Queues with services» на `https://vercel.com/docs/queues/concepts`: перенести настройки сайта (`framework`, `buildCommand`, `outputDirectory`, `functions`) в сервис `site`, добавить сервис `workflow` с функцией-потребителем и триггером, верхнеуровневыми `rewrites` открыть только `site`; уточнить, где живут `crons` и `bunVersion`. Повторить Step 4–7 для этого вида. Если ни один из вариантов не заработал, остановиться и сообщить владельцу выводы по каждому с источниками: запасной путь — двухэтапный запуск без Workflow (спека, раздел 5).

- [x] **Step 9: Закрепить результат в спеке**

В `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md` в таблицу «Источники и статусы» добавить строки по каждому проверенному варианту со статусом и источником (дата, URL preview, id прогона), в разделе «Проверить при реализации» отметить закрытые пункты (размещение, `bunfig` на проде, триггер очереди) и открытые (зависимости `flow.mjs` на проде проверяются в Задаче 11).

Run: `git add docs/superpowers/specs/2026-10-08-turbo-workflow-design.md vercel.json api`

Run: `git commit -m "Спека Workflow: результаты проверки размещения на preview" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 3: Константы, размер, классификация сбоев

**Files:**
- Modify: `src/lib/turbo/constants.ts`
- Create: `src/lib/turbo/size.ts`, `src/lib/turbo/failure.ts`
- Test: `src/lib/__tests__/turbo-size.test.ts`, `src/lib/__tests__/turbo-failure.test.ts`

**Interfaces:**
- Produces:
  - `constants.ts`: `TURBO_AGENT_MODEL`, `TURBO_MAX_STEPS`, `TURBO_TIMEOUT_MS` (остаётся до Задачи 9), новые `TURBO_AGENT_TIMEOUT_MS = 180_000`, `TURBO_DRAW_TIMEOUT_MS = 280_000`, `TURBO_PREVIEW_SIZE = 1024`, `TURBO_PREVIEW_QUALITY = 80`, `TURBO_MAX_REJECTED_CHECKS = 3`.
  - `size.ts`: `parseImageSize(size: string | null): { width: number; height: number }`.
  - `failure.ts`: `interface TurboFailure { code: TurboErrorCode; message: string; prompt: string | null; inputImages: string[] }`, `toFailure(error: unknown, context?: { prompt?: string | null; inputImages?: string[] }): TurboFailure`, `prefixedMessage(code: TurboErrorCode, text: string): string`, `rethrowModelError(error: unknown): never`, `isAuthFailure(error: unknown): boolean`.

- [x] **Step 1: Failing-тест на `parseImageSize`**

Создать `src/lib/__tests__/turbo-size.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseImageSize } from "../turbo/size";

describe("parseImageSize", () => {
	test("разбирает размер сервера, остальное — квадрат", () => {
		expect(parseImageSize("1024x1536")).toEqual({ width: 1024, height: 1536 });
		expect(parseImageSize(null)).toEqual({ width: 1024, height: 1024 });
		expect(parseImageSize("auto")).toEqual({ width: 1024, height: 1024 });
	});
});
```

- [x] **Step 2: Тест падает**

Run: `bun test src/lib/__tests__/turbo-size.test.ts`
Expected: FAIL, модуль `../turbo/size` не найден.

- [x] **Step 3: Реализовать `size.ts`**

Создать `src/lib/turbo/size.ts`:

```ts
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
```

- [x] **Step 4: Тест проходит**

Run: `bun test src/lib/__tests__/turbo-size.test.ts`
Expected: PASS.

- [x] **Step 5: Константы**

Заменить содержимое `src/lib/turbo/constants.ts`:

```ts
/** Модель агента Турбо в подписке ChatGPT (проверяется кнопкой «Проверить» в админке) */
export const TURBO_AGENT_MODEL = "gpt-6-luna";
/** Верхняя граница ходов агента; обычный прогон — 2–4 раунда */
export const TURBO_MAX_STEPS = 12;
/** Прежний общий бюджет запуска; удаляется вместе с `runTurbo` в Задаче 9 */
export const TURBO_TIMEOUT_MS = 270_000;
/** Бюджет агента: абсолютный дедлайн на вызовы модели внутри воркфлоу (обычно 40–110 с) */
export const TURBO_AGENT_TIMEOUT_MS = 180_000;
/**
 * Бюджет рисования: запрос к Codex обрывается сам раньше, чем платформа убьёт
 * функцию на лимите 300 с (остаётся время на загрузку картинки в хранилище)
 */
export const TURBO_DRAW_TIMEOUT_MS = 280_000;
/** Копия изображения для агента: длинная сторона в пикселях и качество WebP */
export const TURBO_PREVIEW_SIZE = 1024;
export const TURBO_PREVIEW_QUALITY = 80;
/** Сколько отказов проверки generateImage подряд допускается: первый вызов и два исправления */
export const TURBO_MAX_REJECTED_CHECKS = 3;
```

- [x] **Step 6: Failing-тест на классификацию**

Создать `src/lib/__tests__/turbo-failure.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";
import { TurboError } from "../turbo/errors";
import {
	isAuthFailure,
	prefixedMessage,
	rethrowModelError,
	toFailure,
} from "../turbo/failure";

function apiError(statusCode: number) {
	return new APICallError({
		message: "boom",
		url: "https://chatgpt.com/backend-api/codex/responses",
		requestBodyValues: {},
		statusCode,
		isRetryable: false,
	});
}

describe("toFailure", () => {
	test("TurboError сохраняет код и подробности", () => {
		const failure = toFailure(
			new TurboError("generation_rejected", "отказ", {
				details: { prompt: "p", inputImages: ["a/b.png"] },
			}),
		);
		expect(failure).toEqual({
			code: "generation_rejected",
			message: "отказ",
			prompt: "p",
			inputImages: ["a/b.png"],
		});
	});

	test("код в начале сообщения переживает границу шага", () => {
		const failure = toFailure(
			new Error(prefixedMessage("codex_auth_required", "токен умер")),
			{ prompt: "p" },
		);
		expect(failure).toEqual({
			code: "codex_auth_required",
			message: "токен умер",
			prompt: "p",
			inputImages: [],
		});
	});

	test("срок вышел: по имени ошибки и по тексту SDK", () => {
		const byName = Object.assign(new Error("x"), { name: "TimeoutError" });
		expect(toFailure(byName).code).toBe("agent_timeout");
		const byText = new Error("The generation deadline expired.");
		expect(toFailure(byText).code).toBe("agent_timeout");
	});

	test("нарушение toolChoice — agent_no_generation", () => {
		const error = Object.assign(
			new Error(
				"Model response did not contain a tool call even though tool choice was required.",
			),
			{ name: "AI_ToolChoiceViolationError" },
		);
		const failure = toFailure(error);
		expect(failure.code).toBe("agent_no_generation");
		expect(failure.message).toBe("Агент завершил работу, не вызвав generateImage");
	});

	test("401 провайдера — codex_auth_required, 500 — agent_failed", () => {
		expect(toFailure(apiError(401)).code).toBe("codex_auth_required");
		expect(toFailure(apiError(500)).code).toBe("agent_failed");
	});

	test("не ошибка вместо ошибки — agent_failed", () => {
		expect(toFailure("странно")).toMatchObject({
			code: "agent_failed",
			message: "странно",
		});
	});
});

describe("isAuthFailure", () => {
	test("распознаёт 401/403 и коды обновления токена, в том числе в cause", () => {
		expect(isAuthFailure(apiError(403))).toBe(true);
		expect(isAuthFailure({ code: "refresh_failed" })).toBe(true);
		expect(isAuthFailure(new Error("x", { cause: apiError(401) }))).toBe(true);
		expect(isAuthFailure(apiError(429))).toBe(false);
	});
});

describe("rethrowModelError", () => {
	test("вход Codex умер: код едет в тексте ошибки", () => {
		const error = apiError(401);
		expect(() => rethrowModelError(error)).toThrow(
			/^codex_auth_required: boom/,
		);
	});

	test("прочие ошибки пробрасываются как есть", () => {
		const error = apiError(500);
		let thrown: unknown;
		try {
			rethrowModelError(error);
		} catch (caught) {
			thrown = caught;
		}
		expect(thrown).toBe(error);
	});
});
```

- [x] **Step 7: Тест падает**

Run: `bun test src/lib/__tests__/turbo-failure.test.ts`
Expected: FAIL, модуль `../turbo/failure` не найден.

- [x] **Step 8: Реализовать `failure.ts`**

Создать `src/lib/turbo/failure.ts`:

```ts
import { ToolChoiceViolationError } from "ai";
import { TURBO_ERROR_CODES, type TurboErrorCode, TurboError } from "./errors";

/**
 * Сбой запуска Турбо как обычные данные: проходит границы шагов и воркфлоу без
 * потерь. Код едет не в свойствах ошибки (они не переживают границу шага), а в
 * начале текста: «код: текст», как в `generations.error_message`.
 */
export interface TurboFailure {
	code: TurboErrorCode;
	message: string;
	/** Итоговый промпт агента, если он успел его выбрать */
	prompt: string | null;
	inputImages: string[];
}

export interface FailureContext {
	prompt?: string | null;
	inputImages?: string[];
}

const CODE_PREFIX = new RegExp(`^(${TURBO_ERROR_CODES.join("|")}): `);
const NO_GENERATION_MESSAGE = "Агент завершил работу, не вызвав generateImage";

export function prefixedMessage(code: TurboErrorCode, text: string): string {
	return `${code}: ${text}`;
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

export function isAuthFailure(error: unknown): boolean {
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

/** Всё, что пришло из агента, шага или SDK, превращает в сбой с понятным кодом */
export function toFailure(
	error: unknown,
	context: FailureContext = {},
): TurboFailure {
	const prompt = context.prompt ?? null;
	const inputImages = context.inputImages ?? [];
	if (error instanceof TurboError) {
		return {
			code: error.code,
			message: error.message,
			prompt: error.details.prompt ?? prompt,
			inputImages: error.details.inputImages ?? inputImages,
		};
	}
	const base = { prompt, inputImages };
	const message = error instanceof Error ? error.message : String(error);
	const prefixed = CODE_PREFIX.exec(message);
	if (prefixed) {
		return {
			...base,
			code: prefixed[1] as TurboErrorCode,
			message: message.slice(prefixed[0].length),
		};
	}
	const name = (error as { name?: string } | null)?.name;
	if (
		name === "TimeoutError" ||
		name === "AbortError" ||
		/deadline expired/i.test(message)
	) {
		return { ...base, code: "agent_timeout", message };
	}
	// модель ответила без вызова инструмента при toolChoice "required"
	if (
		ToolChoiceViolationError.isInstance(error) ||
		name === "AI_ToolChoiceViolationError"
	) {
		return { ...base, code: "agent_no_generation", message: NO_GENERATION_MESSAGE };
	}
	if (isAuthFailure(error)) {
		return { ...base, code: "codex_auth_required", message };
	}
	return { ...base, code: "agent_failed", message };
}

/**
 * Сбой модели внутри шага: мёртвый вход Codex получает код в тексте ошибки,
 * чтобы воркфлоу узнал его после границы шага; остальное пробрасывается как есть.
 */
export function rethrowModelError(error: unknown): never {
	if (isAuthFailure(error)) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(prefixedMessage("codex_auth_required", message), {
			cause: error,
		});
	}
	throw error;
}
```

- [x] **Step 9: Тесты проходят**

Run: `bun test src/lib/__tests__/turbo-failure.test.ts src/lib/__tests__/turbo-size.test.ts`
Expected: PASS (все).

- [x] **Step 10: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write src/lib/turbo src/lib/__tests__`
Expected: файлы отформатированы.

Run: `git add src/lib/turbo/constants.ts src/lib/turbo/size.ts src/lib/turbo/failure.ts src/lib/__tests__/turbo-size.test.ts src/lib/__tests__/turbo-failure.test.ts`

Run: `git commit -m "Турбо: бюджеты времени, разбор размера и классификация сбоев данными" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 4: Превью, операции и определения инструментов

**Files:**
- Create: `src/lib/turbo/preview.ts`, `src/lib/turbo/ops.ts`, `src/lib/turbo/tool-defs.ts`, `src/lib/__tests__/helpers/turbo-fakes.ts`
- Test: `src/lib/__tests__/turbo-preview.test.ts`, `src/lib/__tests__/turbo-ops.test.ts`

**Interfaces:**
- Consumes: `Library`, `ResolvedImage`, `ReadFileResult`, `ListFolderResult`, `MAX_INPUT_IMAGES` (`src/lib/turbo/library.ts`); `CodexImageError`, `EditImageResult` (`codex-images.ts`); `TurboError`; `toGeneratorQuotes` (`src/lib/prompts/style-hints.ts`); константы Задачи 3.
- Produces:
  - `preview.ts`: `makePreview(bytes: Uint8Array): Promise<{ mediaType: "image/webp"; bytes: Uint8Array }>`.
  - `tool-defs.ts`: `type CheckImageOutput = { ok: true } | { ok: false; retryable: true; error: string }`, `interface TurboToolExecutors { listFolder(input: { path: string }): Promise<ListFolderResult>; readFile(input: { path: string }): Promise<ReadFileResult>; checkImage(input: { prompt: string; images: string[] }): Promise<CheckImageOutput> }`, `createTurboTools(executors)`.
  - `ops.ts`: `type EditFn`, `readForAgent(library, path)`, `checkImageArguments(library, input)`, `drawImage(deps: { library: Library; edit: EditFn }, input: { prompt: string; images: string[]; signal?: AbortSignal }): Promise<{ png: Uint8Array; size: string | null; prompt: string; inputImages: string[] }>` (бросает `TurboError`).
  - `helpers/turbo-fakes.ts`: `TINY_PNG`, `RESULT_PNG`, `usage`, `libraryStorage()`, `toolCalls(...)`, `text(value)`, позднее (Задача 5) `makeRuntime`.

- [x] **Step 1: Помощник для тестов**

Создать `src/lib/__tests__/helpers/turbo-fakes.ts`:

```ts
import type { LibraryStorage } from "../../turbo/library";

/** Настоящий PNG 1×1: его умеет декодировать Bun.Image (превью) */
export const TINY_PNG = new Uint8Array(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64",
	),
);
export const RESULT_PNG = new Uint8Array([9, 9, 9]);

export const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** Библиотека в памяти: папка «пятерка» с картинкой и описаниями */
export function libraryStorage(): LibraryStorage {
	const objects: Record<string, Uint8Array> = {
		"library/пятерка/a.png": TINY_PNG,
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

/** Ответ подставной модели: один или несколько вызовов инструментов */
export function toolCalls(
	...calls: { id: string; name: string; input: unknown }[]
) {
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

/** Ответ подставной модели: обычный текст */
export function text(value: string) {
	return {
		content: [{ type: "text" as const, text: value }],
		finishReason: { unified: "stop" as const, raw: undefined },
		usage,
		warnings: [],
	};
}
```

- [x] **Step 2: Failing-тест на превью**

Создать `src/lib/__tests__/turbo-preview.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { makePreview } from "../turbo/preview";
import { TINY_PNG } from "./helpers/turbo-fakes";

describe("makePreview", () => {
	test("отдаёт WebP", async () => {
		const preview = await makePreview(TINY_PNG);
		expect(preview.mediaType).toBe("image/webp");
		const header = String.fromCharCode(
			...preview.bytes.slice(0, 4),
			...preview.bytes.slice(8, 12),
		);
		expect(header).toBe("RIFFWEBP");
	});
});
```

Run: `bun test src/lib/__tests__/turbo-preview.test.ts`
Expected: FAIL, модуль `../turbo/preview` не найден.

- [x] **Step 3: Реализовать `preview.ts`**

Создать `src/lib/turbo/preview.ts`:

```ts
import { TURBO_PREVIEW_QUALITY, TURBO_PREVIEW_SIZE } from "./constants";

/**
 * Копия изображения для агента: до 1024 пикселей по длинной стороне, WebP (сохраняет
 * прозрачность эмблем). Оригиналы остаются для рисования. Нужен Bun 1.4+ (`Bun.Image`).
 * Замер на картинках библиотеки: 3,2 МБ → 248 КБ, обычно 7–31 КБ.
 */
export async function makePreview(
	bytes: Uint8Array,
): Promise<{ mediaType: "image/webp"; bytes: Uint8Array }> {
	const out = await new Bun.Image(bytes)
		.resize(TURBO_PREVIEW_SIZE, TURBO_PREVIEW_SIZE, {
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: TURBO_PREVIEW_QUALITY })
		.bytes();
	return { mediaType: "image/webp", bytes: out };
}
```

Run: `bun test src/lib/__tests__/turbo-preview.test.ts`
Expected: PASS.

- [x] **Step 4: Определения инструментов**

Создать `src/lib/turbo/tool-defs.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import {
	type ListFolderResult,
	MAX_INPUT_IMAGES,
	type ReadFileResult,
} from "./library";

/**
 * Итог проверки generateImage: рисование идёт после остановки агента отдельным
 * шагом воркфлоу, поэтому «ok: true» значит «принято».
 */
export type CheckImageOutput =
	| { ok: true }
	| { ok: false; retryable: true; error: string };

/** Исполнители инструментов: в воркфлоу это шаги, в скрипте eval обычные функции */
export interface TurboToolExecutors {
	listFolder(input: { path: string }): Promise<ListFolderResult>;
	readFile(input: { path: string }): Promise<ReadFileResult>;
	checkImage(input: {
		prompt: string;
		images: string[];
	}): Promise<CheckImageOutput>;
}

/**
 * Описания и схемы инструментов агента. Исполнитель вызывается только с входом
 * инструмента: SDK передаёт `execute` вторым аргументом всю историю сообщений
 * (с картинками), а шаг сериализует все свои аргументы.
 */
export function createTurboTools(executors: TurboToolExecutors) {
	return {
		listFolder: tool({
			description:
				"Показывает файлы папки библиотеки с типом (изображение или текст). Вход: имя папки из дерева, например «пятерка».",
			inputSchema: z.object({
				path: z.string().describe("Имя папки из дерева библиотеки"),
			}),
			execute: (input) => executors.listFolder(input),
		}),

		readFile: tool({
			description:
				"Читает файл библиотеки. Текст приходит строкой, изображение ты видишь сам. Вход: полный путь «папка/файл».",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Полный путь, например «эмблемы/flag_of_42.png»"),
			}),
			execute: (input) => executors.readFile(input),
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
			description: `Принимает итоговый промпт и выбранные изображения и проверяет аргументы. ok: true — принято, запуск закончен, картинку рисует сервер. ok: false — исправь аргументы по полю error и вызови снова. images — от 0 до ${MAX_INPUT_IMAGES} путей «папка/файл»; порядок задаёт номера Image 1…N в промпте.`,
			inputSchema: z.object({
				prompt: z.string().describe("Готовый промпт на английском"),
				images: z
					.array(z.string())
					.describe("Пути входных изображений, пустой массив — без них"),
			}),
			execute: (input) => executors.checkImage(input),
		}),
	};
}
```

- [x] **Step 5: Failing-тест на операции**

Создать `src/lib/__tests__/turbo-ops.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import { CodexImageError } from "../turbo/codex-images";
import { Library } from "../turbo/library";
import {
	checkImageArguments,
	drawImage,
	type EditFn,
	readForAgent,
} from "../turbo/ops";
import { libraryStorage, RESULT_PNG } from "./helpers/turbo-fakes";

function setup(edit?: EditFn) {
	const library = new Library(libraryStorage());
	const editMock = mock<EditFn>(
		edit ??
			(async () => ({ png: RESULT_PNG, size: "1024x1536", quality: "medium" })),
	);
	return { library, edit: editMock };
}

describe("readForAgent", () => {
	test("изображение отдаётся уменьшенным WebP", async () => {
		const { library } = setup();
		const result = await readForAgent(library, "пятерка/a.png");
		expect(result).toMatchObject({
			ok: true,
			kind: "image",
			path: "пятерка/a.png",
			mediaType: "image/webp",
		});
		if (result.ok && result.kind === "image") {
			const bytes = Buffer.from(result.base64, "base64");
			expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
		}
	});

	test("текст отдаётся как есть, неверный путь — ошибка", async () => {
		const { library } = setup();
		expect(await readForAgent(library, "пятерка/описания.txt")).toMatchObject({
			ok: true,
			kind: "text",
			text: "a.png — первая",
		});
		expect(await readForAgent(library, "пятерка/нет.png")).toMatchObject({
			ok: false,
		});
	});
});

describe("checkImageArguments", () => {
	test("пустой промпт и неизвестный путь отклоняются с retryable", async () => {
		const { library } = setup();
		expect(
			await checkImageArguments(library, { prompt: "  ", images: [] }),
		).toEqual({ ok: false, retryable: true, error: "Пустой промпт" });
		const unknown = await checkImageArguments(library, {
			prompt: "x",
			images: ["пятерка/нет.png"],
		});
		expect(unknown).toMatchObject({ ok: false, retryable: true });
	});

	test("верные аргументы, в том числе без изображений, принимаются", async () => {
		const { library } = setup();
		expect(
			await checkImageArguments(library, { prompt: "x", images: [] }),
		).toEqual({ ok: true });
		expect(
			await checkImageArguments(library, {
				prompt: "x",
				images: ["пятерка/a.png"],
			}),
		).toEqual({ ok: true });
	});
});

describe("drawImage", () => {
	test("успех: ёлочки уходят генератору прямыми кавычками", async () => {
		const { library, edit } = setup();
		const drawn = await drawImage(
			{ library, edit },
			{
				prompt: "A pug holds a poster with the exact text «СЛАВА 42»",
				images: ["пятерка/a.png"],
			},
		);
		const expected = 'A pug holds a poster with the exact text "СЛАВА 42"';
		expect(edit.mock.calls[0]![0].prompt).toBe(expected);
		expect(drawn).toEqual({
			png: RESULT_PNG,
			size: "1024x1536",
			prompt: expected,
			inputImages: ["пятерка/a.png"],
		});
	});

	test("401 Codex Images — codex_auth_required, подробности сохранены", async () => {
		const { library, edit } = setup(async () => {
			throw new CodexImageError("Codex Images ответил 401", 401);
		});
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: ["пятерка/a.png"] },
		).catch((e) => e);
		expect(error.code).toBe("codex_auth_required");
		expect(error.details).toEqual({
			prompt: "x",
			inputImages: ["пятерка/a.png"],
		});
	});

	test("отказ Codex — generation_rejected", async () => {
		const { library, edit } = setup(async () => {
			throw new CodexImageError("Codex Images ответил 400: policy", 400);
		});
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: [] },
		).catch((e) => e);
		expect(error.code).toBe("generation_rejected");
	});

	test("срок вышел во время рисования — agent_timeout, а не generation_rejected", async () => {
		const { library, edit } = setup(async () => {
			throw new DOMException("aborted", "AbortError");
		});
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: [], signal: AbortSignal.abort() },
		).catch((e) => e);
		expect(error.code).toBe("agent_timeout");
	});

	test("неизвестный путь — generation_rejected, генератор не вызывается", async () => {
		const { library, edit } = setup();
		const error = await drawImage(
			{ library, edit },
			{ prompt: "x", images: ["пятерка/нет.png"] },
		).catch((e) => e);
		expect(error.code).toBe("generation_rejected");
		expect(edit).not.toHaveBeenCalled();
	});
});
```

Run: `bun test src/lib/__tests__/turbo-ops.test.ts`
Expected: FAIL, модуль `../turbo/ops` не найден.

- [x] **Step 6: Реализовать `ops.ts`**

Создать `src/lib/turbo/ops.ts`:

```ts
import { toGeneratorQuotes } from "../prompts/style-hints";
import { CodexImageError, type EditImageResult } from "./codex-images";
import { TurboError } from "./errors";
import type { Library, ReadFileResult, ResolvedImage } from "./library";
import { makePreview } from "./preview";
import type { CheckImageOutput } from "./tool-defs";

export type EditFn = (params: {
	prompt: string;
	images: ResolvedImage[];
	signal?: AbortSignal;
}) => Promise<EditImageResult>;

/** Чтение файла для агента: изображения приходят уменьшенными копиями */
export async function readForAgent(
	library: Library,
	path: string,
): Promise<ReadFileResult> {
	const result = await library.readFile(path);
	if (!result.ok || result.kind !== "image") return result;
	const preview = await makePreview(
		new Uint8Array(Buffer.from(result.base64, "base64")),
	);
	return {
		...result,
		mediaType: preview.mediaType,
		base64: Buffer.from(preview.bytes).toString("base64"),
	};
}

/** Проверка аргументов generateImage: ничего не рисует, ошибку возвращает агенту */
export async function checkImageArguments(
	library: Library,
	input: { prompt: string; images: string[] },
): Promise<CheckImageOutput> {
	if (input.prompt.trim().length === 0) {
		return { ok: false, retryable: true, error: "Пустой промпт" };
	}
	const resolved = await library.resolveImages(input.images);
	if (!resolved.ok) {
		return { ok: false, retryable: true, error: resolved.error };
	}
	return { ok: true };
}

export interface DrawnImage {
	png: Uint8Array;
	/** Размер, который выбрал сервер (например «1024x1536») */
	size: string | null;
	/** Промпт, ушедший генератору (с прямыми кавычками) */
	prompt: string;
	inputImages: string[];
}

/** Рисование по выбранным путям (оригиналы из библиотеки); сбой — TurboError с кодом */
export async function drawImage(
	deps: { library: Library; edit: EditFn },
	input: { prompt: string; images: string[]; signal?: AbortSignal },
): Promise<DrawnImage> {
	const resolved = await deps.library.resolveImages(input.images);
	if (!resolved.ok) {
		throw new TurboError("generation_rejected", resolved.error, {
			details: { prompt: input.prompt, inputImages: input.images },
		});
	}
	const inputImages = resolved.images.map((image) => image.path);
	// ёлочки и «умные» кавычки генератор рисует буквально: к нему промпт уходит с
	// прямыми кавычками, как и в обычном обогащении
	const finalPrompt = toGeneratorQuotes(input.prompt);
	try {
		const result = await deps.edit({
			prompt: finalPrompt,
			images: resolved.images,
			...(input.signal ? { signal: input.signal } : {}),
		});
		return {
			png: result.png,
			size: result.size,
			prompt: finalPrompt,
			inputImages,
		};
	} catch (error) {
		const unauthorized =
			error instanceof CodexImageError &&
			(error.status === 401 || error.status === 403);
		// сигнал оборвал запрос к Codex Images: это срок рисования, а не отказ
		// генератора (editImage пробрасывает AbortError как есть)
		const timedOut =
			Boolean(input.signal?.aborted) && !(error instanceof CodexImageError);
		throw new TurboError(
			timedOut
				? "agent_timeout"
				: unauthorized
					? "codex_auth_required"
					: "generation_rejected",
			error instanceof Error ? error.message : String(error),
			{
				cause: error,
				details: { prompt: input.prompt, inputImages },
			},
		);
	}
}
```

- [x] **Step 7: Тесты проходят**

Run: `bun test src/lib/__tests__/turbo-ops.test.ts src/lib/__tests__/turbo-preview.test.ts`
Expected: PASS (все).

- [x] **Step 8: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write src/lib/turbo src/lib/__tests__`
Expected: файлы отформатированы.

Run: `git add src/lib/turbo/preview.ts src/lib/turbo/ops.ts src/lib/turbo/tool-defs.ts src/lib/__tests__/helpers/turbo-fakes.ts src/lib/__tests__/turbo-preview.test.ts src/lib/__tests__/turbo-ops.test.ts`

Run: `git commit -m "Турбо: превью для агента, операции и общие определения инструментов" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 5: Окружение шагов и модель Codex

**Files:**
- Create: `src/lib/turbo/workflow-runtime.ts`, `src/lib/turbo/codex-agent-model.ts`
- Modify: `src/lib/__tests__/helpers/turbo-fakes.ts` (добавить `makeRuntime`)
- Test: `src/lib/__tests__/turbo-codex-agent-model.test.ts`

**Interfaces:**
- Consumes: `rethrowModelError` (Задача 3), `EditFn` (Задача 4), `Library`, `completeGeneration`/`failGeneration` и их типы параметров (`src/lib/generations.ts`: `CompleteGenerationParams`, `FailGenerationParams`), `recordCodexError`, `codexLanguageModel`, `codexFetch`, `createCodexAuth` (`codex-auth.ts`), `uploadImage`, `listObjects`, `readObject` (`storage.ts`), `editImage` (`codex-images.ts`).
- Produces:
  - `workflow-runtime.ts`: `interface TurboRuntime { library: Library; agentModel(modelId: string): LanguageModelV4; edit: EditFn; storeImage(key: string, png: Uint8Array): Promise<void>; completeGeneration(params: CompleteGenerationParams): Promise<boolean>; failGeneration(params: FailGenerationParams): Promise<boolean>; recordCodexError(message: string): Promise<void>; now(): number }`, `getTurboRuntime(): TurboRuntime`, `setTurboRuntime(runtime: TurboRuntime | null): void`.
  - `codex-agent-model.ts`: `class CodexAgentModel implements LanguageModelV4 { constructor(modelId: string) }` с `WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE`.
  - `helpers/turbo-fakes.ts`: `makeRuntime(overrides?: Partial<TurboRuntime>)`.

Документ для сверки: `https://workflow-sdk.dev/docs/foundations/serialization` (разделы «Custom class serialization», «Instance methods as steps»): серде-методы статические, внутри тела класса, с вычисляемыми именами; методы с Node-зависимостями получают `"use step"`.

- [x] **Step 1: Окружение шагов**

Создать `src/lib/turbo/workflow-runtime.ts`:

```ts
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
	type CompleteGenerationParams,
	completeGeneration,
	type FailGenerationParams,
	failGeneration,
} from "../generations";
import { listObjects, readObject, uploadImage } from "../storage";
import { codexFetch, codexLanguageModel, createCodexAuth, recordCodexError } from "./codex-auth";
import { editImage } from "./codex-images";
import { Library } from "./library";
import type { EditFn } from "./ops";

/**
 * Всё, что шагам воркфлоу нужно от внешнего мира. Шаги берут окружение через
 * `getTurboRuntime()`, тесты подставляют своё через `setTurboRuntime()`.
 */
export interface TurboRuntime {
	/** Библиотека читается из бакета с префиксом library/; кэш дерева живёт минуту */
	library: Library;
	/** Языковая модель агента с входом по подписке */
	agentModel(modelId: string): LanguageModelV4;
	edit: EditFn;
	storeImage(key: string, png: Uint8Array): Promise<void>;
	completeGeneration(params: CompleteGenerationParams): Promise<boolean>;
	failGeneration(params: FailGenerationParams): Promise<boolean>;
	recordCodexError(message: string): Promise<void>;
	now(): number;
}

function createDefaultRuntime(): TurboRuntime {
	return {
		library: new Library({ list: listObjects, read: readObject }),
		// новый менеджер входа на вызов: токены читаются из базы, а не из памяти экземпляра
		agentModel: (modelId) => codexLanguageModel(createCodexAuth(), modelId),
		edit: ({ prompt, images, signal }) =>
			editImage({
				fetch: codexFetch(createCodexAuth()),
				prompt,
				images,
				...(signal ? { signal } : {}),
			}),
		storeImage: async (key, png) => {
			await uploadImage(key, Buffer.from(png), "image/png");
		},
		completeGeneration,
		failGeneration,
		recordCodexError: async (message) => {
			await recordCodexError(message);
		},
		now: Date.now,
	};
}

let override: TurboRuntime | null = null;
let cached: TurboRuntime | null = null;

export function getTurboRuntime(): TurboRuntime {
	if (override) return override;
	cached ??= createDefaultRuntime();
	return cached;
}

/** Для тестов: подмена окружения (null возвращает боевое) */
export function setTurboRuntime(runtime: TurboRuntime | null): void {
	override = runtime;
}
```

Сигнатуры сверены с кодом: `uploadImage(key: string, buffer: Buffer, contentType: string): Promise<void>` в `src/lib/storage.ts` и `recordCodexError(message: string, db?: Sql): Promise<void>` в `codex-auth.ts`.

Run: `bun run typecheck`
Expected: без ошибок.

- [x] **Step 2: Помощник `makeRuntime`**

В `src/lib/__tests__/helpers/turbo-fakes.ts` добавить в начало импорты и в конец функцию:

```ts
import { mock } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { Library, type LibraryStorage } from "../../turbo/library";
import type { EditFn } from "../../turbo/ops";
import type { TurboRuntime } from "../../turbo/workflow-runtime";
```

(`LibraryStorage` уже импортируется типом; объединить в один `import`.)

```ts
/** Окружение шагов для тестов: всё в памяти, вызовы записываются */
export function makeRuntime(overrides: Partial<TurboRuntime> = {}) {
	return {
		library: new Library(libraryStorage()),
		agentModel: () => new MockLanguageModelV4({ doGenerate: [text("пусто")] }),
		edit: mock<EditFn>(async () => ({
			png: RESULT_PNG,
			size: "1024x1536",
			quality: "medium",
		})),
		storeImage: mock(async (_key: string, _png: Uint8Array) => {}),
		completeGeneration: mock(async (_params: unknown) => true),
		failGeneration: mock(async (_params: unknown) => true),
		recordCodexError: mock(async (_message: string) => {}),
		now: () => 1_700_000_000_000,
		...overrides,
	};
}
```

Тип возвращаемого значения оставить выводимым (чтобы в тестах работали `runtime.edit.mock.calls`); при передаче в `setTurboRuntime(runtime)` оно структурно совместимо с `TurboRuntime`.

- [x] **Step 3: Failing-тест на модель**

Создать `src/lib/__tests__/turbo-codex-agent-model.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { CodexAgentModel } from "../turbo/codex-agent-model";
import { setTurboRuntime } from "../turbo/workflow-runtime";
import { makeRuntime, text } from "./helpers/turbo-fakes";

afterEach(() => setTurboRuntime(null));

describe("CodexAgentModel: сериализация", () => {
	test("в журнал уходит только modelId, восстановление создаёт модель заново", () => {
		const model = new CodexAgentModel("gpt-6-luna");
		const data = CodexAgentModel[WORKFLOW_SERIALIZE](model);
		expect(data).toEqual({ modelId: "gpt-6-luna" });
		const restored = CodexAgentModel[WORKFLOW_DESERIALIZE](data);
		expect(restored).toBeInstanceOf(CodexAgentModel);
		expect(restored.modelId).toBe("gpt-6-luna");
		expect(restored.specificationVersion).toBe("v4");
	});
});

describe("CodexAgentModel: вызов", () => {
	test("делегирует настоящей модели из окружения", async () => {
		const inner = new MockLanguageModelV4({ doGenerate: [text("привет")] });
		let requestedModel = "";
		setTurboRuntime(
			makeRuntime({
				agentModel: (modelId) => {
					requestedModel = modelId;
					return inner;
				},
			}),
		);
		const result = await new CodexAgentModel("gpt-6-luna").doGenerate({
			prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		});
		expect(requestedModel).toBe("gpt-6-luna");
		expect(inner.doGenerateCalls).toHaveLength(1);
		expect(result.content).toEqual([{ type: "text", text: "привет" }]);
	});

	test("мёртвый вход: код codex_auth_required едет в тексте ошибки", async () => {
		setTurboRuntime(
			makeRuntime({
				agentModel: () =>
					new MockLanguageModelV4({
						doGenerate: async () => {
							throw new APICallError({
								message: "unauthorized",
								url: "https://chatgpt.com/backend-api/codex/responses",
								requestBodyValues: {},
								statusCode: 401,
								isRetryable: false,
							});
						},
					}),
			}),
		);
		const error = await new CodexAgentModel("gpt-6-luna")
			.doGenerate({ prompt: [] })
			.catch((e) => e);
		expect(error.message).toMatch(/^codex_auth_required: unauthorized/);
	});

	test("прочие сбои пробрасываются без изменений", async () => {
		const failure = new Error("просто сломалось");
		setTurboRuntime(
			makeRuntime({
				agentModel: () =>
					new MockLanguageModelV4({
						doGenerate: async () => {
							throw failure;
						},
					}),
			}),
		);
		const error = await new CodexAgentModel("gpt-6-luna")
			.doGenerate({ prompt: [] })
			.catch((e) => e);
		expect(error).toBe(failure);
	});
});
```

Run: `bun test src/lib/__tests__/turbo-codex-agent-model.test.ts`
Expected: FAIL, модуль `../turbo/codex-agent-model` не найден.

- [x] **Step 4: Реализовать модель**

Создать `src/lib/turbo/codex-agent-model.ts`:

```ts
import type {
	LanguageModelV4,
	LanguageModelV4CallOptions,
} from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import { rethrowModelError } from "./failure";
import { getTurboRuntime } from "./workflow-runtime";

/**
 * Модель агента Турбо для WorkflowAgent. Стандартная сериализация моделей AI SDK
 * теряет несериализуемый `fetch`, а в нём вход по подписке; этот класс пишет в
 * журнал воркфлоу только `modelId`, а настоящую модель создаёт заново внутри шага,
 * читая токены из базы. Методы с `"use step"` не попадают в песочницу воркфлоу
 * (там нет Node), а границу шага проходят данные класса.
 */
export class CodexAgentModel implements LanguageModelV4 {
	readonly specificationVersion = "v4" as const;
	readonly provider = "codex";
	readonly supportedUrls = {};

	constructor(readonly modelId: string) {}

	static [WORKFLOW_SERIALIZE](model: CodexAgentModel) {
		return { modelId: model.modelId };
	}

	static [WORKFLOW_DESERIALIZE](data: { modelId: string }) {
		return new CodexAgentModel(data.modelId);
	}

	async doGenerate(options: LanguageModelV4CallOptions) {
		"use step";
		try {
			return await getTurboRuntime().agentModel(this.modelId).doGenerate(options);
		} catch (error) {
			return rethrowModelError(error);
		}
	}

	async doStream(options: LanguageModelV4CallOptions) {
		"use step";
		try {
			return await getTurboRuntime().agentModel(this.modelId).doStream(options);
		} catch (error) {
			return rethrowModelError(error);
		}
	}
}
```

- [x] **Step 5: Тесты проходят**

Run: `bun test src/lib/__tests__/turbo-codex-agent-model.test.ts`
Expected: PASS (4 теста).

- [x] **Step 6: Проверить соответствие протоколу сериализации**

Run: `bunx workflow validate`
Expected: нет замечаний к `CodexAgentModel` (для классов без Node-импортов в песочнице). Если команда сообщает о Node-импортах в бандле воркфлоу, остановиться, привести вывод и решить с владельцем, не обходя замечание динамическим импортом вне шага (документация: «Do NOT use dynamic imports to work around sandbox restrictions»).

- [x] **Step 7: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write src/lib/turbo src/lib/__tests__`
Expected: файлы отформатированы.

Run: `git add src/lib/turbo/workflow-runtime.ts src/lib/turbo/codex-agent-model.ts src/lib/__tests__/helpers/turbo-fakes.ts src/lib/__tests__/turbo-codex-agent-model.test.ts`

Run: `git commit -m "Турбо: окружение шагов и модель Codex с протоколом сериализации Workflow" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 6: Определение агента

**Files:**
- Create: `src/lib/turbo/agent-definition.ts`
- Test: `src/lib/__tests__/turbo-agent-definition.test.ts`

**Interfaces:**
- Consumes: `createTurboTools`, `TurboToolExecutors` (Задача 4), `CodexAgentModel` (Задача 5), константы (Задача 3).
- Produces: `interface AcceptedImage { prompt: string; images: string[] }`, `pickAccepted(steps): AcceptedImage | null`, `acceptedImage`, `tooManyRejections` (`StopCondition`), `TURBO_STOP_WHEN`, `createTurboAgent(params: { model?: LanguageModel; system: string; executors: TurboToolExecutors })`, `type TurboAgent`, `runTurboAgent(agent: TurboAgent, message: string, options?: { timeoutMs?: number }): Promise<{ accepted: AcceptedImage | null; tokens: number | null; toolCalls: { toolName: string; input: unknown }[] }>`.

Документы для сверки: `https://ai-sdk.dev/v7/docs/agents/workflow-agent`, `https://ai-sdk.dev/docs/agents/loop-control` (раздел «Create Custom Conditions»). Проверено опытом: `WorkflowAgent.generate()` работает вне воркфлоу с `MockLanguageModelV4`; `result.steps[].toolCalls[].input`, `toolResults[].output`, `result.totalUsage`.

- [x] **Step 1: Failing-тест**

Создать `src/lib/__tests__/turbo-agent-definition.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import {
	createTurboAgent,
	pickAccepted,
	runTurboAgent,
} from "../turbo/agent-definition";
import { TURBO_MAX_STEPS } from "../turbo/constants";
import { Library } from "../turbo/library";
import { checkImageArguments, readForAgent } from "../turbo/ops";
import type { TurboToolExecutors } from "../turbo/tool-defs";
import { libraryStorage, text, toolCalls } from "./helpers/turbo-fakes";

function setup(steps: ConstructorParameters<typeof MockLanguageModelV4>[0]) {
	const library = new Library(libraryStorage());
	const executors = {
		listFolder: mock(({ path }: { path: string }) => library.listFolder(path)),
		readFile: mock(({ path }: { path: string }) => readForAgent(library, path)),
		checkImage: mock((input: { prompt: string; images: string[] }) =>
			checkImageArguments(library, input),
		),
	} satisfies TurboToolExecutors;
	const model = new MockLanguageModelV4(steps);
	const agent = createTurboAgent({ model, system: "SYSTEM", executors });
	return { model, executors, agent };
}

const good = { prompt: "A pug, Image 1", images: ["пятерка/a.png"] };

describe("runTurboAgent", () => {
	test("успех: параллельные listFolder и readFile, затем generateImage", async () => {
		const { model, executors, agent } = setup({
			doGenerate: [
				toolCalls(
					{ id: "1", name: "listFolder", input: { path: "пятерка" } },
					{ id: "2", name: "readFile", input: { path: "пятерка/описания.txt" } },
				),
				toolCalls({ id: "3", name: "generateImage", input: good }),
			],
		});

		const run = await runTurboAgent(agent, "пятёрка на троне");

		expect(run.accepted).toEqual(good);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(executors.listFolder).toHaveBeenCalledTimes(1);
		expect(executors.readFile).toHaveBeenCalledTimes(1);
		expect(run.toolCalls.map((call) => call.toolName)).toEqual([
			"listFolder",
			"readFile",
			"generateImage",
		]);
		expect(run.tokens).toBe(30);
	});

	test("ошибка аргументов — агент исправляется и получает принятие", async () => {
		const { model, agent } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/нет.png"] },
				}),
				toolCalls({ id: "2", name: "generateImage", input: good }),
			],
		});

		const run = await runTurboAgent(agent, "пятёрка");

		expect(run.accepted).toEqual(good);
		expect(model.doGenerateCalls).toHaveLength(2);
	});

	test("третий отказ проверки подряд останавливает цикл без принятия", async () => {
		const bad = toolCalls({
			id: "1",
			name: "generateImage",
			input: { prompt: "x", images: ["пятерка/нет.png"] },
		});
		const { model, agent } = setup({ doGenerate: async () => bad });

		const run = await runTurboAgent(agent, "кот");

		expect(run.accepted).toBeNull();
		expect(model.doGenerateCalls).toHaveLength(3);
	});

	test("лимит ходов без принятия", async () => {
		const loop = toolCalls({
			id: "1",
			name: "listFolder",
			input: { path: "пятерка" },
		});
		const { model, agent } = setup({ doGenerate: async () => loop });

		const run = await runTurboAgent(agent, "кот");

		expect(run.accepted).toBeNull();
		expect(model.doGenerateCalls).toHaveLength(TURBO_MAX_STEPS);
	});

	test("два generateImage в одном ходу: берётся первый принятый", async () => {
		const second = { prompt: "Other, Image 1", images: [] };
		const { agent } = setup({
			doGenerate: [
				toolCalls(
					{ id: "1", name: "generateImage", input: good },
					{ id: "2", name: "generateImage", input: second },
				),
			],
		});

		const run = await runTurboAgent(agent, "кот");

		expect(run.accepted).toEqual(good);
	});

	test("ответ текстом без generateImage — нарушение toolChoice", async () => {
		const { agent } = setup({ doGenerate: [text("Готово")] });
		const error = await runTurboAgent(agent, "кот").catch((e) => e);
		expect(error.name).toBe("AI_ToolChoiceViolationError");
	});
});

describe("pickAccepted", () => {
	test("без принятых вызовов — null", () => {
		expect(pickAccepted([])).toBeNull();
		expect(
			pickAccepted([
				{
					toolCalls: [
						{ toolCallId: "1", toolName: "generateImage", input: good },
					],
					toolResults: [
						{
							toolCallId: "1",
							toolName: "generateImage",
							output: { ok: false, retryable: true, error: "x" },
						},
					],
				},
			]),
		).toBeNull();
	});
});
```

Run: `bun test src/lib/__tests__/turbo-agent-definition.test.ts`
Expected: FAIL, модуль `../turbo/agent-definition` не найден.

- [x] **Step 2: Реализовать определение агента**

Создать `src/lib/turbo/agent-definition.ts`:

```ts
import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, type LanguageModel, type StopCondition } from "ai";
import { CodexAgentModel } from "./codex-agent-model";
import {
	TURBO_AGENT_MODEL,
	TURBO_AGENT_TIMEOUT_MS,
	TURBO_MAX_REJECTED_CHECKS,
	TURBO_MAX_STEPS,
} from "./constants";
import { createTurboTools, type TurboToolExecutors } from "./tool-defs";

/** Что агент принял к рисованию: итоговый промпт и пути изображений */
export interface AcceptedImage {
	prompt: string;
	images: string[];
}

type TurboTools = ReturnType<typeof createTurboTools>;

/** Минимум от шага цикла, который нужен условиям остановки и разбору итога */
interface StepLike {
	toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
	toolResults: { toolCallId: string; toolName: string; output: unknown }[];
}

function outputOk(output: unknown): boolean | undefined {
	return (output as { ok?: boolean } | null)?.ok;
}

/** Первый принятый вызов generateImage в порядке выполнения */
export function pickAccepted(steps: readonly StepLike[]): AcceptedImage | null {
	for (const step of steps) {
		for (const result of step.toolResults) {
			if (result.toolName !== "generateImage" || outputOk(result.output) !== true) {
				continue;
			}
			const call = step.toolCalls.find(
				(candidate) => candidate.toolCallId === result.toolCallId,
			);
			const input = call?.input as
				| { prompt?: unknown; images?: unknown }
				| undefined;
			if (typeof input?.prompt === "string" && Array.isArray(input.images)) {
				return { prompt: input.prompt, images: input.images.map(String) };
			}
		}
	}
	return null;
}

function countRejected(steps: readonly StepLike[]): number {
	return steps
		.flatMap((step) => step.toolResults)
		.filter(
			(result) =>
				result.toolName === "generateImage" && outputOk(result.output) === false,
		).length;
}

/** Остановка сразу после принятия generateImage: картинку рисует следующий шаг воркфлоу */
export const acceptedImage: StopCondition<TurboTools> = ({ steps }) =>
	pickAccepted(steps) !== null;

/** Агент трижды подряд не справился с аргументами: дальше крутить цикл бессмысленно */
export const tooManyRejections: StopCondition<TurboTools> = ({ steps }) =>
	countRejected(steps) >= TURBO_MAX_REJECTED_CHECKS;

export const TURBO_STOP_WHEN = [
	acceptedImage,
	tooManyRejections,
	isStepCount(TURBO_MAX_STEPS),
];

/**
 * Единое определение агента Турбо: его используют и воркфлоу (исполнители это
 * шаги), и скрипт eval (обычные функции).
 */
export function createTurboAgent(params: {
	model?: LanguageModel;
	system: string;
	executors: TurboToolExecutors;
}) {
	return new WorkflowAgent({
		model: params.model ?? new CodexAgentModel(TURBO_AGENT_MODEL),
		instructions: params.system,
		tools: createTurboTools(params.executors),
		reasoning: "high",
		// агент либо вызывает инструмент, либо заканчивает; ответа текстом без
		// generateImage не бывает: нарушение toolChoice приходит ошибкой
		toolChoice: "required",
	});
}

export type TurboAgent = ReturnType<typeof createTurboAgent>;

export interface TurboAgentRun {
	accepted: AcceptedImage | null;
	/** Вход плюс выход всех вызовов модели; null, если провайдер не сообщил */
	tokens: number | null;
	/** Вызовы инструментов по шагам: видно, какие папки и изображения открывал агент */
	toolCalls: { toolName: string; input: unknown }[];
}

export async function runTurboAgent(
	agent: TurboAgent,
	message: string,
	options: { timeoutMs?: number } = {},
): Promise<TurboAgentRun> {
	const result = await agent.generate({
		prompt: message,
		stopWhen: TURBO_STOP_WHEN,
		timeout: options.timeoutMs ?? TURBO_AGENT_TIMEOUT_MS,
	});
	const { inputTokens, outputTokens } = result.totalUsage;
	return {
		accepted: pickAccepted(result.steps),
		tokens:
			inputTokens === undefined && outputTokens === undefined
				? null
				: (inputTokens ?? 0) + (outputTokens ?? 0),
		toolCalls: result.steps.flatMap((step) =>
			step.toolCalls.map(({ toolName, input }) => ({ toolName, input })),
		),
	};
}
```

- [x] **Step 3: Тесты проходят**

Run: `bun test src/lib/__tests__/turbo-agent-definition.test.ts`
Expected: PASS (7 тестов). Если типы `StopCondition` или `generate({ timeout })` не сходятся, свериться с `node_modules/@ai-sdk/workflow/src/workflow-agent.ts` (`WorkflowAgentGenerateOptions`) и поправить код, не ослабляя `strict`.

- [x] **Step 4: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write src/lib/turbo src/lib/__tests__`
Expected: файлы отформатированы.

Run: `git add src/lib/turbo/agent-definition.ts src/lib/__tests__/turbo-agent-definition.test.ts`

Run: `git commit -m "Турбо: единое определение агента на WorkflowAgent и условия остановки" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 7: Шаги воркфлоу

**Files:**
- Create: `workflows/turbo/steps.ts`
- Test: `src/lib/__tests__/turbo-steps.test.ts`

**Interfaces:**
- Consumes: `getTurboRuntime` (Задача 5), `readForAgent`, `checkImageArguments`, `drawImage` (Задача 4), `toFailure`, `TurboFailure` (Задача 3), `parseImageSize`, `buildAgentMessage`, `systemVersionOf` (`src/lib/turbo/agent.ts`), `buildTurboSystem` (`src/lib/prompts/turbo.system.ts`), `TurboError`.
- Produces (все аргументы и результаты сериализуемы):
  - `prepareStep(input: { prompt: string }): Promise<{ system: string; message: string; systemVersion: string }>`
  - `listFolderStep(input: { path: string }): Promise<ListFolderResult>`
  - `readFileStep(input: { path: string }): Promise<ReadFileResult>`
  - `checkImageStep(input: { prompt: string; images: string[] }): Promise<CheckImageOutput>`
  - `drawStep(input: { userId: string; prompt: string; images: string[] }): Promise<DrawStepResult>` где `DrawStepResult = { ok: true; key: string; size: string | null; prompt: string; inputImages: string[] } | { ok: false; failure: TurboFailure }`, `drawStep.maxRetries = 0`
  - `completeStep(input: CompleteStepInput): Promise<void>` где `CompleteStepInput = { id: string; enhancedPrompt: string; imageKey: string; size: string | null; inputImages: string[]; tokens: number | null; durationMs: number; systemVersion: string }`
  - `failStep(input: { id: string; failure: TurboFailure; durationMs: number }): Promise<void>`

Документы для сверки: `https://workflow-sdk.dev/docs/foundations/workflows-and-steps` (шаги: полный доступ к рантайму, повторы по умолчанию 3), `https://workflow-sdk.dev/docs/foundations/errors-and-retries` (`fn.maxRetries = 0`). Проверено опытом: в `bun test` корневой `preload` не применяется, поэтому шаги вызываются как обычные функции.

- [x] **Step 1: Failing-тест**

Создать `src/lib/__tests__/turbo-steps.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { describeGenerationError } from "../generation-error";
import { CodexImageError } from "../turbo/codex-images";
import { setTurboRuntime } from "../turbo/workflow-runtime";
import {
	checkImageStep,
	completeStep,
	drawStep,
	failStep,
	listFolderStep,
	prepareStep,
	readFileStep,
} from "../../../workflows/turbo/steps";
import { makeRuntime, RESULT_PNG } from "./helpers/turbo-fakes";

beforeEach(() => {
	// шаги намеренно логируют сбои; в выводе тестов они не нужны
	spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setTurboRuntime(null));

describe("шаги чтения", () => {
	test("prepareStep собирает инструкцию с деревом библиотеки и сообщение агенту", async () => {
		setTurboRuntime(makeRuntime());
		const prepared = await prepareStep({ prompt: "пятёрка на троне" });
		expect(prepared.system).toContain("пятерка/");
		expect(prepared.message).toContain("пятёрка на троне");
		expect(prepared.systemVersion).toMatch(/^[0-9a-f]{16}$/);
	});

	test("listFolderStep, readFileStep, checkImageStep работают через библиотеку", async () => {
		setTurboRuntime(makeRuntime());
		expect(await listFolderStep({ path: "пятерка" })).toMatchObject({
			ok: true,
			path: "пятерка",
		});
		expect(await readFileStep({ path: "пятерка/a.png" })).toMatchObject({
			ok: true,
			mediaType: "image/webp",
		});
		expect(
			await checkImageStep({ prompt: "x", images: ["пятерка/нет.png"] }),
		).toMatchObject({ ok: false, retryable: true });
	});
});

describe("drawStep", () => {
	test("без повторов: платформа не должна рисовать дважды", () => {
		expect(drawStep.maxRetries).toBe(0);
	});

	test("успех: картинка в хранилище, наружу только ключ", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		const result = await drawStep({
			userId: "u1",
			prompt: "A pug, Image 1",
			images: ["пятерка/a.png"],
		});
		expect(result).toEqual({
			ok: true,
			key: "generations/u1/1700000000000.png",
			size: "1024x1536",
			prompt: "A pug, Image 1",
			inputImages: ["пятерка/a.png"],
		});
		expect(runtime.storeImage).toHaveBeenCalledWith(
			"generations/u1/1700000000000.png",
			RESULT_PNG,
		);
	});

	test("отказ Codex возвращается данными, а не бросается", async () => {
		setTurboRuntime(
			makeRuntime({
				edit: async () => {
					throw new CodexImageError("Codex Images ответил 400: policy", 400);
				},
			}),
		);
		const result = await drawStep({
			userId: "u1",
			prompt: "x",
			images: ["пятерка/a.png"],
		});
		expect(result).toMatchObject({
			ok: false,
			failure: {
				code: "generation_rejected",
				prompt: "x",
				inputImages: ["пятерка/a.png"],
			},
		});
	});

	test("401 Codex Images — codex_auth_required", async () => {
		setTurboRuntime(
			makeRuntime({
				edit: async () => {
					throw new CodexImageError("Codex Images ответил 401", 401);
				},
			}),
		);
		const result = await drawStep({ userId: "u1", prompt: "x", images: [] });
		expect(result).toMatchObject({
			ok: false,
			failure: { code: "codex_auth_required" },
		});
	});

	test("сбой хранилища после рисования — agent_failed с промптом", async () => {
		setTurboRuntime(
			makeRuntime({
				storeImage: async () => {
					throw new Error("S3 недоступен");
				},
			}),
		);
		const result = await drawStep({ userId: "u1", prompt: "x", images: [] });
		expect(result).toMatchObject({
			ok: false,
			failure: { code: "agent_failed", prompt: "x" },
		});
	});
});

describe("completeStep", () => {
	test("пишет результат в историю", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		await completeStep({
			id: "gen-1",
			enhancedPrompt: "A pug, Image 1",
			imageKey: "generations/u1/1.png",
			size: "1024x1536",
			inputImages: ["пятерка/a.png"],
			tokens: 30,
			durationMs: 90_000,
			systemVersion: "abcdef0123456789",
		});
		expect(runtime.completeGeneration).toHaveBeenCalledWith({
			id: "gen-1",
			imageKey: "generations/u1/1.png",
			seed: null,
			width: 1024,
			height: 1536,
			enhancedPrompt: "A pug, Image 1",
			durationMs: 90_000,
			llmModel: "gpt-6-luna",
			llmTokens: 30,
			enhanceMs: 90_000,
			styleVersion: "abcdef0123456789",
			inputImages: ["пятерка/a.png"],
		});
	});
});

describe("failStep", () => {
	const failure = {
		code: "generation_rejected" as const,
		message: "policy",
		prompt: "A pug",
		inputImages: ["пятерка/a.png"],
	};

	test("закрывает строку с возвратом, пишет код и подробности", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		await failStep({ id: "gen-1", failure, durationMs: 5_000 });
		const params = runtime.failGeneration.mock.calls[0]![0] as {
			id: string;
			error: unknown;
			enhancedPrompt: string | null;
			inputImages: string[];
			durationMs: number;
			llmModel: string;
		};
		expect(params.id).toBe("gen-1");
		expect(describeGenerationError(params.error)).toBe(
			"generation_rejected: policy",
		);
		expect(params.enhancedPrompt).toBe("A pug");
		expect(params.inputImages).toEqual(["пятерка/a.png"]);
		expect(params.durationMs).toBe(5_000);
		expect(params.llmModel).toBe("gpt-6-luna");
		expect(runtime.recordCodexError).not.toHaveBeenCalled();
	});

	test("умерший вход Codex помечается для админки", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		await failStep({
			id: "gen-1",
			failure: { ...failure, code: "codex_auth_required", message: "токен" },
			durationMs: 1,
		});
		expect(runtime.recordCodexError).toHaveBeenCalledWith(
			"codex_auth_required: токен",
		);
	});

	test("сбой пометки входа не ломает шаг", async () => {
		const runtime = makeRuntime({
			recordCodexError: async () => {
				throw new Error("база недоступна");
			},
		});
		setTurboRuntime(runtime);
		await failStep({
			id: "gen-1",
			failure: { ...failure, code: "codex_auth_required" },
			durationMs: 1,
		});
		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
	});
});
```

Run: `bun test src/lib/__tests__/turbo-steps.test.ts`
Expected: FAIL, модуль `workflows/turbo/steps` не найден.

- [x] **Step 2: Реализовать шаги**

Создать `workflows/turbo/steps.ts`:

```ts
import { buildTurboSystem } from "../../src/lib/prompts/turbo.system";
import { buildAgentMessage, systemVersionOf } from "../../src/lib/turbo/agent";
import {
	TURBO_AGENT_MODEL,
	TURBO_DRAW_TIMEOUT_MS,
} from "../../src/lib/turbo/constants";
import { TurboError } from "../../src/lib/turbo/errors";
import { type TurboFailure, toFailure } from "../../src/lib/turbo/failure";
import type { ListFolderResult, ReadFileResult } from "../../src/lib/turbo/library";
import {
	checkImageArguments,
	drawImage,
	readForAgent,
} from "../../src/lib/turbo/ops";
import { parseImageSize } from "../../src/lib/turbo/size";
import type { CheckImageOutput } from "../../src/lib/turbo/tool-defs";
import { getTurboRuntime } from "../../src/lib/turbo/workflow-runtime";

/**
 * Шаги воркфлоу Турбо: тонкие обёртки над кодом из src/lib/turbo. Каждый шаг
 * выполняется в полном рантайме с отдельным лимитом функции; аргументы и
 * результаты только сериализуемые (строки, числа, простые объекты).
 */

export async function prepareStep(input: { prompt: string }): Promise<{
	system: string;
	message: string;
	systemVersion: string;
}> {
	"use step";
	const tree = await getTurboRuntime().library.describeTree();
	return {
		system: buildTurboSystem(tree),
		message: buildAgentMessage(input.prompt),
		// хеш инструкции без дерева: по нему сравниваются итерации
		systemVersion: systemVersionOf(buildTurboSystem("")),
	};
}

export async function listFolderStep(input: {
	path: string;
}): Promise<ListFolderResult> {
	"use step";
	return getTurboRuntime().library.listFolder(input.path);
}

export async function readFileStep(input: {
	path: string;
}): Promise<ReadFileResult> {
	"use step";
	return readForAgent(getTurboRuntime().library, input.path);
}

export async function checkImageStep(input: {
	prompt: string;
	images: string[];
}): Promise<CheckImageOutput> {
	"use step";
	return checkImageArguments(getTurboRuntime().library, input);
}

export type DrawStepResult =
	| {
			ok: true;
			key: string;
			size: string | null;
			prompt: string;
			inputImages: string[];
	  }
	| { ok: false; failure: TurboFailure };

/**
 * Рисование и сохранение: PNG уходит в хранилище прямо здесь, в журнал воркфлоу
 * попадает только ключ. Без повторов: у Codex Images нет ключа идемпотентности,
 * повтор потратил бы лимит подписки второй раз.
 */
export async function drawStep(input: {
	userId: string;
	prompt: string;
	images: string[];
}): Promise<DrawStepResult> {
	"use step";
	const runtime = getTurboRuntime();
	let drawn: Awaited<ReturnType<typeof drawImage>>;
	try {
		drawn = await drawImage(
			{ library: runtime.library, edit: runtime.edit },
			{
				prompt: input.prompt,
				images: input.images,
				signal: AbortSignal.timeout(TURBO_DRAW_TIMEOUT_MS),
			},
		);
	} catch (error) {
		return {
			ok: false,
			failure: toFailure(error, {
				prompt: input.prompt,
				inputImages: input.images,
			}),
		};
	}
	try {
		const key = `generations/${input.userId}/${runtime.now()}.png`;
		await runtime.storeImage(key, drawn.png);
		return {
			ok: true,
			key,
			size: drawn.size,
			prompt: drawn.prompt,
			inputImages: drawn.inputImages,
		};
	} catch (error) {
		return {
			ok: false,
			failure: toFailure(
				new TurboError(
					"agent_failed",
					`Не удалось сохранить картинку: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: error },
				),
				{ prompt: drawn.prompt, inputImages: drawn.inputImages },
			),
		};
	}
}
drawStep.maxRetries = 0;

export interface CompleteStepInput {
	id: string;
	enhancedPrompt: string;
	imageKey: string;
	size: string | null;
	inputImages: string[];
	tokens: number | null;
	durationMs: number;
	systemVersion: string;
}

export async function completeStep(input: CompleteStepInput): Promise<void> {
	"use step";
	const closed = await getTurboRuntime().completeGeneration({
		id: input.id,
		imageKey: input.imageKey,
		seed: null,
		...parseImageSize(input.size),
		enhancedPrompt: input.enhancedPrompt,
		durationMs: input.durationMs,
		llmModel: TURBO_AGENT_MODEL,
		llmTokens: input.tokens,
		enhanceMs: input.durationMs,
		styleVersion: input.systemVersion,
		inputImages: input.inputImages,
	});
	if (!closed) {
		console.error(
			`Генерация ${input.id} уже закрыта, картинка ${input.imageKey} осталась без записи`,
		);
	}
}

/**
 * Компенсация: закрывает строку и возвращает кредиты одной транзакцией по условию
 * `status = 'running'`, поэтому возврат бывает ровно один раз, даже если шаг
 * повторится.
 */
export async function failStep(input: {
	id: string;
	failure: TurboFailure;
	durationMs: number;
}): Promise<void> {
	"use step";
	const runtime = getTurboRuntime();
	const { failure } = input;
	console.error(`Turbo error (${TURBO_AGENT_MODEL}): ${failure.code}: ${failure.message}`);
	await runtime.failGeneration({
		id: input.id,
		error: new TurboError(failure.code, failure.message),
		enhancedPrompt: failure.prompt,
		durationMs: input.durationMs,
		llmModel: TURBO_AGENT_MODEL,
		inputImages: failure.inputImages,
	});
	if (failure.code === "codex_auth_required") {
		// пометка входа мёртвым скрывает Турбо до «Проверить» или нового входа в админке
		try {
			await runtime.recordCodexError(`${failure.code}: ${failure.message}`);
		} catch (error) {
			console.error("Не удалось пометить вход Codex:", error);
		}
	}
}
```

- [x] **Step 3: Тесты проходят**

Run: `bun test src/lib/__tests__/turbo-steps.test.ts`
Expected: PASS.

- [x] **Step 4: Собрать бандлы и убедиться, что песочница воркфлоу чиста**

Run: `bun run workflow:build`
Expected: сборка без ошибок; в выводе число шагов выросло (добавились шаги из `steps.ts`, пока воркфлоу-заглушка их не вызывает, но шаги регистрируются).

Run: `bunx workflow validate`
Expected: нет замечаний.

- [x] **Step 5: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write workflows src/lib/__tests__`
Expected: файлы отформатированы.

Run: `git add workflows/turbo/steps.ts src/lib/__tests__/turbo-steps.test.ts`

Run: `git commit -m "Турбо: шаги воркфлоу как тонкие обёртки над кодом проекта" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 8: Воркфлоу `turboWorkflow`

**Files:**
- Modify: `workflows/turbo/index.ts` (заменить заглушку)
- Test: `src/lib/__tests__/turbo-workflow.test.ts`

**Interfaces:**
- Consumes: шаги (Задача 7), `createTurboAgent`, `runTurboAgent`, `AcceptedImage` (Задача 6), `toFailure` (Задача 3), `TurboError`.
- Produces: `interface TurboWorkflowInput { id: string; userId: string; prompt: string }`, `turboWorkflow(input): Promise<{ ok: true; imageKey: string }>`; при ошибке перед повторным броском вызывает `failStep`.

Документы для сверки: `https://workflow-sdk.dev/docs/foundations/workflows-and-steps` (воркфлоу детерминирован, шаги вызываются через `await`), `https://workflow-sdk.dev/docs/foundations/errors-and-retries` (раздел «Rolling back failed steps»: компенсация шагом, повторный бросок после неё). Проверено опытом: в `bun test` воркфлоу исполняется как обычная async-функция, шаги как обычные вызовы, поэтому ветки ошибок проверяются юнит-тестами; сериализацию они не проверяют (её закрывает живой прогон в Задаче 11).

- [x] **Step 1: Failing-тест**

Создать `src/lib/__tests__/turbo-workflow.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describeGenerationError } from "../generation-error";
import { CodexImageError } from "../turbo/codex-images";
import { setTurboRuntime } from "../turbo/workflow-runtime";
import { turboWorkflow } from "../../../workflows/turbo/index";
import {
	makeRuntime,
	RESULT_PNG,
	text,
	toolCalls,
} from "./helpers/turbo-fakes";

const INPUT = { id: "gen-1", userId: "u1", prompt: "пятёрка на троне" };
const KEY = "generations/u1/1700000000000.png";
const good = { prompt: "A pug on a throne, Image 1", images: ["пятерка/a.png"] };

function errorCode(runtime: ReturnType<typeof makeRuntime>): string {
	const params = runtime.failGeneration.mock.calls[0]![0] as { error: unknown };
	return describeGenerationError(params.error).split(":")[0]!;
}

beforeEach(() => {
	spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setTurboRuntime(null));

describe("turboWorkflow: успех", () => {
	test("агент, рисование, запись истории; возврата нет", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({ agentModel: () => model });
		setTurboRuntime(runtime);

		const result = await turboWorkflow(INPUT);

		expect(result).toEqual({ ok: true, imageKey: KEY });
		expect(runtime.edit).toHaveBeenCalledTimes(1);
		expect(runtime.storeImage).toHaveBeenCalledWith(KEY, RESULT_PNG);
		expect(runtime.completeGeneration).toHaveBeenCalledTimes(1);
		expect(runtime.completeGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			imageKey: KEY,
			width: 1024,
			height: 1536,
			enhancedPrompt: good.prompt,
			inputImages: ["пятерка/a.png"],
			llmModel: "gpt-6-luna",
			llmTokens: 15,
		});
		expect(runtime.failGeneration).not.toHaveBeenCalled();
	});

	test("ошибка аргументов: агент исправляется, рисование одно", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/нет.png"] },
				}),
				toolCalls({ id: "2", name: "generateImage", input: good }),
			],
		});
		const runtime = makeRuntime({ agentModel: () => model });
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT);

		expect(model.doGenerateCalls).toHaveLength(2);
		expect(runtime.edit).toHaveBeenCalledTimes(1);
	});
});

describe("turboWorkflow: сбои возвращают кредиты", () => {
	test("отказ Codex: шаг fail с кодом и подробностями, запись истории не делается", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({
			agentModel: () => model,
			edit: async () => {
				throw new CodexImageError("Codex Images ответил 400: policy", 400);
			},
		});
		setTurboRuntime(runtime);

		const error = await turboWorkflow(INPUT).catch((e) => e);

		expect(error.code).toBe("generation_rejected");
		expect(errorCode(runtime)).toBe("generation_rejected");
		expect(runtime.failGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			enhancedPrompt: good.prompt,
			inputImages: ["пятерка/a.png"],
		});
		expect(runtime.completeGeneration).not.toHaveBeenCalled();
		expect(runtime.recordCodexError).not.toHaveBeenCalled();
	});

	test("401 Codex Images: вход помечается мёртвым", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({
			agentModel: () => model,
			edit: async () => {
				throw new CodexImageError("Codex Images ответил 401", 401);
			},
		});
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("codex_auth_required");
		expect(runtime.recordCodexError).toHaveBeenCalledTimes(1);
	});

	test("мёртвый вход у модели агента: тот же код и пометка", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({
					doGenerate: async () => {
						throw new APICallError({
							message: "unauthorized",
							url: "https://chatgpt.com/backend-api/codex/responses",
							requestBodyValues: {},
							statusCode: 401,
							isRetryable: false,
						});
					},
				}),
		});
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("codex_auth_required");
		expect(runtime.recordCodexError).toHaveBeenCalledTimes(1);
		expect(runtime.edit).not.toHaveBeenCalled();
	});

	test("обычный сбой модели — agent_failed", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({
					doGenerate: async () => {
						throw new Error("просто сломалось");
					},
				}),
		});
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("agent_failed");
		expect(runtime.recordCodexError).not.toHaveBeenCalled();
	});

	test("агент закончил текстом без generateImage — agent_no_generation", async () => {
		const runtime = makeRuntime({
			agentModel: () => new MockLanguageModelV4({ doGenerate: [text("Готово")] }),
		});
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("agent_no_generation");
	});

	test("три отказа проверки подряд — agent_no_generation, рисования нет", async () => {
		const bad = toolCalls({
			id: "1",
			name: "generateImage",
			input: { prompt: "x", images: ["пятерка/нет.png"] },
		});
		const model = new MockLanguageModelV4({ doGenerate: async () => bad });
		const runtime = makeRuntime({ agentModel: () => model });
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("agent_no_generation");
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(runtime.edit).not.toHaveBeenCalled();
	});

	test("сбой записи истории после рисования тоже возвращает кредиты", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({
			agentModel: () => model,
			completeGeneration: async () => {
				throw new Error("база недоступна");
			},
		});
		setTurboRuntime(runtime);

		await turboWorkflow(INPUT).catch(() => {});

		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
	});
});
```

Run: `bun test src/lib/__tests__/turbo-workflow.test.ts`
Expected: FAIL (заглушка воркфлоу не вызывает агента).

- [x] **Step 2: Реализовать воркфлоу**

Заменить содержимое `workflows/turbo/index.ts`:

```ts
import {
	type AcceptedImage,
	createTurboAgent,
	runTurboAgent,
} from "../../src/lib/turbo/agent-definition";
import { TurboError } from "../../src/lib/turbo/errors";
import { toFailure } from "../../src/lib/turbo/failure";
import {
	checkImageStep,
	completeStep,
	drawStep,
	failStep,
	listFolderStep,
	prepareStep,
	readFileStep,
} from "./steps";

export interface TurboWorkflowInput {
	id: string;
	userId: string;
	prompt: string;
}

/**
 * Запуск Турбо: подготовка, цикл агента (вызовы модели и инструменты это шаги),
 * рисование отдельным шагом, запись результата. Любая ошибка запускает
 * компенсацию (`failStep`: возврат кредитов) и пробрасывается дальше, чтобы
 * прогон записался неуспешным. Код воркфлоу детерминирован: всё, что обращается к
 * внешнему миру, живёт в шагах.
 */
export async function turboWorkflow(
	input: TurboWorkflowInput,
): Promise<{ ok: true; imageKey: string }> {
	"use workflow";
	const startedAt = Date.now();
	let accepted: AcceptedImage | null = null;
	try {
		const prepared = await prepareStep({ prompt: input.prompt });
		const agent = createTurboAgent({
			system: prepared.system,
			executors: {
				listFolder: listFolderStep,
				readFile: readFileStep,
				checkImage: checkImageStep,
			},
		});
		const run = await runTurboAgent(agent, prepared.message);
		accepted = run.accepted;
		if (!accepted) {
			throw new TurboError(
				"agent_no_generation",
				"Агент завершил работу, не вызвав generateImage",
			);
		}

		const drawn = await drawStep({
			userId: input.userId,
			prompt: accepted.prompt,
			images: accepted.images,
		});
		if (!drawn.ok) {
			throw new TurboError(drawn.failure.code, drawn.failure.message, {
				details: {
					prompt: drawn.failure.prompt ?? accepted.prompt,
					inputImages: drawn.failure.inputImages,
				},
			});
		}

		await completeStep({
			id: input.id,
			enhancedPrompt: drawn.prompt,
			imageKey: drawn.key,
			size: drawn.size,
			inputImages: drawn.inputImages,
			tokens: run.tokens,
			durationMs: Date.now() - startedAt,
			systemVersion: prepared.systemVersion,
		});
		return { ok: true, imageKey: drawn.key };
	} catch (error) {
		await failStep({
			id: input.id,
			failure: toFailure(error, {
				prompt: accepted?.prompt ?? null,
				inputImages: accepted?.images ?? [],
			}),
			durationMs: Date.now() - startedAt,
		});
		throw error;
	}
}
```

- [x] **Step 3: Тесты проходят**

Run: `bun test src/lib/__tests__/turbo-workflow.test.ts`
Expected: PASS (8 тестов). Если какой-то тест падает из-за формы ошибки от SDK (например, имя `AI_ToolChoiceViolationError` или текст дедлайна), привести фактическое значение в сообщении об ошибке теста и поправить `toFailure` (Задача 3) вместе с её тестом, а не ослаблять проверку.

- [x] **Step 4: Бандл и песочница**

Run: `bun run workflow:build`
Expected: `Compiled workflows ... 1 workflow` без предупреждений о Node-модулях в бандле воркфлоу.

Run: `bunx workflow validate`
Expected: нет замечаний.

Проверка, что в песочницу воркфлоу не попали тяжёлые модули: прочитать хвост `.well-known/workflow/v1/flow.mjs`, начиная с комментария `// workflows/turbo/index.ts`:

Run: `bun -e 'const s = await Bun.file(".well-known/workflow/v1/flow.mjs").text(); const i = s.lastIndexOf("WORKFLOW_USE_STEP"); console.log(["postgres","node:net","Bun.s3","uploadImage"].map((m) => m + ": " + s.slice(i - 20000).includes(m)).join("\n"))'`
Expected: у каждого маркера `false` (в окне вокруг кода воркфлоу нет базы и хранилища). Если `true`, найти импорт, который тянет модуль в `workflows/turbo/index.ts`, `agent-definition.ts`, `codex-agent-model.ts` или `tool-defs.ts`, и вынести обращение внутрь шага.

- [x] **Step 5: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write workflows src/lib/__tests__`
Expected: файлы отформатированы.

Run: `git add workflows/turbo/index.ts src/lib/__tests__/turbo-workflow.test.ts`

Run: `git commit -m "Турбо: воркфлоу из подготовки, цикла агента, рисования и компенсации" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 9: `startTurbo`, маршрут, интерфейс, замена старого кода

**Files:**
- Create: `src/lib/turbo/start.ts`, `src/lib/turbo/start-deps.ts`
- Modify: `src/api/generate.ts`, `src/components/Generate.tsx`, `src/lib/generations.ts`, `src/lib/turbo/constants.ts`, `src/lib/turbo/agent.ts`, `src/lib/__tests__/turbo-agent.test.ts`, `src/server.ts`, `scripts/eval-turbo.ts`
- Delete: `src/lib/turbo/tools.ts`, `src/lib/turbo/service.ts`, `src/lib/turbo/runtime.ts`, `src/lib/__tests__/turbo-service.test.ts`, `src/api/workflow-ping.ts`
- Test: `src/lib/__tests__/turbo-start.test.ts`

**Interfaces:**
- Consumes: `TURBO_MODEL` (`src/lib/models.ts`), `InsufficientCreditsError` (`src/lib/credits.ts`), `TURBO_PUBLIC_ERROR` (`errors.ts`), `startGeneration`, `chargeGeneration`, `failGeneration` (`generations.ts`), `turboWorkflow` (Задача 8).
- Produces: `interface StartTurboDeps { startRecord(record: { id?: string; userId: string; prompt: string }): Promise<string>; chargeCredits(params: { id: string; userId: string; cost: number }): Promise<void>; startWorkflow(input: { id: string; userId: string; prompt: string }): Promise<void>; failRecord(params: { id: string; error: unknown; durationMs: number }): Promise<void>; now(): number }`, `type StartTurboOutcome`, `startTurbo(input: { userId: string; prompt: string; id?: string }, deps: StartTurboDeps): Promise<StartTurboOutcome>`, `startTurboDeps`.

- [x] **Step 1: Failing-тест на `startTurbo`**

Создать `src/lib/__tests__/turbo-start.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { InsufficientCreditsError } from "../credits";
import { TURBO_PUBLIC_ERROR } from "../turbo/errors";
import { type StartTurboDeps, startTurbo } from "../turbo/start";

function makeDeps(overrides: Partial<StartTurboDeps> = {}) {
	let clock = 1_000;
	const deps = {
		startRecord: mock(async () => "gen-1"),
		chargeCredits: mock(async () => {}),
		startWorkflow: mock(async () => {}),
		failRecord: mock(async () => {}),
		now: () => (clock += 500),
		...overrides,
	};
	return deps as typeof deps & StartTurboDeps;
}

describe("startTurbo", () => {
	// сервис намеренно логирует сбои; в выводе тестов они не нужны
	beforeEach(() => {
		spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		mock.restore();
	});

	test("успех: строка, списание 10, запуск воркфлоу, ответ 202", async () => {
		const deps = makeDeps();

		const outcome = await startTurbo(
			{ userId: "u1", prompt: "пятёрка на троне" },
			deps,
		);

		expect(deps.startRecord).toHaveBeenCalledWith({
			userId: "u1",
			prompt: "пятёрка на троне",
		});
		expect(deps.chargeCredits).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			cost: 10,
		});
		expect(deps.startWorkflow).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			prompt: "пятёрка на троне",
		});
		expect(outcome).toEqual({
			status: 202,
			body: { id: "gen-1", engine: "turbo", cost: 10 },
		});
		expect(deps.failRecord).not.toHaveBeenCalled();
	});

	test("мало кредитов: 402, воркфлоу не запускается, строка закрыта", async () => {
		const deps = makeDeps({
			chargeCredits: mock(async () => {
				throw new InsufficientCreditsError(10, 3);
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome).toEqual({
			status: 402,
			body: { error: "Недостаточно кредитов" },
		});
		expect(deps.startWorkflow).not.toHaveBeenCalled();
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
	});

	test("сбой запуска воркфлоу после списания: возврат и общее сообщение", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
		expect(deps.failRecord.mock.calls[0]![0]).toMatchObject({ id: "gen-1" });
	});

	test("сбой создания строки: закрывать нечего", async () => {
		const deps = makeDeps({
			startRecord: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome.status).toBe(502);
		expect(deps.failRecord).not.toHaveBeenCalled();
		expect(deps.chargeCredits).not.toHaveBeenCalled();
	});

	test("клиентский id уходит в запись генерации", async () => {
		const deps = makeDeps();

		await startTurbo({ userId: "u1", prompt: "x", id: "client-id" }, deps);

		expect(deps.startRecord).toHaveBeenCalledWith({
			id: "client-id",
			userId: "u1",
			prompt: "x",
		});
	});

	test("сбой закрытия строки не подменяет ответ пользователю", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
			failRecord: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome.status).toBe(502);
	});
});
```

Run: `bun test src/lib/__tests__/turbo-start.test.ts`
Expected: FAIL, модуль `../turbo/start` не найден.

- [x] **Step 2: Реализовать `start.ts`**

Создать `src/lib/turbo/start.ts`:

```ts
import { InsufficientCreditsError } from "../credits";
import { TURBO_MODEL } from "../models";
import { TURBO_PUBLIC_ERROR } from "./errors";

export interface StartTurboDeps {
	/** Строка `running` до списания: обновление страницы находит процесс по ней */
	startRecord(record: {
		id?: string;
		userId: string;
		prompt: string;
	}): Promise<string>;
	/** Списание за генерацию; бросает InsufficientCreditsError при нехватке */
	chargeCredits(params: {
		id: string;
		userId: string;
		cost: number;
	}): Promise<void>;
	startWorkflow(input: {
		id: string;
		userId: string;
		prompt: string;
	}): Promise<void>;
	/** Закрывает строку и возвращает кредиты одной транзакцией */
	failRecord(params: {
		id: string;
		error: unknown;
		durationMs: number;
	}): Promise<void>;
	now(): number;
}

export type StartTurboOutcome =
	| {
			status: 202;
			body: { id: string; engine: "turbo"; cost: number };
	  }
	| { status: 402 | 502; body: { error: string } };

async function safely(label: string, action: () => Promise<void>) {
	try {
		await action();
	} catch (error) {
		console.error(`${label}:`, error);
	}
}

/**
 * Принимает запуск Турбо в работу: строка `running`, списание, старт воркфлоу.
 * Картинку делает воркфлоу; страница ждёт её опросом `/api/generations/:id`.
 * Сбой до старта закрывает строку с возвратом кредитов.
 */
export async function startTurbo(
	input: { userId: string; prompt: string; id?: string },
	deps: StartTurboDeps,
): Promise<StartTurboOutcome> {
	const { userId, prompt } = input;
	const cost = TURBO_MODEL.cost;
	const started = deps.now();
	let id = "";

	try {
		id = await deps.startRecord({
			...(input.id ? { id: input.id } : {}),
			userId,
			prompt,
		});
		await deps.chargeCredits({ id, userId, cost });
		await deps.startWorkflow({ id, userId, prompt });
		return { status: 202, body: { id, engine: "turbo", cost } };
	} catch (error) {
		if (id) {
			// запись закрывает строку и возвращает кредиты одной транзакцией; если она не
			// удалась, это сделает ленивое закрытие зависших
			await safely("Не удалось записать неуспешный запуск Турбо", () =>
				deps.failRecord({ id, error, durationMs: deps.now() - started }),
			);
		}
		if (error instanceof InsufficientCreditsError) {
			return { status: 402, body: { error: "Недостаточно кредитов" } };
		}
		console.error("Turbo start error:", error);
		return { status: 502, body: { error: TURBO_PUBLIC_ERROR } };
	}
}
```

Run: `bun test src/lib/__tests__/turbo-start.test.ts`
Expected: PASS (6 тестов).

- [x] **Step 3: Боевые зависимости**

Создать `src/lib/turbo/start-deps.ts`:

```ts
import { start } from "workflow/api";
import { turboWorkflow } from "../../../workflows/turbo/index";
import {
	chargeGeneration,
	failGeneration,
	startGeneration,
} from "../generations";
import { CODEX_IMAGE_MODEL } from "./codex-images";
import { TURBO_AGENT_MODEL } from "./constants";
import type { StartTurboDeps } from "./start";

/** Боевые зависимости запуска Турбо; импортируются только публичным сервером */
export const startTurboDeps: StartTurboDeps = {
	startRecord: (record) =>
		startGeneration({
			...(record.id ? { id: record.id } : {}),
			userId: record.userId,
			prompt: record.prompt,
			engine: "turbo",
			model: CODEX_IMAGE_MODEL,
			width: 1024,
			height: 1024,
			steps: 0,
		}),

	chargeCredits: (params) => chargeGeneration(params),

	startWorkflow: async (input) => {
		await start(turboWorkflow, [input]);
	},

	failRecord: async (params) => {
		await failGeneration({
			id: params.id,
			error: params.error,
			durationMs: params.durationMs,
			llmModel: TURBO_AGENT_MODEL,
		});
	},

	now: Date.now,
};
```

- [x] **Step 4: Маршрут**

В `src/api/generate.ts` заменить две строки импорта:

```ts
import { turboDeps } from "../lib/turbo/runtime";
import { generateTurbo } from "../lib/turbo/service";
```

на:

```ts
import { startTurbo } from "../lib/turbo/start";
import { startTurboDeps } from "../lib/turbo/start-deps";
```

и блок `if (engine === "turbo") { ... }` на:

```ts
			if (engine === "turbo") {
				const outcome = await startTurbo(
					{
						userId: session.user.id,
						prompt,
						...(typeof body.id === "string" ? { id: body.id } : {}),
					},
					startTurboDeps,
				);
				return Response.json(outcome.body, { status: outcome.status });
			}
```

- [x] **Step 5: Интерфейс**

Загрузить скилл `shadcn` (правило проекта для любых правок интерфейсных файлов), менять только логику.

В `src/components/Generate.tsx` заменить константу:

```ts
const POLL_TIMEOUT_MS = 8 * 60_000;
```

на (воркфлоу Турбо идёт до ~8 минут: агент 180 с, рисование 280 с, очередь):

```ts
const POLL_TIMEOUT_MS = 11 * 60_000;
```

(если над константой есть комментарий о сроке, обновить его под 11 минут). В `handleGenerate` после блока `if (!res.ok || !data) { ... }` и перед `rememberResult(data.id ?? id);` добавить:

```ts
			// Турбо принимается в работу и отвечает сразу: результат приходит опросом
			if (res.status === 202) {
				const startedId = data.id ?? id;
				if (startedId !== id) rememberPending(startedId);
				waitForGeneration({ id: startedId, prompt });
				return;
			}
```

- [x] **Step 6: Порог зависших**

В `src/lib/generations.ts` заменить комментарий и константу:

```ts
/**
 * Дольше этого срока живой генерации не бывает: воркфлоу Турбо идёт до ~8 минут
 * (агент до 180 с, рисование до 280 с, очередь), остальные движки укладываются в
 * maxDuration (300 с). Строка `running` старше срока означает, что процесс умер.
 * Такая строка лениво помечается прерванной, а списанные кредиты возвращаются.
 */
export const GENERATION_STALE_MS = 720_000;
```

- [x] **Step 7: Перевести `scripts/eval-turbo.ts` на общее определение агента**

Скрипт использует `runTurbo`, который удаляется на следующем шаге, поэтому переписать его до удаления.

Заменить блок импортов (строки 10–21) на:

```ts
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { buildTurboSystem } from "../src/lib/prompts/turbo.system";
import { toGeneratorQuotes } from "../src/lib/prompts/style-hints";
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
```

Блок от `const library = ...` до конца цикла (строки 69–128) заменить на:

```ts
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

		let png = new Uint8Array();
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
			await writeFile(`${imagesDir}/turbo-${stamp}-${index + 1}.png`, png);
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
			error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		console.log(`# ${prompt}\n  ОШИБКА: ${message}\n`);
		await appendFile(
			jsonl,
			`${JSON.stringify({ prompt, version, error: message })}\n`,
		);
	}
}
```

Блок `timedEditImage` и импорт `codexLanguageModel` удалены вместе с прежними импортами; в шапке файла (комментарий) добавить строку: ` * Агент тот же, что в воркфлоу (createTurboAgent); идёт в одном процессе, без Workflow.`

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun scripts/eval-turbo.ts "кот"` (нужен вход Codex в dev-базе; лимит подписки не тратится, картинка не рисуется)
Expected: для запроса печатается строка `# кот (… с, токенов …)`, список изображений, прочитанное и промпт; в `docs/evals/` появляется `turbo-<метка>.jsonl`. Файл прогона в коммит не добавлять.

- [x] **Step 8: Удалить старое и привести `agent.ts` в порядок**

Run: `git rm src/lib/turbo/tools.ts src/lib/turbo/service.ts src/lib/turbo/runtime.ts src/lib/__tests__/turbo-service.test.ts src/api/workflow-ping.ts`

В `src/server.ts` убрать импорт `workflowPingRoutes` и строку `...workflowPingRoutes,` (временный маршрут Задачи 2).

Заменить содержимое `src/lib/turbo/agent.ts`:

```ts
import { createHash } from "node:crypto";
import { buildUserMessage } from "../prompts/anchors";
import {
	extractCapsPhrases,
	extractQuotedTexts,
	requestsText,
} from "../prompts/style-hints";

export function systemVersionOf(template: string): string {
	return createHash("sha256").update(template).digest("hex").slice(0, 16);
}

/**
 * Сообщение пользователя для агента: запрос, признак текста и точные цитаты.
 * Случайных якорей канона здесь нет: они тянули каждый кадр к одному набору
 * (золото, трактор, дирижабль), а идею агент должен придумывать сам.
 */
export function buildAgentMessage(userInput: string): string {
	const exactTexts = extractQuotedTexts(userInput);
	const textRequested = requestsText(userInput) || exactTexts.length > 0;
	// лозунги капсом приходят так же, как в обычном обогащении: их обещает канон
	return buildUserMessage(userInput, null, {
		textRequested,
		exactTexts,
		textCandidates: textRequested ? extractCapsPhrases(userInput) : [],
	});
}
```

Заменить содержимое `src/lib/__tests__/turbo-agent.test.ts` (сценарии цикла переехали в `turbo-agent-definition`, `turbo-ops`, `turbo-steps`, `turbo-workflow`, `turbo-failure`):

```ts
import { describe, expect, test } from "bun:test";
import { buildAgentMessage, systemVersionOf } from "../turbo/agent";

describe("systemVersionOf", () => {
	test("хеш стабилен и 16 hex-символов", () => {
		expect(systemVersionOf("a")).toBe(systemVersionOf("a"));
		expect(systemVersionOf("a")).toMatch(/^[0-9a-f]{16}$/);
		expect(systemVersionOf("a")).not.toBe(systemVersionOf("b"));
	});
});

describe("buildAgentMessage", () => {
	test("запрос пользователя доходит до агента без случайных якорей", () => {
		const message = buildAgentMessage("пятёрка на троне");
		expect(message).toContain("пятёрка на троне");
		expect(message).not.toContain("ANCHORS");
	});
});
```

Из `src/lib/turbo/constants.ts` удалить `TURBO_TIMEOUT_MS` и его комментарий: после Step 7 его больше никто не использует.

- [x] **Step 9: Проверки**

Run: `bun test`
Expected: все тесты проходят (старые сценарии переехали, их файлы удалены или переписаны).

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format --write src workflows scripts`
Expected: файлы отформатированы.

- [x] **Step 10: Коммит**

Run: `git add -A src workflows scripts`

Run: `git commit -m "Турбо: запуск через воркфлоу, ответ 202, опрос на странице; старый запуск удалён" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 10: Документация

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`

**Interfaces:**
- Consumes: итоговое поведение Задач 1–9.
- Produces: `AGENTS.md`, `README.md` и спека описывают Турбо на Workflow без устаревших утверждений.

- [x] **Step 1: Обновить `AGENTS.md`**

Заменить строку `bun dev              # dev-сервер с hot reload` в блоке команд на две:

```
bun dev              # сборка Workflow и dev-сервер с hot reload (после правок воркфлоу, шагов или кода, который они используют, перезапустить)
bun run workflow:build  # сборка бандлов Workflow в .well-known/workflow/ (в git не идёт)
```

В строке `- \`src/server.ts\` — основной entrypoint: …` дописать в конец: ` Обработчик очереди Workflow (`flow`) на Vercel это отдельная закрытая функция `api/workflow-flow.ts` (триггер очереди в `vercel.json`); локально он монтируется в этот же сервер, в продакшене маршрут не подключается`.

В строке про `GENERATION_STALE_MS` заменить «(6 минут: дольше maxDuration живой генерации не бывает)» на «(12 минут: воркфлоу Турбо идёт до ~8 минут, остальные движки укладываются в maxDuration)».

В разделе «Режим «Турбо»» заменить первую строку («Третий движок `turbo`…») на:

```
- Третий движок `turbo`, 10 кредитов. Запуск идёт воркфлоу Vercel Workflow (`workflows/turbo/`): `POST /api/generate` создаёт строку `running`, списывает кредиты, стартует воркфлоу через `start()` и сразу отвечает `202 { id, engine, cost }`; страница ждёт результат опросом `/api/generations/:id` (таймаут клиента 11 минут). Агент (`WorkflowAgent` из `@ai-sdk/workflow`, модель `gpt-6-luna` через подписку ChatGPT, рассуждение `high`) сам выбирает входные изображения из библиотеки и принимает итог вызовом `generateImage` (инструмент только проверяет аргументы); картинку рисует отдельный шаг `draw` прямым запросом к приватному Codex Images (`/backend-api/codex/images/edits`, до 10 входных, формат и качество запрашиваются 1:1 и medium, но решает сервер). Пользователь видит только запрос и итог
```

Строку «Код в `src/lib/turbo/`…» заменить на:

```
- Код: `workflows/turbo/index.ts` (воркфлоу: `prepare`, цикл агента, `draw`, `complete`, при ошибке `fail` возвращает кредиты) и `workflows/turbo/steps.ts` (шаги, тонкие обёртки). В `src/lib/turbo/`: `library.ts` (библиотека как файловая система только для чтения), `ops.ts` (чтение для агента с превью WebP до 1024 px через `Bun.Image`, проверка аргументов, рисование), `tool-defs.ts` (описания инструментов), `agent-definition.ts` (`createTurboAgent`, общий для воркфлоу и `eval-turbo.ts`; остановка по `acceptedImage`, `tooManyRejections` и `TURBO_MAX_STEPS`), `codex-agent-model.ts` (модель с протоколом сериализации Workflow: в журнал уходит только `modelId`, токены читаются из базы внутри шага), `workflow-runtime.ts` (окружение шагов; тесты подменяют через `setTurboRuntime`), `failure.ts` (коды сбоев данными: код едет в начале текста ошибки, свойства ошибки не переживают границу шага), `start.ts` и `start-deps.ts` (приём запуска), `codex-auth.ts` и `codex-images.ts`. Инструкция агента — `src/lib/prompts/turbo.system.ts` (`buildTurboSystem(tree)`), общие блоки канона с обогащением лежат в `src/lib/prompts/canon.ts`; хеш инструкции (без дерева) пишется в `generations.style_version`
```

В конец раздела «Режим «Турбо»» добавить пункт:

```
- Workflow на Bun: пакеты `workflow`, `@ai-sdk/workflow`, `@workflow/serde` закреплены точными версиями, `@swc/core` строго `1.15.3` (под него собран плагин SWC; 1.16.x даёт «Failed to deserialize program received from host»). Код приложения преобразует плагин `workflow-plugin.ts`, подключённый через `preload` в `bunfig.toml` (в `bun test` он не применяется: воркфлоу и шаги там обычные функции, поэтому ветки ошибок проверяются юнит-тестами через `setTurboRuntime`, а сериализация только живым прогоном). От примера в документации плагин отличается фильтром без `node_modules`. Локально работает Local World (`.workflow-data/`, в `.gitignore`), порт доставки очереди `PORT=3000`. Лимиты на Hobby: 50 000 событий и 1 ГБ записи в месяц, шаг ограничен лимитом функции 300 с; хранение прогона 1 день
- Бюджеты времени: агент до 180 с (`TURBO_AGENT_TIMEOUT_MS`), рисование до 280 с (`TURBO_DRAW_TIMEOUT_MS`, запрос к Codex обрывается сам раньше лимита функции); рисование без повторов (`drawStep.maxRetries = 0`): у Codex Images нет ключа идемпотентности. Сбой любого вида ведёт к шагу `fail` (возврат кредитов, ровно один раз), мёртвый вход Codex помечается для админки
```

В разделе «Деплой на Vercel» заменить строку «Турбо укладывается в тот же лимит: …» (целиком, до «…или тарифе Pro») на:

```
- Турбо не упирается в лимит одного вызова: агент и рисование это отдельные шаги воркфлоу, у каждого свои 300 с (Hobby). Замеры на dev (`bun scripts/eval-turbo.ts --generate`, до перехода на Workflow): запросы без героев 70–90 с, с четырьмя входными героями 90–420 с (рисование делает от 1 до 12 внутренних проходов по 25–35 с, число плавает у провайдера независимо от промпта; ручек качества, размера, формата, модели и `service_tier` у Codex Images нет; рассуждение агента `high` стоит 20–50 с до первого токена), см. `docs/superpowers/specs/2026-10-07-turbo-creative-direction-design.md`. Размещение обработчика очереди и проверка на preview: `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`
```

(Вариант размещения обработчика (функция `api/workflow-flow.ts`, Services или Build Output API) вписать по итогам Задачи 2; в строках выше стоит вариант B, поправить, если выбран другой.)

- [x] **Step 2: Обновить `README.md`**

Строку со структурой `lib/turbo/       # режим «Турбо»: библиотека, вход Codex, картинки, агент, сервис` заменить на:

```
  lib/turbo/       # режим «Турбо»: библиотека, вход Codex, картинки, определение агента, приём запуска
workflows/         # воркфлоу Турбо (Vercel Workflow): оркестрация и шаги
```

В строку про режим «Турбо» (описание функции) дописать: «Запуск идёт воркфлоу Vercel Workflow, страница ждёт результат опросом».

- [x] **Step 3: Обновить спеку**

В `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`:
- В разделе «6. Тесты» заменить пункт «Сквозная проверка: `scripts/smoke-turbo-workflow.ts` …» на: «Воркфлоу вызывается в `bun test` напрямую как обычная функция (корневой `preload` в тестах не применяется, проверено опытом), окружение подменяется `setTurboRuntime`: ветки успеха и всех сбоев покрыты юнит-тестами. Сериализация и границы шагов в таких тестах не участвуют: их проверяет живой прогон на dev-ветке и на preview».
- В разделе «Что меняется в файлах» убрать `scripts/smoke-turbo-workflow.ts`, добавить `ops.ts`, `tool-defs.ts`, `workflow-runtime.ts`, `failure.ts`, `size.ts`, `preview.ts`, `start.ts`, `start-deps.ts`.
- В таблице статусов оценку «запись в журнал при сжатых картинках единицы МБ на прогон» заменить на фактические размеры превью WebP (3,2 МБ → 248 КБ, обычно 7–31 КБ) и пометить: расчёт сменён замером, итог по журналу измерить в Задаче 11.

- [x] **Step 4: Проверки и коммит**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format .`
Expected: `No fixes applied`.

Run: `git add AGENTS.md README.md docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`

Run: `git commit -m "Документация Турбо на Workflow: AGENTS.md, README, спека" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 11: Живая проверка, свежие свидетельства и ревью

**Files:**
- Modify: `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md` (итоги проверки)

**Interfaces:**
- Consumes: всё из Задач 1–10.
- Produces: записанные в спеке результаты живых проверок с источниками; зелёные проверки; ревью диффа.

- [x] **Step 1: Полный набор проверок проекта**

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun run lint`
Expected: без ошибок.

Run: `bunx biome format .`
Expected: `No fixes applied`.

Run: `bun test`
Expected: все тесты проходят; записать число.

Run: `bun run build`
Expected: `Compiled workflows ...` и сборка фронтенда в `dist/`.

Run: `vercel build --prod`
Expected: сборка заканчивается; в `.vercel/output/functions` есть функция сайта и функция обработчика (по выбранному в Задаче 2 варианту). Это локальная проверка бандла, как предписывает `AGENTS.md` для изменений серверной части.

- [x] **Step 2: Живой прогон на dev (Local World)**

Условия: `.env.development` с dev-базой и dev-хранилищем, в админке выполнен вход Codex. Если входа нет, попросить владельца выполнить «Войти» в админке dev-сервера (токены и ключи не придумывать).

Run (в фоне): `bun dev`

В браузере через `agent-browser` (скилл `agent-browser`) открыть `http://localhost:3000`, войти, переключить режим на «Турбо», отправить запрос «кот».
Expected: кнопка переходит в ожидание (`PopWait`), обновление страницы не теряет процесс; через 1–5 минут появляется картинка, баланс уменьшился на 10, запись есть в галерее.

Проверить прогон в Local World:

Run: `npx workflow inspect runs`
Expected: прогон `turboWorkflow` со статусом `completed`; в `npx workflow inspect run <runId>` видны шаги `prepareStep`, вызовы модели, `drawStep`, `completeStep`.

Проверить записи:

Run: `bun -e 'import { sql } from "./src/lib/db"; console.log(await sql`SELECT id, status, cost, engine, enhanced_prompt IS NOT NULL AS has_prompt, input_images, llm_model, duration_ms FROM generations ORDER BY created_at DESC LIMIT 1`); process.exit(0)'`
Expected: `status = completed`, `cost = 10`, `engine = turbo`, `llm_model = gpt-6-luna`, непустой `input_images` для запроса с героями.

- [x] **Step 3: Проверки из раздела «не проверено» спеки**

Взять `runId` из предыдущего шага и открыть вход модельного шага:

Run: `npx workflow inspect run <runId> --json`
Expected и фиксация результатов:
1. Картинки доходят до модели: у шага `doGenerate` после чтения файла во входе видна часть `file` с `image/webp` (если агент читал картинки; запрос «пятёрка на троне» вызывает чтение).
2. Зашифрованное рассуждение переносится между шагами: во входе второго и следующих вызовов модели встречается `reasoningEncryptedContent` (или `encrypted_content`). Если нет, остановиться и сообщить владельцу: качество агента может просесть; предложить вариант «цикл агента одним шагом» из спеки, не выбирая самому.
3. Сжатые копии: размер записи журнала для запроса с героями ниже расчётного (записать фактический размер данных прогона из `inspect`).

- [ ] **Step 4: Сценарии сбоя на dev**

а) Рисование без входа: в админке нажать «Выйти» (Codex), отправить запрос.
Expected: Турбо скрыт у пользователей (`/api/models` не отдаёт его), попытка отправить `engine: "turbo"` обрабатывается как неизвестный движок; после нового входа возвращается.

б) Обрыв посреди рисования: во время шага `draw` остановить dev-сервер (`kill <pid>`) и запустить снова.
Expected: Local World при запуске возобновляет незавершённые прогоны (`WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS` по умолчанию включено); записать, что произошло с шагом без повторов (ошибка шага и возврат кредитов, либо повторное рисование). Если произошло повторное рисование, остановиться и сообщить владельцу: правило «рисование без повторов» не держит при обрыве, нужно решение (ключ идемпотентности недоступен).

Остановить dev-сервер (`kill <pid>`).

> **Итог (2026-10-09):** пункт б выполнен (Local World прогон не возобновил, повторного рисования не было, строка закрылась лениво через 12 минут с возвратом кредитов). Пункт а на живой системе не выполнялся: «Выйти» разлогинило бы вход Codex владельца; ветка покрыта тестами, поэтому шаг остаётся неотмеченным.

- [ ] **Step 5: Проверка на preview (после разрешения владельца)**

Спросить разрешение на пуш ветки или `vercel deploy`. После «да»: повторить Step 2 на preview-URL (войти, режим «Турбо», запрос «кот»).
Expected: картинка появилась; `npx workflow inspect runs --backend vercel --project gen42 --team <slug> --env preview` показывает `completed`; в логах (`vercel logs <deployment-url>`) нет ошибок `Cannot find package 'X'` (если есть, добавить пакет в `includeFiles` в `vercel.json` по правилу `AGENTS.md`, а не ставить костыли в код) и нет ошибок загрузки бандла `flow.mjs`.

- [x] **Step 6: Зафиксировать итоги в спеке** (результаты dev записаны; строки по preview добавить после Step 5)

В таблицу «Источники и статусы» спеки добавить строки по Step 2–5 со статусами «подтверждено» или «опровергнуто» и источником (дата, id прогона, URL), в разделе «Проверить при реализации» закрыть пункты.

- [x] **Step 7: Ревью диффа субагентом** (выполнено лично по указанию владельца «самостоятельно», без субагента; найдена и исправлена регрессия миграций прода: плагин в `preload` требовал `@swc/core` без `bun install`)

Правило `AGENTS.md`: перед PR ревью диффа. Использовать скилл `requesting-code-review` с диапазоном от последнего коммита ветки `main` (`git merge-base HEAD origin/main`) до `HEAD`. Находки blocker и major закрыть до PR, minor принять осознанно или закрыть. Не запускать линтер и тесты внутри ревью (правило пользователя); сверка с документацией обязательна.

- [ ] **Step 8: Коммит и передача**

Run: `git add docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`

Run: `git commit -m "Спека Workflow: итоги живых проверок" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

Сообщить владельцу итог: что подтверждено, что опровергнуто, что осталось. Пуш, PR и мерж только по его разрешению.
