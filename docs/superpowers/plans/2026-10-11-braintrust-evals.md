# Evaluation на официальном формате Braintrust — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** evals живут в официальном формате Braintrust (`Eval()` + датасеты + custom-скореры, запуск `bt eval`), самописных скриптов и JSONL больше нет, без `BRAINTRUST_API_KEY` работа невозможна.

**Architecture:** два eval-файла `evals/*.eval.ts` читают запросы из датасетов проекта `Gen42`, задачи — `enhancePrompt` и прогон Turbo-агента, скореры — custom-код на базе существующих проверок стиля; метрики прогона попадают в output. Наполнение датасетов — `bt datasets create --file` из JSON в git.

**Tech Stack:** Bun, `braintrust` ^3.37.2 (`Eval`, `initDataset`), `bt` CLI, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-11-braintrust-evals-design.md`

## Global Constraints

- Работа без `BRAINTRUST_API_KEY` не предусмотрена: `initTracing()` без ключа завершает процесс понятной ошибкой; тихих no-op-веток нет.
- Только официальный формат Braintrust: никаких самописных JSONL-журналов и скриптов-прогонов; метрики прогона (время, токены) — в `output`, не в файлах.
- Скореры — только детерминированный custom-код на базе существующих проверок (`src/lib/prompts/`); новые правила не изобретать.
- Логика проверок переиспользуется из `src/lib/prompts/contract.ts` (`validateEnhancedPrompt`) и `src/lib/prompts/style-hints.ts` (`missingDetails`, `requestsText`, `extractQuotedTexts`).
- В коде из `workflows/**` и `src/lib/**` не писать `import … from "bun"`.
- Коммиты — по-русски; тесты `bun:test`; секреты в git не попадают.
- API SDK (проверено по `node_modules/braintrust/dist/index.d.ts`): `Eval(name, { data, task, scores, experiment?, metadata?, maxConcurrency? })`; `initDataset(project, { dataset })` в `data`; скорер `({ input, output, expected, metadata }) => number | { name, score, metadata } | null`; `bt datasets create <имя> --file <json>`.

---

### Task 1: Контракт ключа — fail fast

**Files:**
- Modify: `src/lib/tracing.ts`
- Test: `src/lib/__tests__/tracing.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: `initTracing(): void` — без `BRAINTRUST_API_KEY` бросает `Error` с сообщением про переменную; `traceSpan` — без ключа бросает ту же ошибку (работа не начинается). `logEvalRun`, `EvalRunRecord`, `evalExperimentName` удаляются.

- [ ] **Step 1: Write the failing test**

Заменить содержимое `src/lib/__tests__/tracing.test.ts` на:

```ts
import { beforeAll, describe, expect, test } from "bun:test";
import { initTracing, traceSpan } from "../tracing";

describe("tracing требует ключ", () => {
	beforeAll(() => {
		delete process.env.BRAINTRUST_API_KEY;
	});

	test("initTracing без ключа завершает работу понятной ошибкой", () => {
		expect(() => initTracing()).toThrow(/BRAINTRUST_API_KEY/);
	});

	test("traceSpan без ключа не начинает работу", async () => {
		await expect(
			traceSpan("test", {}, async () => 42),
		).rejects.toThrow(/BRAINTRUST_API_KEY/);
	});
});

describe("tracing с ключом", () => {
	beforeAll(() => {
		process.env.BRAINTRUST_API_KEY = "test-key-not-real";
	});

	test("initTracing идемпотентен", () => {
		initTracing();
		initTracing();
	});

	test("traceSpan выполняет работу и прокидывает её ошибки", async () => {
		const result = await traceSpan("test", {}, async () => 42);
		expect(result).toBe(42);
		await expect(
			traceSpan("test", {}, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/tracing.test.ts`
Expected: FAIL — «initTracing без ключа» сейчас не бросает, «logEvalRun» ещё существует.

- [ ] **Step 3: Write minimal implementation**

`src/lib/tracing.ts` заменить на:

```ts
import {
	braintrustAISDKTelemetry,
	initLogger,
	traced,
	type Span,
	type StartSpanArgs,
} from "braintrust";
import * as ai from "ai";

let initialized = false;

function requireKey(): string {
	const key = process.env.BRAINTRUST_API_KEY;
	if (!key) {
		throw new Error(
			"BRAINTRUST_API_KEY не задан: трассировка и evaluation живут в Braintrust, работа без ключа не предусмотрена",
		);
	}
	return key;
}

/**
 * Идемпотентная инициализация трассировки. Без BRAINTRUST_API_KEY — ошибка:
 * приложение и eval-файлы без Braintrust не работают. Сбой инициализации
 * не роняет работу приложения (лог + продолжение).
 */
export function initTracing(): void {
	requireKey();
	if (initialized) return;
	initialized = true;
	try {
		initLogger({ projectName: process.env.BRAINTRUST_PROJECT ?? "Gen42" });
		ai.registerTelemetry(braintrustAISDKTelemetry());
	} catch (error) {
		console.warn("[tracing] инициализация не удалась:", error);
	}
}

/** Span вокруг работы. Ошибки работы проходят наружу; без ключа работа не начинается. */
export async function traceSpan<T>(
	name: string,
	args: {
		type?: StartSpanArgs["type"];
		input?: unknown;
		metadata?: Record<string, unknown>;
	},
	work: (span: Span) => Promise<T>,
): Promise<T> {
	requireKey();
	return traced(async (span) => work(span), {
		name,
		type: args.type ?? "function",
		...(args.input !== undefined ? { input: args.input } : {}),
		...(args.metadata ? { metadata: args.metadata } : {}),
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/tracing.test.ts && bun run typecheck`
Expected: PASS; typecheck сообщит об использовании удалённых `logEvalRun` в `scripts/eval-*.ts` — это закроется Task 5 (скрипты удаляются); до него допустимо починить вызовы заглушкой-удалением в Task 5, а не сейчас.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracing.ts src/lib/__tests__/tracing.test.ts
git commit -m "Трассировка: без BRAINTRUST_API_KEY работа невозможна, logEvalRun упразднён"
```

---

### Task 2: Датасеты style42-prompts и turbo-prompts

**Files:**
- Create: `evals/data/style42-prompts.json`
- Create: `evals/data/turbo-prompts.json`

**Interfaces:**
- Consumes: массивы `PROMPTS` из `scripts/eval-style42.ts:11-33` и `scripts/eval-turbo.ts:50-91`.
- Produces: JSON-файлы строк датасета формата `{ "id": "...", "input": { "prompt": "..." }, "metadata": { ... } }`; датасеты `style42-prompts` и `turbo-prompts` в проекте `Gen42`; Task 3–4 читают их через `initDataset`.

- [ ] **Step 1: Сформировать JSON-файлы из текущих наборов**

Извлечь каждую строку `PROMPTS` обоих скриптов в JSON-массивы (одна строка датасета на запрос):
`evals/data/style42-prompts.json` — id `style42-1`…`style42-N`, `input.prompt` = запрос, `metadata.kind = "style42"`;
`evals/data/turbo-prompts.json` — id `turbo-1`…`turbo-M`, `input.prompt` = запрос, `metadata.kind = "turbo"`.
Проверка полноты: число строк в JSON равно длине соответствующего массива `PROMPTS`.

- [ ] **Step 2: Создать и наполнить датасеты (официальный CLI)**

Run:
```bash
bt datasets create style42-prompts --file evals/data/style42-prompts.json --no-input
bt datasets create turbo-prompts --file evals/data/turbo-prompts.json --no-input
bt datasets list
```
Expected: оба датасета в списке, `bt datasets view style42-prompts` показывает строки. Если `create` не принимает формат файла — привести файл к ожидаемому (JSONL или поле `rows`), опираясь на `bt datasets create --help`.

- [ ] **Step 3: Commit**

```bash
git add evals/data/style42-prompts.json evals/data/turbo-prompts.json
git commit -m "Датасеты evals: запросы style42 и turbo как исходники для Braintrust"
```

---

### Task 3: `evals/style42.eval.ts` и общие скореры

**Files:**
- Create: `evals/scorers.ts`
- Create: `evals/style42.eval.ts`
- Test: `evals/__tests__/scorers.test.ts`

**Interfaces:**
- Consumes: `enhancePrompt` (`src/lib/enhance.ts`), `validateEnhancedPrompt` (`src/lib/prompts/contract.ts`), `missingDetails`/`requestsText`/`extractQuotedTexts` (`src/lib/prompts/style-hints.ts`), датасет `style42-prompts` (Task 2), `initTracing`/`traceSpan` (Task 1).
- Produces: `evals/scorers.ts` экспортирует `contractScorer`, `has42Scorer`, `lengthBandScorer(min, max)`, `heroFirstScorer`, `noUnrequestedTextScorer` — функции формы `({ input, output }) => { name, score, metadata }`; выход задачи формы `{ prompt: string; fallback: boolean; durationMs: number; inputTokens: number | null; outputTokens: number | null; styleVersion: string }`.

- [ ] **Step 1: Write the failing tests for scorers**

`evals/__tests__/scorers.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	contractScorer,
	has42Scorer,
	heroFirstScorer,
	lengthBandScorer,
	noUnrequestedTextScorer,
} from "../scorers";

const input = (prompt: string) => ({ prompt });

describe("скореры evals", () => {
	test("contract: валидный контракт — 1, невалидный — 0", () => {
		expect(contractScorer({ input: input("кот"), output: { prompt: "x" } }).score).toBe(0);
		expect(typeof contractScorer({ input: input("кот"), output: { prompt: "x" } }).metadata.reason).toBe("string");
	});

	test("has-42: наличие числа 42 в промпте", () => {
		expect(has42Scorer({ input: input("кот"), output: { prompt: "кот и 42" } }).score).toBe(1);
		expect(has42Scorer({ input: input("кот"), output: { prompt: "просто кот" } }).score).toBe(0);
	});

	test("length-band: слова в диапазоне", () => {
		const scorer = lengthBandScorer(2, 4);
		expect(scorer({ input: input("кот"), output: { prompt: "два слова" } }).score).toBe(1);
		expect(scorer({ input: input("кот"), output: { prompt: "одно" } }).score).toBe(0);
	});

	test("hero-first: герой запроса найден в промпте", () => {
		expect(
			heroFirstScorer({ input: input("мопс"), output: { prompt: "мопс в шубе" } }).score,
		).toBe(1);
		expect(
			heroFirstScorer({ input: input("мопс"), output: { prompt: "кот в шубе" } }).score,
		).toBe(0);
	});

	test("no-unrequested-text: без запроса текста цитаты в промпте минус", () => {
		expect(
			noUnrequestedTextScorer({
				input: input("закат"),
				output: { prompt: "закат и надпись «НАС 42000»" },
			}).score,
		).toBe(0);
		expect(
			noUnrequestedTextScorer({
				input: input("плакат с надписью «БОГЕМА»"),
				output: { prompt: "плакат «БОГЕМА»" },
			}).score,
		).toBe(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test evals/__tests__/scorers.test.ts`
Expected: FAIL — модуль `../scorers` не существует.

- [ ] **Step 3: Implement scorers**

`evals/scorers.ts`:

```ts
import { validateEnhancedPrompt } from "../src/lib/prompts/contract";
import {
	extractQuotedTexts,
	missingDetails,
	requestsText,
} from "../src/lib/prompts/style-hints";

interface PromptInput {
	prompt: string;
}

interface PromptOutput {
	prompt: string;
}

export function contractScorer({
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	const verdict = validateEnhancedPrompt(output.prompt);
	return {
		name: "contract",
		score: verdict.ok ? 1 : 0,
		metadata: { reason: verdict.reason ?? null },
	};
}

export function has42Scorer({
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	return { name: "has-42", score: /42/.test(output.prompt) ? 1 : 0 };
}

export function lengthBandScorer(min: number, max: number) {
	return ({ output }: { input: PromptInput; output: PromptOutput }) => {
		const words = output.prompt.split(/\s+/).filter(Boolean).length;
		return {
			name: "length-band",
			score: words >= min && words <= max ? 1 : 0,
			metadata: { words },
		};
	};
}

export function heroFirstScorer({
	input,
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	const missing = missingDetails(input.prompt, output.prompt);
	return {
		name: "hero-first",
		score: missing.length === 0 ? 1 : 0,
		metadata: { missing },
	};
}

export function noUnrequestedTextScorer({
	input,
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	// текст просили — цитаты допустимы; не просили — найденные цитаты минус
	if (requestsText(input.prompt)) return { name: "no-unrequested-text", score: 1 };
	const quotes = extractQuotedTexts(output.prompt);
	return {
		name: "no-unrequested-text",
		score: quotes.length === 0 ? 1 : 0,
		metadata: { quotes },
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test evals/__tests__/scorers.test.ts`
Expected: PASS (5 tests). Если `contractScorer` на промпте «x» даёт score 1 — уточнить пример в тесте под реальный невалидный вход (тест должен фиксировать поведение `validateEnhancedPrompt`, а не заменять его).

- [ ] **Step 5: Implement `evals/style42.eval.ts`**

```ts
import { Eval, initDataset } from "braintrust";
import { enhancePrompt } from "../src/lib/enhance";
import { STYLE_VERSION } from "../src/lib/prompts";
import { initTracing } from "../src/lib/tracing";
import {
	contractScorer,
	has42Scorer,
	heroFirstScorer,
	lengthBandScorer,
	noUnrequestedTextScorer,
} from "./scorers";

initTracing();

interface Style42Input {
	prompt: string;
}

Eval<Style42Input, Awaited<ReturnType<typeof enhancePrompt>>>("Gen42", {
	experiment: `style42-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
	data: initDataset("Gen42", { dataset: "style42-prompts" }),
	task: async (input) => {
		const result = await enhancePrompt(input.prompt);
		return result;
	},
	scores: [
		contractScorer,
		has42Scorer,
		heroFirstScorer,
		noUnrequestedTextScorer,
		lengthBandScorer(180, 320),
	],
	metadata: { style_version: STYLE_VERSION },
	maxConcurrency: 2,
});
```

Внимание: скореры ожидают `output.prompt`; выход задачи — весь `EnhanceResult` (в нём `prompt`, `fallback`, `durationMs`, токены, `styleVersion`) — метрики прогона видны в output эксперимента. Скорерам передаётся объект — они читают `output.prompt`; в `scorers.ts` тип `PromptOutput` уже покрывает это структурно.

- [ ] **Step 6: Smoke запуска**

Run: `bt eval evals/style42.eval.ts --first 2 --no-input` (официальный smoke-режим CLI)
Expected: прогон двух запросов, сводка со ссылкой на эксперимент; в проекте `Gen42` появляется эксперимент `style42-*` с колонками скореров. Если `bt eval` не запускает файл под Bun — официальный фолбэк: `node_modules/.bin/bun evals/style42.eval.ts` (эксперимент создаёт `Eval()`), способ запуска зафиксировать в `package.json`.

- [ ] **Step 7: Commit**

```bash
git add evals/scorers.ts evals/style42.eval.ts evals/__tests__/scorers.test.ts
git commit -m "Eval style42: официальный формат Braintrust со скорерами стиля"
```

---

### Task 4: `evals/turbo.eval.ts`

**Files:**
- Create: `evals/turbo.eval.ts`

**Interfaces:**
- Consumes: логика прогона из `scripts/eval-turbo.ts` (подготовка системы `buildTurboSystem`, `buildAgentMessage`, `systemVersionOf`, библиотека `Library` из `src/lib/storage`, агент `createTurboAgent`/`runTurboAgent`), скореры из Task 3, датасет `turbo-prompts`.
- Produces: eval-файл с задачей «прогон агента без рисования»; выход `{ prompt, tokens, seconds, randomPicks, inputImages, model, reasoning }`; настройка `TURBO_EVAL_MODEL`/`TURBO_EVAL_REASONING` сохраняется.

- [ ] **Step 1: Implement `evals/turbo.eval.ts`**

```ts
import { Eval, initDataset } from "braintrust";
import { listObjects, readObject } from "../src/lib/storage";
import { buildAgentMessage, systemVersionOf } from "../src/lib/turbo/agent";
import { createTurboAgent, runTurboAgent } from "../src/lib/turbo/agent-definition";
import { CodexAgentModel } from "../src/lib/turbo/codex-agent-model";
import { codexFetch, createCodexAuth } from "../src/lib/turbo/codex-auth";
import { Library } from "../src/lib/turbo/library";
import { buildTurboSystem } from "../src/lib/prompts/turbo.system";
import { parseTurboReasoning } from "../src/lib/turbo/reasoning";
import { initTracing } from "../src/lib/tracing";
import { has42Scorer, heroFirstScorer, lengthBandScorer, noUnrequestedTextScorer } from "./scorers";

initTracing();

const library = new Library({ list: listObjects, read: readObject });
const agentModelId = process.env.TURBO_EVAL_MODEL ?? "gpt-6-luna";
const reasoning = parseTurboReasoning(process.env.TURBO_EVAL_REASONING ?? "high");

interface TurboInput {
	prompt: string;
}

Eval<TurboInput, { prompt: string; tokens: number | null; seconds: number; randomPicks: unknown[]; inputImages: string[]; model: string; reasoning: string }>(
	"Gen42",
	{
		experiment: `turbo-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
		data: initDataset("Gen42", { dataset: "turbo-prompts" }),
		task: async (input) => {
			const started = Date.now();
			const tree = await library.tree();
			const system = buildTurboSystem(tree);
			const agent = createTurboAgent({
				system,
				reasoning,
				modelFactory: (id) =>
					new CodexAgentModel(createCodexAuth(), id),
				// executors-шаги библиотеки берутся как в scripts/eval-turbo.ts
			});
			const run = await runTurboAgent(agent, buildAgentMessage(input.prompt, null, systemVersionOf(system)));
			return {
				prompt: run.accepted?.prompt ?? "",
				tokens: run.tokens ?? null,
				seconds: Math.round((Date.now() - started) / 1000),
				randomPicks: run.randomPicks,
				inputImages: run.accepted?.images ?? [],
				model: agentModelId,
				reasoning,
			};
		},
		scores: [has42Scorer, heroFirstScorer, noUnrequestedTextScorer, lengthBandScorer(500, 950)],
		metadata: { model: agentModelId, reasoning },
		maxConcurrency: 1,
	},
);
```

Конкретные имена аргументов `createTurboAgent`/`runTurboAgent`/`buildAgentMessage` и способ подключения executors взять из текущего `scripts/eval-turbo.ts` (они там уже собраны) — перенести вызовы один в один, заменив JSONL-запись на return. `parseTurboReasoning` — из `src/lib/turbo/reasoning.ts` (сигнатуру проверить по файлу).

- [ ] **Step 2: Smoke запуска**

Run: `bt eval evals/turbo.eval.ts --first 1 --no-input`
Expected: один прогон агента, эксперимент `turbo-*` со скорерами и метриками в output; ошибка агента не валит весь прогон (ошибка прогона попадает в строку результата).

- [ ] **Step 3: Commit**

```bash
git add evals/turbo.eval.ts
git commit -m "Eval turbo: официальный формат Braintrust, прогон агента без рисования"
```

---

### Task 5: Удаление старого, контракт ключа, документация

**Files:**
- Delete: `scripts/eval-style42.ts`, `scripts/eval-turbo.ts`
- Modify: `package.json`, `AGENTS.md`, `README.md`, `.env.example`
- Test: финальные проверки

**Interfaces:**
- Consumes: Task 1–4.
- Produces: единый путь запуска evals (`bt eval evals/`), обновлённая документация, зелёные проверки.

- [ ] **Step 1: Удалить самописные скрипты и вычистить package.json**

Удалить `scripts/eval-style42.ts` и `scripts/eval-turbo.ts`. В `package.json` заменить скрипты запуска evals на официальные:

```json
"eval:style42": "bt eval evals/style42.eval.ts",
"eval:turbo": "bt eval evals/turbo.eval.ts"
```

(Если smoke показал несовместимость `bt eval` с Bun — команды указывают способ, который зафиксирован в Task 3/4.)

- [ ] **Step 2: Обновить документацию**

`AGENTS.md`: разделы про `scripts/eval-*.ts` и `logEvalRun` заменить на «Evals — официальный формат Braintrust»: файлы `evals/*.eval.ts`, датасеты `style42-prompts`/`turbo-prompts` (источник — `evals/data/*.json`, наполнение `bt datasets create/update --file`), скореры `evals/scorers.ts`, запуск `bt eval evals/` (или `bt eval --first N` для smoke), контракт ключа: без `BRAINTRUST_API_KEY` работа невозможна. `README.md` и `.env.example`: убрать «без ключа работает без трассировки» → «ключ обязателен».

- [ ] **Step 3: Финальные проверки**

Run: `bun test && bun run typecheck && bun run build`
Expected: всё PASS; `grep -r "logEvalRun\|eval-style42.ts\|eval-turbo.ts" src scripts evals AGENTS.md README.md` — устаревших ссылок нет.

- [ ] **Step 4: Commit**

```bash
git add -A scripts evals package.json AGENTS.md README.md .env.example
git commit -m "Evals только через Braintrust: самописные скрипты упразднены"
```

---

## Self-review плана

- **Покрытие спеки:** контракт ключа (Task 1), датасеты (Task 2), eval-файлы и скореры (Task 3–4), удаление самописного и документация (Task 5), JSONL не пишутся (больше нигде не упоминаются). CI-раскладка `bt eval` в GitHub Actions из спеки помечена «следующим шагом» — вне плана осознанно.
- **Плейсхолдеров нет** — весь код приведён; два места ссылаются на существующий код как источник точных имён (`createTurboAgent`/`runTurboAgent` в Task 4, невалидный пример контракта в Task 3 Step 4) — это перенос существующей логики, не недописанный код.
- **Согласованность имён:** `initTracing`/`traceSpan` (Task 1), скореры `contractScorer`/`has42Scorer`/`lengthBandScorer`/`heroFirstScorer`/`noUnrequestedTextScorer` совпадают между Task 3 и 4; датасеты `style42-prompts`/`turbo-prompts` — между Task 2–4.
