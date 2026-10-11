# Braintrust: трассировка и эксперименты evals — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM-вызовы gen42 попадают в трассы Braintrust проекта `Gen42`, а прогоны `scripts/eval-*.ts` — в эксперименты.

**Architecture:** Новый модуль `src/lib/tracing.ts` (`initTracing`, `traceSpan`, `logEvalRun`) над SDK `braintrust`; точки вызова — старт сервера, окружение шагов воркфлоу, обогащение, HF-генерация, рисование и агентский цикл Turbo. Без `BRAINTRUST_API_KEY` всё — no-op.

**Tech Stack:** Bun, `braintrust` ^3.37.2, AI SDK v7 (`ai` 7.0.133), bun:test.

**Spec:** `docs/superpowers/specs/2026-10-11-braintrust-tracing-design.md`

## Global Constraints

- В коде, достижимом из шагов Workflow (`workflows/**`, `src/lib/**`), не писать `import … from "bun"` — сборщик Workflow не разрешает этот импорт.
- Без `BRAINTRUST_API_KEY` приложение и eval-скрипты работают как раньше (no-op), ошибки трассировки ничего не роняют: `console.warn` и продолжение.
- Env: `BRAINTRUST_API_KEY`, `BRAINTRUST_PROJECT` (дефолт `"Gen42"`). В git секреты не попадают.
- Коммиты — по-русски, по ходу каждой задачи; тесты `bun:test`.
- API SDK (проверено по `node_modules/braintrust/dist/index.d.ts`): `initLogger({ projectName })`, `ai.registerTelemetry(braintrustAISDKTelemetry())`, `traced((span) => …, { name, type, input, metadata })`, `initExperiment(project, { experiment, setCurrent })` → `experiment.log({ input, output, metadata })` + `await experiment.flush()`, глобальный `flush()`, `NOOP_SPAN`.

---

### Task 1: Модуль трассировки `src/lib/tracing.ts`

**Files:**
- Create: `src/lib/tracing.ts`
- Test: `src/lib/__tests__/tracing.test.ts`

**Interfaces:**
- Consumes: экспорт `braintrust` (`initLogger`, `initExperiment`, `traced`, `NOOP_SPAN`, `braintrustAISDKTelemetry`, типы `Span`, `StartSpanArgs`), `ai.registerTelemetry` из `ai`.
- Produces (Task 2–3 полагаются на это):
  - `initTracing(): void` — идемпотентная инициализация, no-op без ключа.
  - `traceSpan<T>(name: string, args: { type?: StartSpanArgs["type"]; input?: unknown; metadata?: Record<string, unknown> }, work: (span: Span) => Promise<T>): Promise<T>` — span вокруг работы; без ключа вызывает `work` с `NOOP_SPAN`; ошибки `work` проходят наружу.
  - `logEvalRun(params: { suite: string; stamp: string; records: EvalRunRecord[] }): Promise<void>` — один эксперимент на прогон.
  - `EvalRunRecord = { input: string; output: string | null; metadata: Record<string, unknown> }`.
  - `evalExperimentName(suite: string, stamp: string): string` → `` `${suite}-${stamp}` ``.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/tracing.test.ts`:

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import {
	evalExperimentName,
	initTracing,
	logEvalRun,
	traceSpan,
} from "../tracing";

beforeAll(() => {
	// тесты проверяют no-op-ветку: ключа быть не должно
	delete process.env.BRAINTRUST_API_KEY;
});

describe("tracing", () => {
	test("traceSpan выполняет работу и возвращает результат", async () => {
		const result = await traceSpan("test", {}, async () => 42);
		expect(result).toBe(42);
	});

	test("ошибка работы проходит наружу", async () => {
		await expect(
			traceSpan("test", {}, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
	});

	test("initTracing идемпотентен и не падает без ключа", () => {
		initTracing();
		initTracing();
	});

	test("logEvalRun — no-op без ключа", async () => {
		await logEvalRun({
			suite: "style42",
			stamp: "2026-10-11T00-00-00",
			records: [{ input: "a", output: "b", metadata: { x: 1 } }],
		});
	});

	test("имя эксперимента", () => {
		expect(evalExperimentName("turbo", "2026-10-11T00-00-00")).toBe(
			"turbo-2026-10-11T00-00-00",
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/tracing.test.ts`
Expected: FAIL — модуль `../tracing` не существует.

- [ ] **Step 3: Write minimal implementation**

`src/lib/tracing.ts`:

```ts
import {
	braintrustAISDKTelemetry,
	initExperiment,
	initLogger,
	NOOP_SPAN,
	traced,
	type Span,
	type StartSpanArgs,
} from "braintrust";
import * as ai from "ai";

let initialized = false;

/**
 * Идемпотентная инициализация трассировки. Без BRAINTRUST_API_KEY — no-op;
 * сбой инициализации не роняет работу приложения.
 */
export function initTracing(): void {
	if (initialized) return;
	initialized = true;
	if (!process.env.BRAINTRUST_API_KEY) return;
	try {
		initLogger({ projectName: process.env.BRAINTRUST_PROJECT ?? "Gen42" });
		ai.registerTelemetry(braintrustAISDKTelemetry());
	} catch (error) {
		console.warn("[tracing] инициализация не удалась:", error);
	}
}

/** Span вокруг работы. Без ключа работа идёт с NOOP_SPAN; ошибки работы проходят наружу. */
export async function traceSpan<T>(
	name: string,
	args: {
		type?: StartSpanArgs["type"];
		input?: unknown;
		metadata?: Record<string, unknown>;
	},
	work: (span: Span) => Promise<T>,
): Promise<T> {
	if (!process.env.BRAINTRUST_API_KEY) return work(NOOP_SPAN);
	return traced(async (span) => work(span), {
		name,
		type: args.type ?? "function",
		...(args.input !== undefined ? { input: args.input } : {}),
		...(args.metadata ? { metadata: args.metadata } : {}),
	});
}

export interface EvalRunRecord {
	input: string;
	output: string | null;
	metadata: Record<string, unknown>;
}

export function evalExperimentName(suite: string, stamp: string): string {
	return `${suite}-${stamp}`;
}

/** Прогон eval-скрипта одним экспериментом. Без ключа — no-op; сбой не роняет прогон. */
export async function logEvalRun(params: {
	suite: string;
	stamp: string;
	records: EvalRunRecord[];
}): Promise<void> {
	if (!process.env.BRAINTRUST_API_KEY) return;
	try {
		const experiment = initExperiment(
			process.env.BRAINTRUST_PROJECT ?? "Gen42",
			{
				experiment: evalExperimentName(params.suite, params.stamp),
				setCurrent: false,
			},
		);
		for (const record of params.records) {
			experiment.log({
				input: record.input,
				output: record.output,
				scores: {},
				metadata: record.metadata,
			});
		}
		await experiment.flush();
	} catch (error) {
		console.warn("[tracing] эксперимент не отправлен:", error);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/tracing.test.ts`
Expected: PASS (5 tests). Дополнительно: `bun run typecheck` — без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracing.ts src/lib/__tests__/tracing.test.ts package.json bun.lock
git commit -m "Модуль трассировки Braintrust: initTracing, traceSpan, logEvalRun"
```

---

### Task 2: Трассировка приложения

**Files:**
- Modify: `src/server.ts` (~строка 58, перед `const server = serve({`)
- Modify: `src/lib/turbo/workflow-runtime.ts` (`createDefaultRuntime`)
- Modify: `src/api/generate.ts` (~строка 196, `enhanced = await enhancePrompt(prompt)`)
- Modify: `src/lib/hf.ts` (`generateImage`, вызов `callSpace` ~строка 271)
- Modify: `src/lib/turbo/ops.ts` (`drawImage`, вызов `deps.edit` ~строка 73)
- Modify: `workflows/turbo/index.ts` (вызов `runTurboAgent`)

**Interfaces:**
- Consumes: `traceSpan`, `initTracing` из Task 1.
- Produces: трассы `enhance`, `hf-generate`, `turbo-draw`, `turbo-agent` в логах проекта `Gen42`; сигнатуры функций не меняются.

- [ ] **Step 1: Инициализация при старте сервера**

`src/server.ts`: добавить импорт `import { initTracing } from "./lib/tracing";` (к остальным импортам) и вызов перед стартом:

```ts
initTracing();
const server = serve({
```

- [ ] **Step 2: Инициализация в окружении шагов воркфлоу**

`src/lib/turbo/workflow-runtime.ts`: добавить импорт `import { initTracing } from "../tracing";` и вызов в начале `createDefaultRuntime`:

```ts
function createDefaultRuntime(): TurboRuntime {
	initTracing();
	return {
```

(Тесты с `setTurboRuntime` окружение подменяют, `initTracing` не вызывается — поведение тестов не меняется.)

- [ ] **Step 3: Parent-span обогащения**

`src/api/generate.ts`: заменить `enhanced = await enhancePrompt(prompt);` на:

```ts
				enhanced = await traceSpan(
					"enhance",
					{ input: prompt, metadata: { generationId, engine } },
					() => enhancePrompt(prompt),
				);
```

Импорт: `import { traceSpan } from "../lib/tracing";`.

- [ ] **Step 4: Span HF-генерации**

`src/lib/hf.ts` в `generateImage` обернуть только вызов `callSpace` (один span на генерацию, не на каждый опрос):

```ts
	const data = await traceSpan(
		"hf-generate",
		{ input: { engine, prompt: params.prompt }, metadata: { engine } },
		async () =>
			callSpace({
				apiBase: model.apiBase,
				apiName: model.apiName,
				payload: buildPayload(engine, params),
				apiKey,
				timeoutMs: model.pollTimeoutMs,
			}),
	);
```

Импорт: `import { traceSpan } from "./tracing";`.

- [ ] **Step 5: Span рисования Turbo**

`src/lib/turbo/ops.ts` в `drawImage` обернуть вызов `deps.edit`:

```ts
		const result = await traceSpan(
			"turbo-draw",
			{ input: { prompt: finalPrompt, images: inputImages } },
			async () =>
				deps.edit({
					prompt: finalPrompt,
					images: resolved.images,
					...(input.signal ? { signal: input.signal } : {}),
				}),
		);
```

Импорт: `import { traceSpan } from "../tracing";`.

- [ ] **Step 6: Span агентского цикла Turbo**

`workflows/turbo/index.ts` заменить `const run = await runTurboAgent(agent, prepared.message);` на:

```ts
		const run = await traceSpan(
			"turbo-agent",
			{
				input: prepared.message,
				metadata: { generationId: input.id, reasoning: input.reasoning },
			},
			() => runTurboAgent(agent, prepared.message),
		);
```

Импорт: `import { traceSpan } from "../../src/lib/tracing";`.

- [ ] **Step 7: Проверить и закоммитить**

Run: `bun run typecheck && bun test`
Expected: PASS без новых ошибок (существующие тесты не сломаны).

```bash
git add src/server.ts src/lib/turbo/workflow-runtime.ts src/api/generate.ts src/lib/hf.ts src/lib/turbo/ops.ts workflows/turbo/index.ts
git commit -m "Трассировка Braintrust в приложении: обогащение, HF, Turbo-агент и рисование"
```

---

### Task 3: Evals в эксперименты

**Files:**
- Modify: `scripts/eval-style42.ts` (сбор `records` в цикле, `logEvalRun` перед `process.exit`)
- Modify: `scripts/eval-turbo.ts` (то же)

**Interfaces:**
- Consumes: `logEvalRun`, `EvalRunRecord` из Task 1.
- Produces: эксперименты `style42-<stamp>` и `turbo-<stamp>` в проекте `Gen42`; JSONL-файлы пишутся как раньше.

- [ ] **Step 1: eval-style42.ts**

Добавить импорт `import { logEvalRun, type EvalRunRecord } from "../src/lib/tracing";`. Объявить рядом с `const lines: string[] = [];`:

```ts
const records: EvalRunRecord[] = [];
```

В цикле `for (const userInput of selected)` после `lines.push(JSON.stringify(record));` добавить:

```ts
	records.push({
		input: userInput,
		output: result.prompt,
		metadata: {
			suite: "style42",
			style_version: record.style_version,
			fallback: record.fallback,
			duration_ms: record.duration_ms,
			input_tokens: record.input_tokens,
			output_tokens: record.output_tokens,
			words: record.words,
			error: record.error,
		},
	});
```

Перед `console.log(`\nзаписано: ${file}`);` вставить:

```ts
await logEvalRun({ suite: "style42", stamp, records });
```

(`logEvalRun` сам делает flush и глотает сбои — `process.exit(0)` после него безопасен.)

- [ ] **Step 2: eval-turbo.ts**

Добавить импорт `import { logEvalRun, type EvalRunRecord } from "../src/lib/tracing";` и `const records: EvalRunRecord[] = [];` рядом с объявлением `jsonl`. В успешной ветке (там, где `appendFile` с `finalPrompt`) добавить:

```ts
		records.push({
			input: prompt,
			output: finalPrompt,
			metadata: {
				suite: "turbo",
				version,
				model: agentModelId,
				reasoning: agentReasoning,
				seconds,
				tokens: run.tokens,
				inputImages,
				randomPicks: run.randomPicks,
				size,
			},
		});
```

В ветке `catch` добавить:

```ts
		records.push({
			input: prompt,
			output: null,
			metadata: { suite: "turbo", version, error: message },
		});
```

Перед `console.log(`Журнал: ${jsonl}`);` вставить:

```ts
await logEvalRun({ suite: "turbo", stamp, records });
```

В `scripts/eval-turbo.ts` имя метки времени: если переменная называется иначе (проверить при реализации), использовать её значение для `stamp`; оно же используется в имени `jsonl`.

- [ ] **Step 3: Проверить и закоммитить**

Run: `bun run typecheck`
Expected: PASS. Затем локальный smoke одного запроса (трасса и эксперимент уходят в Braintrust при наличии ключа в окружении):

Run: `bun scripts/eval-style42.ts мопс`
Expected: прогон завершается, JSONL записан, в консоли нет ошибок `[tracing]`.

```bash
git add scripts/eval-style42.ts scripts/eval-turbo.ts
git commit -m "Прогоны eval-скриптов уходят в эксперименты Braintrust"
```

---

### Task 4: Smoke, документация, финальные проверки

**Files:**
- Modify: `AGENTS.md`, `README.md`

**Interfaces:**
- Consumes: всё из Task 1–3.
- Produces: закрытые пункты «не проверено» из спеки; обновлённая документация.

- [ ] **Step 1: Smoke бандла воркфлоу**

Run: `bun run workflow:build`
Expected: сборка проходит, в бандле шагов нет ошибок про `braintrust` (пункт «не проверено» про esbuild-бандл). Если сборка падает на braintrust — зафиксировать ошибку и решить документированным способом (например, вынести инициализацию за пределы бандлируемых шагов), не оставляя костыль.

- [ ] **Step 2: Smoke живьём**

Убедиться, что `BRAINTRUST_API_KEY` есть в `.env.development`. Запустить `bun scripts/eval-style42.ts <подстрока>` одним запросом и `bun scripts/eval-turbo.ts <подстрока>` одним запросом (без `--generate`). В проекте `Gen42` в Braintrust (braintrust.dev → Logs/Experiments) проверить: появились эксперименты `style42-*` и `turbo-*`, а в логах — спаны LLM-вызовов. Ссылки-пермалинки приложить в PR-описании.

- [ ] **Step 3: Документация**

`AGENTS.md` (раздел «Обогащение промпта» и новый короткий раздел про наблюдаемость) и `README.md`: трассировка Braintrust включается наличием `BRAINTRUST_API_KEY` (дефолт проекта `Gen42`, переопределяется `BRAINTRUST_PROJECT`); без ключа всё работает как раньше; прогоны eval-скриптов дополнительно уходят в эксперименты; скилл Braintrust для агента установлен `bt setup skills`. Env-переменные уже описаны в `.env.example` (сделано на ветке).

- [ ] **Step 4: Финальные проверки и коммит**

Run: `bun run typecheck && bunx biome format . && bun test && bun run build`
Expected: всё PASS.

```bash
git add AGENTS.md README.md
git commit -m "Документация: трассировка и эксперименты Braintrust"
```

Отдельно, с разрешения владельца: `BRAINTRUST_API_KEY` в Vercel (production + preview) через `vercel env add`, затем новый деплой.

---

## Self-review плана

- **Покрытие спеки:** инициализация (Task 1–2), точки трассировки (Task 2), эксперименты evals (Task 3), env (сделано на ветке, `.env.example`), ошибки-не-роняют (Task 1 код и тесты), smoke закрывает «не проверено» (Task 4), документация (Task 4), Vercel env — шаг владельца (Task 4). Пропусков нет.
- **Плейсхолдеров нет** — весь код приведён; одно место с уточнением имени переменной `stamp` в `eval-turbo.ts` закрывается явным шагом проверки при реализации (имя файла `jsonl` его содержит).
- **Согласованность имён:** `initTracing` / `traceSpan` / `logEvalRun` / `EvalRunRecord` / `evalExperimentName` совпадают между Task 1 и Task 2–3; имена спанов (`enhance`, `hf-generate`, `turbo-draw`, `turbo-agent`) согласованы со спекой.
