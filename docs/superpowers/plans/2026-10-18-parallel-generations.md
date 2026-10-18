# Несколько генераций одновременно: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь запускает следующую генерацию, пока идёт прежняя: каждая в своей рамке, с потолком в 4 идущих; Krea 2 и Ideogram 4 работают воркфлоу Vercel Workflow и отвечают `202`, как «Ультра».

**Architecture:** `POST /api/generate` для любого движка создаёт строку `running`, списывает кредиты, стартует воркфлоу и сразу отвечает `202` (общий приём `startRun`). Воркфлоу Krea/Ideogram повторяет этапы нынешнего обработчика отдельными шагами (`enhance` → `generate` → `complete`/`fail`), цикл ротации ключей HF живёт в коде воркфлоу. Потолок идущих проверяется в `startGeneration` под advisory-замком. Страница хранит список запусков серии (чистый модуль `series.ts`), рисует рамку на каждый запуск и опрашивает все идущие одним циклом.

**Tech Stack:** Bun (`bun test`, `Bun.serve`), TypeScript strict, postgres.js, Vercel Workflow 5.1 (`workflow`, `workflow/api`), React 19, shadcn/ui, Playwright (`ui:check`).

**Spec:** `docs/superpowers/specs/2026-10-18-parallel-generations-design.md` (issue #33). Предыдущая спека, которую это отменяет в части «Krea и Ideogram остаются как есть»: `docs/superpowers/specs/2026-10-08-turbo-workflow-design.md`.

## Global Constraints

- Везде Bun вместо Node: `bun test`, `bun run <script>`; прямой запуск только `node_modules/.bin/bun файл.ts` (Bun 1.4.2). Разовые Python-скрипты только `uv run`.
- В `workflows/**` и `src/lib/**` не писать `import … from "bun"`; использовать глобальный `Bun.*`. В коде воркфлоу (`workflows/spaces/index.ts`) и в модулях, которые он импортирует (`src/lib/spaces/attempts.ts`, `run-error.ts`, `constants.ts`, `types.ts`), нет node-пакетов и обращений к внешнему миру: всё, что ходит в сеть, базу или хранилище, живёт в шагах.
- Видимого текста в интерфейсе не добавлять никогда: `src/lib/__tests__/ui-text.baseline.json` не меняется, тест `ui-text.test.ts` остаётся зелёным. Тексты ошибок сервера берутся из уже существующих строк (`TOO_MANY_REQUESTS_ERROR`, `ULTRA_PUBLIC_ERROR`, `publicGenerationError`).
- Любая правка фронтенда — по скиллу `shadcn` (канонические примитивы, `cn` из `@/lib/utils`, `gap-*` вместо `space-*`, иконки Tabler). Новых самописных аналогов shadcn-компонентов нет.
- Анимируются только `transform`, `translate`, `scale`, `rotate`, `opacity`; нового постоянного `requestAnimationFrame` и новых слоёв композитора сверх бюджета `ui:check` нет.
- Потолок идущих запусков на пользователя: **4** (`MAX_RUNNING_GENERATIONS`). Общий срок попыток HF-воркфлоу: **600 000 мс** (`SPACE_RUN_DEADLINE_MS`), попыток не больше **5** (`SPACE_MAX_ATTEMPTS`). Ожидание страницы остаётся `ULTRA_CLIENT_WAIT_MS` (15 минут), закрытие зависших `GENERATION_STALE_MS` (960 000 мс).
- Шаги `enhance` и `generate` с `maxRetries = 0` (каждый вызов расходует лимит ключа LLM или прогон ZeroGPU); `complete` и `fail` с повторами по умолчанию (запись идемпотентна по условию `status = 'running'`).
- Миграций БД нет, переменные окружения не меняются.
- Тесты запускаются адресно (`bun test <файл>`) для каждой новой единицы и один раз целиком в Task 10; тесты не способ отладки.
- Коммиты на ветке `feat/parallel-generations`, сообщение по-русски, в конце сообщения `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Перед коммитом: `bun run lint:fix`, `bun run lint`, `bun run typecheck` (каждая команда отдельным вызовом). Пуш, PR и preview только после явного «готово» владельца.
- Существующие файлы меняются через `Edit`, `Write` только для новых. Файлы вне `docs/superpowers/` и кода не удалять; `captures/` в коммит не класть.

---

## Структура файлов

Новые:

| Файл | Ответственность |
|---|---|
| `src/lib/generation-limits.ts` | `MAX_RUNNING_GENERATIONS`, `TOO_MANY_REQUESTS_ERROR`, `TooManyRunningError`; без зависимостей, читают сервер и страница |
| `src/lib/start-run.ts` | общий приём запуска любого движка: строка, списание, воркфлоу, `202`/`402`/`429`/`502` |
| `src/lib/spaces/constants.ts` | `SPACE_MAX_ATTEMPTS`, `SPACE_RUN_DEADLINE_MS` |
| `src/lib/spaces/types.ts` | `SpaceRunInput`, `AttemptInput`, `AttemptOutcome`, `AttemptSuccess`, `SpaceFailure` |
| `src/lib/spaces/run-error.ts` | `SpaceRunError`, `toSpaceFailure` (чистые, для кода воркфлоу) |
| `src/lib/spaces/attempts.ts` | `runWithRotation`: цикл попыток с ротацией ключей и сроком (чистый, для кода воркфлоу) |
| `src/lib/spaces/attempt.ts` | `runAttempt`: одна попытка Space (ключ, вызов, скачивание, хранилище, квота) через внедряемые зависимости |
| `src/lib/spaces/failure.ts` | `errorFromFailure`: данные сбоя → ошибка для `describeGenerationError` |
| `src/lib/spaces/request.ts` | `parseSpaceRequest`: тело запроса → нормализованные поля запуска |
| `src/lib/spaces/workflow-runtime.ts` | окружение шагов: `getSpacesRuntime`/`setSpacesRuntime` |
| `src/lib/spaces/start-deps.ts` | боевые зависимости приёма запуска (`start()` воркфлоу), импортирует только сервер |
| `workflows/spaces/steps.ts` | шаги `enhanceStep`, `generateStep`, `completeStep`, `failStep` |
| `workflows/spaces/index.ts` | `spaceImageWorkflow` |
| `src/lib/series.ts` | чистая логика серии запусков страницы |
| `src/lib/__tests__/helpers/spaces-fakes.ts` | фикстуры и `makeSpacesRuntime` для тестов |
| `src/lib/__tests__/start-run.test.ts`, `spaces-attempts.test.ts`, `spaces-attempt.test.ts`, `spaces-failure.test.ts`, `spaces-request.test.ts`, `spaces-steps.test.ts`, `spaces-workflow.test.ts`, `series.test.ts` | тесты |

Меняются: `src/lib/generations.ts`, `src/lib/ultra/start.ts`, `src/api/generate.ts`, `src/server.ts`, `src/components/Generate.tsx`, `scripts/ui-check.ts`, `src/lib/__tests__/generations.test.ts`, `src/lib/__tests__/ultra-budgets.test.ts`, `AGENTS.md`, `README.md` (если упоминает синхронную генерацию), обе спеки.

---

### Task 1: Потолок идущих запусков и список идущих

**Files:**
- Create: `src/lib/generation-limits.ts`
- Modify: `src/lib/generations.ts` (импорт; `startGeneration` строки 81–113; новая `listRunningGenerations` после `getActiveGeneration`)
- Modify: `src/api/generate.ts` (импорт `listRunningGenerations`; новый маршрут `/api/generations/running` перед `/api/generations/:id`)
- Modify: `src/server.ts` (регистрация маршрута)
- Test: `src/lib/__tests__/generations.test.ts`

**Interfaces:**
- Produces: `MAX_RUNNING_GENERATIONS: 4`; `TOO_MANY_REQUESTS_ERROR: string`; `class TooManyRunningError extends Error`; `listRunningGenerations(userId: string): Promise<GenerationRecord[]>`; `startGeneration(params)` теперь бросает `TooManyRunningError` до вставки строки; маршрут `GET /api/generations/running` → массив форм `generationJson`.

- [ ] **Step 1: Создать модуль лимитов**

`src/lib/generation-limits.ts`:

```ts
/**
 * Сколько генераций одного пользователя могут идти одновременно. Четыре рамки
 * ложатся в сетку 2×2 на странице; лимиты платформы такое число не требуют.
 * Модуль без зависимостей: его читают и сервер, и страница.
 */
export const MAX_RUNNING_GENERATIONS = 4;

/** Один текст отказа и при частых запросах, и при потолке идущих: новых строк для пользователя нет */
export const TOO_MANY_REQUESTS_ERROR =
	"Слишком много запросов, подождите минуту";

/** Потолок идущих генераций достигнут; `startGeneration` бросает её до вставки строки */
export class TooManyRunningError extends Error {
	constructor() {
		super("Too many running generations");
		this.name = "TooManyRunningError";
	}
}
```

- [ ] **Step 2: Написать падающие тесты**

В `src/lib/__tests__/generations.test.ts`: в импорты добавить

```ts
import {
	MAX_RUNNING_GENERATIONS,
	TooManyRunningError,
} from "../generation-limits";
```

в динамический импорт `../generations` добавить `listRunningGenerations`. Существующий тест «строка появляется до списания» ищет INSERT первым запросом, а теперь первыми идут закрытие зависших, замок и подсчёт, поэтому заменить в нём

```ts
		expect(queries()[0]).toContain("INSERT INTO generations");
		expect(queries()[0]).toContain("0, 'running'");
```

на

```ts
		const insert = queries().find((q) => q.includes("INSERT INTO generations"));
		expect(insert).toContain("0, 'running'");
```

После блока `describe("startGeneration", …)` добавить:

```ts
describe("потолок идущих генераций", () => {
	beforeEach(reset);

	test("перед вставкой берётся замок на пользователя, затем считаются идущие", async () => {
		responses = {
			"count(*)": [{ count: 1 }],
			"ON CONFLICT (id) DO NOTHING": [{ id: "gen-1" }],
		};
		await startGeneration({ ...BASE, id: "gen-1" });

		const order = queries();
		const lock = order.findIndex((q) => q.includes("pg_advisory_xact_lock"));
		const count = order.findIndex((q) => q.includes("count(*)"));
		const insert = order.findIndex((q) => q.includes("INSERT INTO generations"));
		expect(lock).toBeGreaterThanOrEqual(0);
		expect(lock).toBeLessThan(count);
		expect(count).toBeLessThan(insert);
		expect((mockSql as any).begin).toHaveBeenCalled();
	});

	test("на потолке запись не создаётся", async () => {
		responses = { "count(*)": [{ count: MAX_RUNNING_GENERATIONS }] };
		await expect(startGeneration(BASE)).rejects.toThrow(TooManyRunningError);
		expect(queries().some((q) => q.includes("INSERT INTO generations"))).toBe(
			false,
		);
	});

	test("на единицу ниже потолка запись создаётся", async () => {
		responses = {
			"count(*)": [{ count: MAX_RUNNING_GENERATIONS - 1 }],
			"ON CONFLICT (id) DO NOTHING": [{ id: "gen-1" }],
		};
		expect(await startGeneration({ ...BASE, id: "gen-1" })).toBe("gen-1");
	});

	test("зависшие закрываются до подсчёта", async () => {
		responses = {
			"count(*)": [{ count: 0 }],
			"ON CONFLICT (id) DO NOTHING": [{ id: "gen-1" }],
		};
		await startGeneration({ ...BASE, id: "gen-1" });

		const order = queries();
		const stale = order.findIndex((q) => q.includes("AND created_at <"));
		const count = order.findIndex((q) => q.includes("count(*)"));
		expect(stale).toBeGreaterThanOrEqual(0);
		expect(stale).toBeLessThan(count);
	});

	test("считаются идущие именно этого пользователя", async () => {
		responses = { "ON CONFLICT (id) DO NOTHING": [{ id: "gen-1" }] };
		await startGeneration({ ...BASE, id: "gen-1" });
		expect(paramsOf("count(*)")).toContain("u1");
	});
});
```

В `describe("чтение генераций", …)` после теста про `getActiveGeneration` добавить:

```ts
	test("listRunningGenerations отдаёт идущие записи пользователя", async () => {
		responses = {
			"ORDER BY created_at DESC": [row, { ...row, id: "gen-2" }],
		};
		const records = await listRunningGenerations("u1");
		expect(records.map((r) => r.id)).toEqual(["gen-1", "gen-2"]);
		expect(paramsOf("ORDER BY created_at DESC")).toContain("u1");
	});
```

- [ ] **Step 2b: Проверить, что тесты падают**

Run: `bun test src/lib/__tests__/generations.test.ts`
Expected: FAIL (`TooManyRunningError`/`listRunningGenerations` не определены или не экспортированы из `../generations`).

- [ ] **Step 3: Реализовать потолок в `generations.ts`**

В начало файла после импортов добавить:

```ts
import {
	MAX_RUNNING_GENERATIONS,
	TooManyRunningError,
} from "./generation-limits";
```

Заменить функцию `startGeneration` (вместе с её комментарием) целиком:

```ts
/**
 * Строка `running` появляется до списания кредитов и основной работы:
 * обновление страницы не должно терять процесс — он находится по этой строке.
 * `cost` строки равен списанным кредитам и остаётся нулём, пока списания нет.
 * Идущих у пользователя не больше `MAX_RUNNING_GENERATIONS`: подсчёт и вставка идут
 * в одной транзакции под замком на пользователя, поэтому два одновременных запуска
 * не проскакивают под потолок вместе (иначе бросает `TooManyRunningError`).
 * Возвращает фактический id записи.
 */
export async function startGeneration(
	params: StartGenerationParams,
): Promise<string> {
	// зависшие закрываются первыми: иначе они занимали бы место под потолком
	await resolveStaleGenerations(params.userId);

	return sql.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(hashtext(${params.userId}))`;
		const [counted] = await tx`
      SELECT count(*)::int AS count FROM generations
      WHERE user_id = ${params.userId} AND status = 'running'
    `;
		if (Number(counted?.count ?? 0) >= MAX_RUNNING_GENERATIONS) {
			throw new TooManyRunningError();
		}

		const insert = async (id: string): Promise<string | null> => {
			const rows = await tx`
      INSERT INTO generations
        (id, user_id, prompt, negative_prompt, model, width, height, steps,
         engine, cost, status)
      VALUES
        (${id}, ${params.userId}, ${params.prompt},
         ${params.negativePrompt ?? null}, ${params.model}, ${params.width},
         ${params.height}, ${params.steps}, ${params.engine}, 0, 'running')
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
			return rows.length > 0 ? id : null;
		};

		const preferred =
			params.id && CLIENT_ID_RE.test(params.id)
				? await insert(params.id)
				: null;
		if (preferred) return preferred;
		const fallback = await insert(crypto.randomUUID());
		if (!fallback) {
			throw new Error("Не удалось записать генерацию");
		}
		return fallback;
	});
}
```

Добавить в конец файла:

```ts
/** Все идущие генерации пользователя, свежие первыми (их не больше потолка) */
export async function listRunningGenerations(
	userId: string,
): Promise<GenerationRecord[]> {
	await resolveStaleGenerations(userId);
	const rows = await sql`
      SELECT id, user_id, prompt, engine, model, seed, width, height, steps,
             cost, image_key, status, error_message, duration_ms, created_at
      FROM generations
      WHERE user_id = ${userId} AND status = 'running'
      ORDER BY created_at DESC
      LIMIT ${MAX_RUNNING_GENERATIONS}
    `;
	return rows.map(toRecord);
}
```

- [ ] **Step 4: Маршрут `/api/generations/running`**

В `src/api/generate.ts` в импорт из `../lib/generations` добавить `listRunningGenerations`. Между блоками `"/api/generations/active"` и `"/api/generations/:id"` вставить:

```ts
	"/api/generations/running": {
		// все идущие генерации пользователя: страница восстанавливает серию рамок
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			const records = await listRunningGenerations(session.user.id);
			return Response.json(await Promise.all(records.map(generationJson)));
		},
	},
```

В `src/server.ts` после строки `"/api/generations/active": …` добавить:

```ts
		"/api/generations/running": generateRoutes["/api/generations/running"],
```

- [ ] **Step 5: Тесты проходят**

Run: `bun test src/lib/__tests__/generations.test.ts`
Expected: PASS (все тесты файла, включая прежние).

- [ ] **Step 6: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run typecheck`
Expected: без ошибок.

```bash
git add src/lib/generation-limits.ts src/lib/generations.ts src/api/generate.ts src/server.ts src/lib/__tests__/generations.test.ts
git commit -m "$(cat <<'EOF'
Потолок идущих генераций (4 на пользователя) и список идущих

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Общий приём запуска

**Files:**
- Create: `src/lib/start-run.ts`
- Modify: `src/lib/ultra/start.ts` (целиком, поведение не меняется)
- Test: `src/lib/__tests__/start-run.test.ts`; прежний `src/lib/__tests__/ultra-start.test.ts` остаётся без правок и должен пройти

**Interfaces:**
- Consumes: `InsufficientCreditsError` (`../credits`), `TooManyRunningError`, `TOO_MANY_REQUESTS_ERROR` (Task 1), `ULTRA_PUBLIC_ERROR` (`./ultra/errors`), `ImageEngine` (`./models`).
- Produces:
  - `interface StartRunDeps { startRecord(): Promise<string>; chargeCredits(p: { id: string; userId: string; cost: number }): Promise<void>; startWorkflow(id: string): Promise<void>; failRecord(p: { id: string; error: unknown; durationMs: number }): Promise<void>; now(): number }`
  - `type StartRunOutcome = { status: 202; body: { id: string; engine: ImageEngine; cost: number } } | { status: 402 | 429 | 502; body: { error: string } }`
  - `startRun(input: { userId: string; engine: ImageEngine; cost: number }, deps: StartRunDeps): Promise<StartRunOutcome>`
  - `startUltra` и `StartUltraDeps` с прежними сигнатурами.

- [ ] **Step 1: Написать падающий тест**

`src/lib/__tests__/start-run.test.ts`:

```ts
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { InsufficientCreditsError } from "../credits";
import {
	TOO_MANY_REQUESTS_ERROR,
	TooManyRunningError,
} from "../generation-limits";
import { type StartRunDeps, startRun } from "../start-run";
import { ULTRA_PUBLIC_ERROR } from "../ultra/errors";

function makeDeps(overrides: Partial<StartRunDeps> = {}) {
	let clock = 1_000;
	const defaults = {
		startRecord: mock(async () => "gen-1"),
		chargeCredits: mock(
			async (_p: { id: string; userId: string; cost: number }) => {},
		),
		startWorkflow: mock(async (_id: string) => {}),
		failRecord: mock(
			async (_p: { id: string; error: unknown; durationMs: number }) => {},
		),
		now: () => (clock += 500),
	};
	return { ...defaults, ...overrides } as typeof defaults;
}

const INPUT = { userId: "u1", engine: "krea" as const, cost: 1 };

describe("startRun", () => {
	beforeEach(() => {
		spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		mock.restore();
	});

	test("успех: строка, списание, воркфлоу, ответ 202 с движком и ценой", async () => {
		const deps = makeDeps();

		const outcome = await startRun(INPUT, deps);

		expect(deps.chargeCredits).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			cost: 1,
		});
		expect(deps.startWorkflow).toHaveBeenCalledWith("gen-1");
		expect(outcome).toEqual({
			status: 202,
			body: { id: "gen-1", engine: "krea", cost: 1 },
		});
		expect(deps.failRecord).not.toHaveBeenCalled();
	});

	test("потолок идущих: 429 текстом лимита запросов, закрывать и списывать нечего", async () => {
		const deps = makeDeps({
			startRecord: mock(async () => {
				throw new TooManyRunningError();
			}),
		});

		const outcome = await startRun(INPUT, deps);

		expect(outcome).toEqual({
			status: 429,
			body: { error: TOO_MANY_REQUESTS_ERROR },
		});
		expect(deps.chargeCredits).not.toHaveBeenCalled();
		expect(deps.startWorkflow).not.toHaveBeenCalled();
		expect(deps.failRecord).not.toHaveBeenCalled();
	});

	test("мало кредитов: 402, строка закрыта, воркфлоу не стартует", async () => {
		const deps = makeDeps({
			chargeCredits: mock(async () => {
				throw new InsufficientCreditsError();
			}),
		});

		const outcome = await startRun(INPUT, deps);

		expect(outcome).toEqual({
			status: 402,
			body: { error: "Недостаточно кредитов" },
		});
		expect(deps.startWorkflow).not.toHaveBeenCalled();
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
	});

	test("сбой старта воркфлоу после списания: возврат и общее сообщение", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
		});

		const outcome = await startRun(INPUT, deps);

		expect(outcome).toEqual({ status: 502, body: { error: ULTRA_PUBLIC_ERROR } });
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
		expect(deps.failRecord.mock.calls[0]![0]).toMatchObject({ id: "gen-1" });
	});

	test("сбой закрытия строки не подменяет ответ", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
			failRecord: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		expect((await startRun(INPUT, deps)).status).toBe(502);
	});
});
```

- [ ] **Step 2: Тест падает**

Run: `bun test src/lib/__tests__/start-run.test.ts`
Expected: FAIL (`../start-run` не найден).

- [ ] **Step 3: Реализовать `startRun`**

`src/lib/start-run.ts`:

```ts
import { InsufficientCreditsError } from "./credits";
import {
	TOO_MANY_REQUESTS_ERROR,
	TooManyRunningError,
} from "./generation-limits";
import type { ImageEngine } from "./models";
import { ULTRA_PUBLIC_ERROR } from "./ultra/errors";

export interface StartRunDeps {
	/** Строка `running` до списания; бросает `TooManyRunningError` на потолке идущих */
	startRecord(): Promise<string>;
	/** Списание за генерацию; бросает InsufficientCreditsError при нехватке */
	chargeCredits(params: {
		id: string;
		userId: string;
		cost: number;
	}): Promise<void>;
	startWorkflow(id: string): Promise<void>;
	/** Закрывает строку и возвращает кредиты одной транзакцией */
	failRecord(params: {
		id: string;
		error: unknown;
		durationMs: number;
	}): Promise<void>;
	now(): number;
}

export type StartRunOutcome =
	| {
			status: 202;
			body: { id: string; engine: ImageEngine; cost: number };
	  }
	| { status: 402 | 429 | 502; body: { error: string } };

async function safely(label: string, action: () => Promise<void>) {
	try {
		await action();
	} catch (error) {
		console.error(`${label}:`, error);
	}
}

/**
 * Принимает запуск любого движка в работу: строка `running`, списание, старт
 * воркфлоу. Картинку делает воркфлоу; страница ждёт её опросом
 * `/api/generations/:id`. Сбой после создания строки закрывает её с возвратом
 * кредитов.
 */
export async function startRun(
	input: { userId: string; engine: ImageEngine; cost: number },
	deps: StartRunDeps,
): Promise<StartRunOutcome> {
	const { userId, engine, cost } = input;
	const started = deps.now();
	let id = "";

	try {
		id = await deps.startRecord();
		await deps.chargeCredits({ id, userId, cost });
		await deps.startWorkflow(id);
		return { status: 202, body: { id, engine, cost } };
	} catch (error) {
		if (id) {
			// запись закрывает строку и возвращает кредиты одной транзакцией; если она не
			// удалась, это сделает ленивое закрытие зависших
			await safely("Не удалось записать неуспешный запуск", () =>
				deps.failRecord({ id, error, durationMs: deps.now() - started }),
			);
		}
		if (error instanceof TooManyRunningError) {
			return { status: 429, body: { error: TOO_MANY_REQUESTS_ERROR } };
		}
		if (error instanceof InsufficientCreditsError) {
			return { status: 402, body: { error: "Недостаточно кредитов" } };
		}
		console.error("Run start error:", error);
		return { status: 502, body: { error: ULTRA_PUBLIC_ERROR } };
	}
}
```

- [ ] **Step 4: `startUltra` делегирует `startRun`**

`src/lib/ultra/start.ts` заменить целиком:

```ts
import { ULTRA_MODEL } from "../models";
import { type StartRunOutcome, startRun } from "../start-run";
import { ULTRA_DEFAULT_REASONING, type UltraReasoning } from "./reasoning";

export interface StartUltraDeps {
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
		reasoning: UltraReasoning;
	}): Promise<void>;
	/** Закрывает строку и возвращает кредиты одной транзакцией */
	failRecord(params: {
		id: string;
		error: unknown;
		durationMs: number;
	}): Promise<void>;
	now(): number;
}

export type StartUltraOutcome = StartRunOutcome;

/**
 * Принимает запуск «Ультры» в работу: строка `running`, списание, старт воркфлоу
 * (общий приём `startRun`). Картинку делает воркфлоу; страница ждёт её опросом
 * `/api/generations/:id`.
 */
export function startUltra(
	input: {
		userId: string;
		prompt: string;
		id?: string;
		reasoning?: UltraReasoning;
	},
	deps: StartUltraDeps,
): Promise<StartUltraOutcome> {
	const { userId, prompt } = input;
	// уровень записывается во вход воркфлоу явно: прогон не зависит от того, что
	// станет умолчанием позже
	const reasoning = input.reasoning ?? ULTRA_DEFAULT_REASONING;
	return startRun(
		{ userId, engine: "ultra", cost: ULTRA_MODEL.cost },
		{
			startRecord: () =>
				deps.startRecord({
					...(input.id ? { id: input.id } : {}),
					userId,
					prompt,
				}),
			chargeCredits: (params) => deps.chargeCredits(params),
			startWorkflow: (id) =>
				deps.startWorkflow({ id, userId, prompt, reasoning }),
			failRecord: (params) => deps.failRecord(params),
			now: () => deps.now(),
		},
	);
}
```

- [ ] **Step 5: Тесты проходят (новые и прежние «Ультры»)**

Run: `bun test src/lib/__tests__/start-run.test.ts`
Run: `bun test src/lib/__tests__/ultra-start.test.ts`
Expected: PASS оба файла.

- [ ] **Step 6: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run typecheck`

```bash
git add src/lib/start-run.ts src/lib/ultra/start.ts src/lib/__tests__/start-run.test.ts
git commit -m "$(cat <<'EOF'
Общий приём запуска генерации: startRun для всех движков

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Логика Space-движков: попытка, ротация ключей, сроки

**Files:**
- Create: `src/lib/spaces/constants.ts`, `types.ts`, `run-error.ts`, `attempts.ts`, `attempt.ts`, `failure.ts`, `request.ts`
- Modify: `src/lib/__tests__/ultra-budgets.test.ts`
- Test: `src/lib/__tests__/spaces-attempts.test.ts`, `spaces-attempt.test.ts`, `spaces-failure.test.ts`, `spaces-request.test.ts`

**Interfaces:**
- Consumes: `KeyExhaustedError`, `QueueTimeoutError`, `generateImage` (`../hf`), `AllKeysExhaustedError`, `ApiKeyRow` (`../keys`), `imageExtension` (`../image-format`), `IDEOGRAM_MODE`, `IDEOGRAM_STEPS`, `SpaceEngine`, `IMAGE_MODELS` (`../models`).
- Produces:
  - `SPACE_MAX_ATTEMPTS = 5`, `SPACE_RUN_DEADLINE_MS = 600_000`.
  - `SpaceRunInput`, `AttemptInput`, `AttemptSuccess`, `AttemptOutcome`, `SpaceFailure` (определения в Step 1).
  - `class SpaceRunError(code: "all_keys_exhausted" | "error", message: string, apiKeyId?: string | null)`; `toSpaceFailure(error: unknown): SpaceFailure`.
  - `runWithRotation(attempt: (excludeKeyIds: string[]) => Promise<AttemptOutcome>, options: { startedAt: number; now: () => number; maxAttempts?: number; deadlineMs?: number }): Promise<AttemptSuccess>`.
  - `interface AttemptDeps`, `runAttempt(deps: AttemptDeps, input: AttemptInput): Promise<AttemptOutcome>`.
  - `errorFromFailure(failure: SpaceFailure): Error`.
  - `interface SpaceRequest`, `parseSpaceRequest(body: Record<string, unknown>, engine: SpaceEngine): SpaceRequest`.

- [ ] **Step 1: Константы, типы, ошибка запуска**

`src/lib/spaces/constants.ts`:

```ts
/** Сколько попыток Space (с ротацией ключей HF) делает один запуск */
export const SPACE_MAX_ATTEMPTS = 5;
/**
 * Новые попытки не стартуют позже этого срока от начала воркфлоу. Попытка, начатая
 * на последней минуте, идёт до таймаута опроса Space (до 180 с), поэтому худший
 * прогон около 13–14 минут: порядок «прогон < ожидание страницы < закрытие
 * зависших» проверяет `ultra-budgets.test.ts`.
 */
export const SPACE_RUN_DEADLINE_MS = 600_000;
```

`src/lib/spaces/types.ts`:

```ts
import type { SpaceEngine } from "../models";

/** Вход воркфлоу Krea 2 / Ideogram 4: только сериализуемое */
export interface SpaceRunInput {
	id: string;
	userId: string;
	engine: SpaceEngine;
	prompt: string;
	negativePrompt?: string;
	model: "Turbo" | "Raw";
	width: number;
	height: number;
	steps: number;
	seed: number | null;
}

/** Вход шага `generate`: одна попытка */
export interface AttemptInput {
	userId: string;
	engine: SpaceEngine;
	/** Промпт после обогащения */
	prompt: string;
	negativePrompt?: string;
	model: "Turbo" | "Raw";
	width: number;
	height: number;
	steps: number;
	seed: number | null;
	/** Ключи HF, исчерпавшиеся в этом запуске: в попытке не участвуют */
	excludeKeyIds: string[];
}

export interface AttemptSuccess {
	ok: true;
	/** Ключ картинки в хранилище; байты по журналу воркфлоу не ходят */
	imageKey: string;
	seed: number;
	apiKeyId: string;
	durationMs: number;
}

/**
 * Исход попытки как данные: свойства ошибок не переживают границу шага, поэтому
 * причина едет значением, а решение (повторить, взять другой ключ, сдаться)
 * принимает код воркфлоу.
 */
export type AttemptOutcome =
	| AttemptSuccess
	| { ok: false; reason: "no_keys" }
	| {
			ok: false;
			reason: "key_exhausted";
			keyId: string;
			status: number;
			message: string;
	  }
	| { ok: false; reason: "queue_timeout"; keyId: string; message: string }
	| { ok: false; reason: "error"; keyId: string | null; message: string };

/** Итоговый сбой запуска для шага `fail` */
export interface SpaceFailure {
	code: "all_keys_exhausted" | "error";
	message: string;
	apiKeyId: string | null;
}
```

`src/lib/spaces/run-error.ts`:

```ts
import type { SpaceFailure } from "./types";

/** Сбой запуска Space, брошенный кодом воркфлоу: код и ключ HF для записи истории */
export class SpaceRunError extends Error {
	constructor(
		readonly code: SpaceFailure["code"],
		message: string,
		readonly apiKeyId: string | null = null,
	) {
		super(message);
		this.name = "SpaceRunError";
	}
}

/** Что угодно, пойманное воркфлоу, превращает в данные для шага `fail` */
export function toSpaceFailure(error: unknown): SpaceFailure {
	if (error instanceof SpaceRunError) {
		return {
			code: error.code,
			message: error.message,
			apiKeyId: error.apiKeyId,
		};
	}
	return {
		code: "error",
		message: error instanceof Error ? error.message : String(error),
		apiKeyId: null,
	};
}
```

- [ ] **Step 2: Падающие тесты ротации**

`src/lib/__tests__/spaces-attempts.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import { runWithRotation } from "../spaces/attempts";
import { SpaceRunError } from "../spaces/run-error";
import type { AttemptOutcome } from "../spaces/types";

const OK: AttemptOutcome = {
	ok: true,
	imageKey: "generations/u1/1.png",
	seed: 7,
	apiKeyId: "k2",
	durationMs: 5,
};
const exhausted = (keyId: string): AttemptOutcome => ({
	ok: false,
	reason: "key_exhausted",
	keyId,
	status: 429,
	message: "quota",
});
const queueTimeout = (keyId: string): AttemptOutcome => ({
	ok: false,
	reason: "queue_timeout",
	keyId,
	message: "queue",
});

/** Часы, которые не уходят вперёд, пока тест сам их не сдвинет */
const frozen = (at = 0) => ({ startedAt: at, now: () => at });

/** Последовательность исходов: каждый вызов берёт следующий */
function sequence(...outcomes: AttemptOutcome[]) {
	let index = 0;
	return mock(async (_exclude: string[]) => outcomes[index++]!);
}

async function failureOf(promise: Promise<unknown>): Promise<SpaceRunError> {
	return promise.then(
		() => {
			throw new Error("ожидался сбой");
		},
		(error) => error as SpaceRunError,
	);
}

describe("runWithRotation", () => {
	test("успех с первой попытки", async () => {
		const attempt = sequence(OK);
		expect(await runWithRotation(attempt, frozen())).toEqual(OK);
		expect(attempt).toHaveBeenCalledTimes(1);
		expect(attempt.mock.calls[0]![0]).toEqual([]);
	});

	test("исчерпанный ключ исключается из следующей попытки", async () => {
		const attempt = sequence(exhausted("k1"), OK);
		await runWithRotation(attempt, frozen());
		expect(attempt.mock.calls[1]![0]).toEqual(["k1"]);
	});

	test("таймаут очереди: тот же ключ годится снова", async () => {
		const attempt = sequence(queueTimeout("k1"), OK);
		await runWithRotation(attempt, frozen());
		expect(attempt.mock.calls[1]![0]).toEqual([]);
	});

	test("нет ключей: сбой all_keys_exhausted без повторов", async () => {
		const attempt = sequence({ ok: false, reason: "no_keys" });
		const error = await failureOf(runWithRotation(attempt, frozen()));
		expect(error).toBeInstanceOf(SpaceRunError);
		expect(error.code).toBe("all_keys_exhausted");
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	test("прочая ошибка: сбой error с ключом HF, без повторов", async () => {
		const attempt = sequence({
			ok: false,
			reason: "error",
			keyId: "k1",
			message: "сломалось",
		});
		const error = await failureOf(runWithRotation(attempt, frozen()));
		expect(error.code).toBe("error");
		expect(error.message).toBe("сломалось");
		expect(error.apiKeyId).toBe("k1");
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	test("пять неудачных попыток подряд: all_keys_exhausted", async () => {
		const attempt = sequence(
			queueTimeout("k1"),
			queueTimeout("k1"),
			queueTimeout("k1"),
			queueTimeout("k1"),
			queueTimeout("k1"),
		);
		const error = await failureOf(runWithRotation(attempt, frozen()));
		expect(error.code).toBe("all_keys_exhausted");
		expect(attempt).toHaveBeenCalledTimes(5);
	});

	test("после срока новые попытки не стартуют", async () => {
		const attempt = sequence(OK);
		const error = await failureOf(
			runWithRotation(attempt, {
				startedAt: 1_000,
				now: () => 1_000 + 600_000,
			}),
		);
		expect(error.code).toBe("all_keys_exhausted");
		expect(attempt).not.toHaveBeenCalled();
	});

	test("срок проверяется перед каждой попыткой", async () => {
		let now = 0;
		const attempt = mock(async (_exclude: string[]) => {
			now += 400_000;
			return queueTimeout("k1");
		});
		const error = await failureOf(
			runWithRotation(attempt, { startedAt: 0, now: () => now }),
		);
		expect(error.code).toBe("all_keys_exhausted");
		// после двух попыток прошло 800 с > 600 с
		expect(attempt).toHaveBeenCalledTimes(2);
	});
});
```

Run: `bun test src/lib/__tests__/spaces-attempts.test.ts`
Expected: FAIL (`../spaces/attempts` не найден).

- [ ] **Step 3: Реализовать ротацию**

`src/lib/spaces/attempts.ts`:

```ts
import { SPACE_MAX_ATTEMPTS, SPACE_RUN_DEADLINE_MS } from "./constants";
import { SpaceRunError } from "./run-error";
import type { AttemptOutcome, AttemptSuccess } from "./types";

export interface RotationOptions {
	/** Начало воркфлоу по его часам */
	startedAt: number;
	now: () => number;
	maxAttempts?: number;
	deadlineMs?: number;
}

/**
 * Цикл попыток Space с ротацией ключей HF (код воркфлоу, детерминированный):
 * `key_exhausted` исключает ключ, `queue_timeout` повторяет тот же ключ, нет
 * ключей или прочая ошибка завершают запуск. Новые попытки не стартуют после срока.
 * Исчерпание попыток и срока даёт `all_keys_exhausted`, как у прежнего обработчика.
 */
export async function runWithRotation(
	attempt: (excludeKeyIds: string[]) => Promise<AttemptOutcome>,
	options: RotationOptions,
): Promise<AttemptSuccess> {
	const maxAttempts = options.maxAttempts ?? SPACE_MAX_ATTEMPTS;
	const deadlineMs = options.deadlineMs ?? SPACE_RUN_DEADLINE_MS;
	const exhausted: string[] = [];

	for (let n = 0; n < maxAttempts; n++) {
		if (options.now() - options.startedAt >= deadlineMs) break;
		const outcome = await attempt([...exhausted]);
		if (outcome.ok) return outcome;
		if (outcome.reason === "no_keys") break;
		if (outcome.reason === "error") {
			throw new SpaceRunError("error", outcome.message, outcome.keyId);
		}
		if (outcome.reason === "key_exhausted") exhausted.push(outcome.keyId);
	}
	throw new SpaceRunError("all_keys_exhausted", "All API keys exhausted");
}
```

Run: `bun test src/lib/__tests__/spaces-attempts.test.ts`
Expected: PASS.

- [ ] **Step 4: Падающие тесты одной попытки**

`src/lib/__tests__/spaces-attempt.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import { KeyExhaustedError, QueueTimeoutError } from "../hf";
import { AllKeysExhaustedError } from "../keys";
import { type AttemptDeps, runAttempt } from "../spaces/attempt";
import type { AttemptInput } from "../spaces/types";

const KEY = { id: "hf-1", name: "основной", key: "hf_secret" };
const INPUT: AttemptInput = {
	userId: "u1",
	engine: "krea",
	prompt: "A pug on a throne",
	model: "Turbo",
	width: 1024,
	height: 1024,
	steps: 8,
	seed: null,
	excludeKeyIds: ["hf-0"],
};

function makeDeps(overrides: Partial<AttemptDeps> = {}) {
	let clock = 1_700_000_000_000;
	const defaults = {
		getAvailableKey: mock(async (_o: { excludeIds: string[] }) => KEY),
		generateImage: mock(async (_p: unknown, _k: string) => ({
			imageUrl: "https://img.test/1.webp",
			seed: 77,
		})),
		refreshQuota: mock(
			async (_key: { id: string; key: string }, _lastError?: string) => {},
		),
		download: mock(async (_url: string) => ({
			bytes: new Uint8Array([1, 2, 3]),
			contentType: "image/webp",
		})),
		store: mock(async (_k: string, _b: Uint8Array, _t: string) => {}),
		now: () => (clock += 1000),
	};
	return { ...defaults, ...overrides } as typeof defaults;
}

describe("runAttempt", () => {
	test("успех: ключ HF, Space, скачивание, хранилище, квота", async () => {
		const deps = makeDeps();

		const outcome = await runAttempt(deps, INPUT);

		expect(deps.getAvailableKey).toHaveBeenCalledWith({ excludeIds: ["hf-0"] });
		expect(deps.generateImage.mock.calls[0]![1]).toBe("hf_secret");
		expect(deps.generateImage.mock.calls[0]![0]).toMatchObject({
			engine: "krea",
			prompt: "A pug on a throne",
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
		});
		expect(deps.download).toHaveBeenCalledWith("https://img.test/1.webp");
		expect(outcome).toMatchObject({
			ok: true,
			seed: 77,
			apiKeyId: "hf-1",
		});
		// ключ объекта: пользователь, время по часам попытки, расширение по типу
		const stored = deps.store.mock.calls[0]!;
		expect(stored[0]).toMatch(/^generations\/u1\/\d+\.webp$/);
		expect(stored[2]).toBe("image/webp");
		expect((outcome as { imageKey: string }).imageKey).toBe(stored[0]);
		expect(deps.refreshQuota).toHaveBeenCalledTimes(1);
	});

	test("нет доступных ключей: no_keys", async () => {
		const deps = makeDeps({
			getAvailableKey: mock(async () => {
				throw new AllKeysExhaustedError();
			}),
		});
		expect(await runAttempt(deps, INPUT)).toEqual({
			ok: false,
			reason: "no_keys",
		});
		expect(deps.generateImage).not.toHaveBeenCalled();
	});

	test("квота исчерпана: key_exhausted со статусом, квота ключа обновляется с текстом ошибки", async () => {
		const deps = makeDeps({
			generateImage: mock(async () => {
				throw new KeyExhaustedError(429, "ZeroGPU quota exceeded");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "key_exhausted",
			keyId: "hf-1",
			status: 429,
			message: "ZeroGPU quota exceeded",
		});
		expect(deps.refreshQuota).toHaveBeenCalledWith(KEY, "ZeroGPU quota exceeded");
		expect(deps.store).not.toHaveBeenCalled();
	});

	test("таймаут очереди: queue_timeout, квота обновляется", async () => {
		const deps = makeDeps({
			generateImage: mock(async () => {
				throw new QueueTimeoutError("ZeroGPU queue: no gpu");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "queue_timeout",
			keyId: "hf-1",
			message: "ZeroGPU queue: no gpu",
		});
		expect(deps.refreshQuota).toHaveBeenCalledWith(KEY, "ZeroGPU queue: no gpu");
	});

	test("прочая ошибка после выбора ключа: error с ключом, квота обновляется", async () => {
		const deps = makeDeps({
			download: mock(async () => {
				throw new Error("Не удалось скачать изображение: 500");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "error",
			keyId: "hf-1",
			message: "Не удалось скачать изображение: 500",
		});
		expect(deps.refreshQuota).toHaveBeenCalledWith(KEY);
	});

	test("ошибка до выбора ключа: error без ключа, квота не трогается", async () => {
		const deps = makeDeps({
			getAvailableKey: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "error",
			keyId: null,
			message: "база недоступна",
		});
		expect(deps.refreshQuota).not.toHaveBeenCalled();
	});
});
```

Run: `bun test src/lib/__tests__/spaces-attempt.test.ts`
Expected: FAIL (`../spaces/attempt` не найден).

- [ ] **Step 5: Реализовать попытку**

`src/lib/spaces/attempt.ts`:

```ts
import type { generateImage } from "../hf";
import { KeyExhaustedError, QueueTimeoutError } from "../hf";
import { imageExtension } from "../image-format";
import type { ApiKeyRow } from "../keys";
import { AllKeysExhaustedError } from "../keys";
import type { AttemptInput, AttemptOutcome } from "./types";

type HfKey = Pick<ApiKeyRow, "id" | "name" | "key">;

/** Внешний мир одной попытки; боевые реализации собирает `workflow-runtime.ts`, тесты подставляют свои */
export interface AttemptDeps {
	getAvailableKey(options: { excludeIds: string[] }): Promise<HfKey>;
	generateImage: typeof generateImage;
	/** Обновляет квоту ключа после использования; сбой не должен ломать попытку */
	refreshQuota(key: HfKey, lastError?: string): Promise<void>;
	download(url: string): Promise<{ bytes: Uint8Array; contentType: string }>;
	/** Картинка и превью в хранилище */
	store(imageKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
	now(): number;
}

/**
 * Одна попытка: ключ HF → Space → скачивание → хранилище → квота. Все исходы,
 * включая отказы, возвращаются данными (`AttemptOutcome`): ошибки не пересекают
 * границу шага, решение о повторе принимает воркфлоу.
 */
export async function runAttempt(
	deps: AttemptDeps,
	input: AttemptInput,
): Promise<AttemptOutcome> {
	const startedAt = deps.now();
	let key: HfKey | null = null;
	try {
		key = await deps.getAvailableKey({ excludeIds: input.excludeKeyIds });
		const result = await deps.generateImage(
			{
				engine: input.engine,
				prompt: input.prompt,
				negativePrompt: input.negativePrompt,
				model: input.model,
				width: input.width,
				height: input.height,
				steps: input.steps,
				seed: input.seed,
			},
			key.key,
		);
		const { bytes, contentType } = await deps.download(result.imageUrl);
		const imageKey = `generations/${input.userId}/${deps.now()}.${imageExtension(contentType)}`;
		await deps.store(imageKey, bytes, contentType);
		await deps.refreshQuota(key);
		return {
			ok: true,
			imageKey,
			seed: result.seed,
			apiKeyId: key.id,
			durationMs: deps.now() - startedAt,
		};
	} catch (error) {
		if (error instanceof AllKeysExhaustedError) {
			return { ok: false, reason: "no_keys" };
		}
		if (key && error instanceof QueueTimeoutError) {
			await deps.refreshQuota(key, error.message);
			return {
				ok: false,
				reason: "queue_timeout",
				keyId: key.id,
				message: error.message,
			};
		}
		if (key && error instanceof KeyExhaustedError) {
			await deps.refreshQuota(key, error.message);
			return {
				ok: false,
				reason: "key_exhausted",
				keyId: key.id,
				status: error.status,
				message: error.message,
			};
		}
		if (key) await deps.refreshQuota(key);
		return {
			ok: false,
			reason: "error",
			keyId: key?.id ?? null,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
```

Run: `bun test src/lib/__tests__/spaces-attempt.test.ts`
Expected: PASS.

- [ ] **Step 6: Сбой → ошибка, разбор запроса**

`src/lib/__tests__/spaces-failure.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { describeGenerationError } from "../generation-error";
import { errorFromFailure } from "../spaces/failure";
import { SpaceRunError, toSpaceFailure } from "../spaces/run-error";

describe("сбои запуска Space", () => {
	test("SpaceRunError превращается в данные без потерь", () => {
		expect(
			toSpaceFailure(new SpaceRunError("error", "сломалось", "hf-1")),
		).toEqual({ code: "error", message: "сломалось", apiKeyId: "hf-1" });
	});

	test("посторонняя ошибка — код error без ключа", () => {
		expect(toSpaceFailure(new Error("база упала"))).toEqual({
			code: "error",
			message: "база упала",
			apiKeyId: null,
		});
		expect(toSpaceFailure("текст")).toMatchObject({ message: "текст" });
	});

	test("all_keys_exhausted в истории — прежний код", () => {
		const error = errorFromFailure({
			code: "all_keys_exhausted",
			message: "x",
			apiKeyId: null,
		});
		expect(describeGenerationError(error)).toBe(
			"all_keys_exhausted: All API keys exhausted",
		);
	});

	test("прочий сбой в истории — код error с исходным текстом", () => {
		const error = errorFromFailure({
			code: "error",
			message: "Не удалось скачать изображение: 500",
			apiKeyId: "hf-1",
		});
		expect(describeGenerationError(error)).toBe(
			"error: Не удалось скачать изображение: 500",
		);
	});
});
```

`src/lib/__tests__/spaces-request.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { IDEOGRAM_MODE, IDEOGRAM_STEPS } from "../models";
import { parseSpaceRequest } from "../spaces/request";

describe("parseSpaceRequest", () => {
	test("Krea: умолчания и запись как у прежнего обработчика", () => {
		expect(parseSpaceRequest({ prompt: "кот" }, "krea")).toEqual({
			engine: "krea",
			prompt: "кот",
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
			recordModel: "Turbo",
			recordSteps: 8,
		});
	});

	test("значения клиента принимаются, id и негативный промпт сохраняются", () => {
		const request = parseSpaceRequest(
			{
				prompt: "кот",
				id: "client-id-42",
				negativePrompt: "blur",
				model: "Raw",
				width: 768,
				height: 1280,
				steps: 12,
				seed: 5,
			},
			"krea",
		);
		expect(request).toMatchObject({
			id: "client-id-42",
			negativePrompt: "blur",
			model: "Raw",
			width: 768,
			height: 1280,
			steps: 12,
			seed: 5,
			recordModel: "Raw",
			recordSteps: 12,
		});
	});

	test("Ideogram: в историю пишется пресет, а не значения клиента", () => {
		const request = parseSpaceRequest(
			{ prompt: "кот", model: "Raw", steps: 3 },
			"ideogram",
		);
		expect(request.recordModel).toBe(IDEOGRAM_MODE);
		expect(request.recordSteps).toBe(IDEOGRAM_STEPS);
	});

	test("мусор заменяется умолчаниями", () => {
		const request = parseSpaceRequest(
			{
				prompt: "кот",
				id: 42,
				model: "Evil",
				width: -5,
				height: "большой",
				steps: 0,
				seed: 1.5,
			},
			"krea",
		);
		expect(request).toMatchObject({
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
		});
		expect(request.id).toBeUndefined();
	});
});
```

Run: `bun test src/lib/__tests__/spaces-failure.test.ts src/lib/__tests__/spaces-request.test.ts`
Expected: FAIL (модулей нет).

`src/lib/spaces/failure.ts`:

```ts
import { AllKeysExhaustedError } from "../keys";
import type { SpaceFailure } from "./types";

/**
 * Данные сбоя → ошибка для `describeGenerationError`: так `error_message` остаётся в
 * прежнем формате `<код>: <текст>` (код определяет класс ошибки).
 */
export function errorFromFailure(failure: SpaceFailure): Error {
	return failure.code === "all_keys_exhausted"
		? new AllKeysExhaustedError()
		: new Error(failure.message);
}
```

`src/lib/spaces/request.ts`:

```ts
import { IDEOGRAM_MODE, IDEOGRAM_STEPS, type SpaceEngine } from "../models";

/** Нормализованное тело `POST /api/generate` для Krea 2 / Ideogram 4 */
export interface SpaceRequest {
	id?: string;
	engine: SpaceEngine;
	prompt: string;
	negativePrompt?: string;
	model: "Turbo" | "Raw";
	width: number;
	height: number;
	steps: number;
	seed: number | null;
	/** Что пишется в `generations.model` и `steps` (у Ideogram — пресет) */
	recordModel: string;
	recordSteps: number;
}

function positiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: fallback;
}

export function parseSpaceRequest(
	body: Record<string, unknown>,
	engine: SpaceEngine,
): SpaceRequest {
	const model = body.model === "Raw" ? "Raw" : "Turbo";
	const steps = positiveNumber(body.steps, 8);
	const isIdeogram = engine === "ideogram";
	return {
		...(typeof body.id === "string" ? { id: body.id } : {}),
		engine,
		prompt: String(body.prompt),
		...(typeof body.negativePrompt === "string"
			? { negativePrompt: body.negativePrompt }
			: {}),
		model,
		width: positiveNumber(body.width, 1024),
		height: positiveNumber(body.height, 1024),
		steps,
		seed: Number.isInteger(body.seed) ? (body.seed as number) : null,
		recordModel: isIdeogram ? IDEOGRAM_MODE : model,
		recordSteps: isIdeogram ? IDEOGRAM_STEPS : steps,
	};
}
```

Run: `bun test src/lib/__tests__/spaces-failure.test.ts src/lib/__tests__/spaces-request.test.ts`
Expected: PASS.

- [ ] **Step 7: Бюджеты времени HF-пути**

В `src/lib/__tests__/ultra-budgets.test.ts` добавить импорты

```ts
import { IMAGE_MODELS } from "../models";
import { SPACE_RUN_DEADLINE_MS } from "../spaces/constants";
```

и в конец файла:

```ts
describe("бюджеты времени Krea 2 и Ideogram 4", () => {
	/** Обогащение промпта идёт до 25 с (`ENHANCE_DEADLINE_MS`) плюс запись: оценка, не замер */
	const ENHANCE_ALLOWANCE_MS = 30_000;

	test("порядок: худший прогон < ожидание страницы < закрытие зависших", () => {
		// попытка, начатая на последней минуте срока, идёт до таймаута опроса Space
		const longestPoll = Math.max(
			...Object.values(IMAGE_MODELS).map((model) => model.pollTimeoutMs),
		);
		const worstCase =
			SPACE_RUN_DEADLINE_MS +
			longestPoll +
			ENHANCE_ALLOWANCE_MS +
			QUEUE_ALLOWANCE_MS;
		expect(ULTRA_CLIENT_WAIT_MS).toBeGreaterThan(worstCase);
		expect(GENERATION_STALE_MS).toBeGreaterThan(ULTRA_CLIENT_WAIT_MS);
	});
});
```

Run: `bun test src/lib/__tests__/ultra-budgets.test.ts`
Expected: PASS (600 + 180 + 30 + 60 = 870 с < 900 с).

- [ ] **Step 8: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run typecheck`

```bash
git add src/lib/spaces src/lib/__tests__/spaces-attempts.test.ts src/lib/__tests__/spaces-attempt.test.ts src/lib/__tests__/spaces-failure.test.ts src/lib/__tests__/spaces-request.test.ts src/lib/__tests__/ultra-budgets.test.ts
git commit -m "$(cat <<'EOF'
Krea и Ideogram: логика попытки, ротации ключей и сроков

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Окружение шагов, шаги и воркфлоу Krea/Ideogram

Перед работой загрузить скилл `workflow` и свериться с `node_modules/workflow/docs/foundations` (шаги, ошибки и повторы): код пишется по тем же правилам, что `workflows/ultra/`.

**Files:**
- Create: `src/lib/spaces/workflow-runtime.ts`, `workflows/spaces/steps.ts`, `workflows/spaces/index.ts`, `src/lib/__tests__/helpers/spaces-fakes.ts`
- Test: `src/lib/__tests__/spaces-steps.test.ts`, `src/lib/__tests__/spaces-workflow.test.ts`

**Interfaces:**
- Consumes: Task 3 (`runAttempt`, `AttemptDeps`, `runWithRotation`, `toSpaceFailure`, `errorFromFailure`, типы, константы), `enhancePrompt`/`EnhanceResult` (`src/lib/enhance.ts`), `completeGeneration`/`failGeneration` и их параметры (`src/lib/generations.ts`), `generateImage`/`getZeroGPUQuota` (`src/lib/hf.ts`), `getAvailableKey`/`updateKeyQuota` (`src/lib/keys.ts`), `uploadImage` (`src/lib/storage.ts`), `storeThumb` (`src/lib/thumbnails.ts`), `normalizeContentType`, `initTracing`/`traceSpan`.
- Produces:
  - `interface SpacesRuntime { enhance(prompt: string, meta: { generationId: string; engine: string }): Promise<EnhanceResult>; attempt(input: AttemptInput): Promise<AttemptOutcome>; completeGeneration(p: CompleteGenerationParams): Promise<boolean>; failGeneration(p: FailGenerationParams): Promise<boolean>; now(): number }`, `getSpacesRuntime()`, `setSpacesRuntime(runtime | null)`.
  - Шаги: `enhanceStep(input: { id: string; engine: string; prompt: string }): Promise<EnhanceResult>`; `generateStep(input: AttemptInput): Promise<AttemptOutcome>`; `completeStep(input: CompleteStepInput): Promise<void>`; `failStep(input: FailStepInput): Promise<void>`.
  - `spaceImageWorkflow(input: SpaceRunInput): Promise<{ ok: true; imageKey: string }>`.

- [ ] **Step 1: Окружение шагов**

`src/lib/spaces/workflow-runtime.ts`:

```ts
import { type EnhanceResult, enhancePrompt } from "../enhance";
import {
	type CompleteGenerationParams,
	completeGeneration,
	type FailGenerationParams,
	failGeneration,
} from "../generations";
import { generateImage, getZeroGPUQuota } from "../hf";
import { normalizeContentType } from "../image-format";
import { getAvailableKey, updateKeyQuota } from "../keys";
import { uploadImage } from "../storage";
import { storeThumb } from "../thumbnails";
import { initTracing, traceSpan } from "../tracing";
import { type AttemptDeps, runAttempt } from "./attempt";
import type { AttemptInput, AttemptOutcome } from "./types";

/**
 * Всё, что шагам воркфлоу Krea 2 / Ideogram 4 нужно от внешнего мира. Шаги берут
 * окружение через `getSpacesRuntime()`, тесты подставляют своё через
 * `setSpacesRuntime()`.
 */
export interface SpacesRuntime {
	enhance(
		prompt: string,
		meta: { generationId: string; engine: string },
	): Promise<EnhanceResult>;
	attempt(input: AttemptInput): Promise<AttemptOutcome>;
	completeGeneration(params: CompleteGenerationParams): Promise<boolean>;
	failGeneration(params: FailGenerationParams): Promise<boolean>;
	now(): number;
}

function createDefaultRuntime(): SpacesRuntime {
	// шаги воркфлоу идут отдельными вызовами функций — каждый вход инициализирует трассировку
	initTracing();
	const deps: AttemptDeps = {
		getAvailableKey: (options) => getAvailableKey("huggingface", options),
		generateImage,
		refreshQuota: async (key, lastError) => {
			try {
				const quota = await getZeroGPUQuota(key.key);
				if (quota) {
					await updateKeyQuota(key.id, quota, lastError ? { lastError } : {});
				}
			} catch (error) {
				console.warn(`Не удалось обновить квоту ключа ${key.name}:`, error);
			}
		},
		download: async (url) => {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Не удалось скачать изображение: ${response.status}`);
			}
			return {
				bytes: new Uint8Array(await response.arrayBuffer()),
				contentType: normalizeContentType(response.headers.get("content-type")),
			};
		},
		store: async (imageKey, bytes, contentType) => {
			await uploadImage(imageKey, Buffer.from(bytes), contentType);
			await storeThumb(imageKey, bytes);
		},
		now: Date.now,
	};
	return {
		enhance: (prompt, meta) =>
			traceSpan("enhance", { input: prompt, metadata: meta }, () =>
				enhancePrompt(prompt),
			),
		attempt: (input) => runAttempt(deps, input),
		completeGeneration,
		failGeneration,
		now: Date.now,
	};
}

let override: SpacesRuntime | null = null;
let cached: SpacesRuntime | null = null;

export function getSpacesRuntime(): SpacesRuntime {
	if (override) return override;
	cached ??= createDefaultRuntime();
	return cached;
}

/** Для тестов: подмена окружения (null возвращает боевое) */
export function setSpacesRuntime(runtime: SpacesRuntime | null): void {
	override = runtime;
}
```

- [ ] **Step 2: Фикстуры для тестов**

`src/lib/__tests__/helpers/spaces-fakes.ts`:

```ts
import { mock } from "bun:test";
import type { EnhanceResult } from "../../enhance";
import type { AttemptInput, AttemptOutcome, AttemptSuccess } from "../../spaces/types";
import type { SpacesRuntime } from "../../spaces/workflow-runtime";

export const ENHANCED: EnhanceResult = {
	prompt: "A pug on a golden throne, rainbow and gold",
	keyId: "llm-1",
	model: "mercury-2.5",
	styleVersion: "abcd1234abcd1234",
	inputTokens: 100,
	outputTokens: 50,
	durationMs: 1200,
	fallback: false,
};

export const DRAWN: AttemptSuccess = {
	ok: true,
	imageKey: "generations/u1/1700000000000.png",
	seed: 77,
	apiKeyId: "hf-1",
	durationMs: 9000,
};

export const INPUT = {
	id: "gen-1",
	userId: "u1",
	engine: "krea" as const,
	prompt: "пятёрка на троне",
	model: "Turbo" as const,
	width: 1024,
	height: 1024,
	steps: 8,
	seed: null,
};

function defaultRuntime() {
	return {
		enhance: mock(
			async (_prompt: string, _meta: { generationId: string; engine: string }) =>
				ENHANCED,
		),
		attempt: mock(
			async (_input: AttemptInput): Promise<AttemptOutcome> => DRAWN,
		),
		completeGeneration: mock(async (_params: unknown) => true),
		failGeneration: mock(async (_params: unknown) => true),
		now: () => 1_700_000_000_000,
	};
}

type DefaultRuntime = ReturnType<typeof defaultRuntime>;

/**
 * Окружение шагов для тестов: всё в памяти, вызовы записываются. Подменённые поля
 * имеют тип подмены, остальные остаются моками (`runtime.attempt.mock.calls`).
 */
export function makeSpacesRuntime(): DefaultRuntime;
export function makeSpacesRuntime<T extends Partial<SpacesRuntime>>(
	overrides: T,
): Omit<DefaultRuntime, keyof T> & T;
export function makeSpacesRuntime(
	overrides: Partial<SpacesRuntime> = {},
): unknown {
	return { ...defaultRuntime(), ...overrides };
}
```

- [ ] **Step 3: Падающие тесты шагов**

`src/lib/__tests__/spaces-steps.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	completeStep,
	enhanceStep,
	failStep,
	generateStep,
} from "../../../workflows/spaces/steps";
import { describeGenerationError } from "../generation-error";
import { setSpacesRuntime } from "../spaces/workflow-runtime";
import { DRAWN, ENHANCED, makeSpacesRuntime } from "./helpers/spaces-fakes";

beforeEach(() => {
	// шаги намеренно логируют сбои; в выводе тестов они не нужны
	spyOn(console, "error").mockImplementation(() => {});
	spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => setSpacesRuntime(null));

describe("повторы платформы", () => {
	test("enhance и generate без повторов: каждый вызов расходует лимит ключа", () => {
		expect(enhanceStep.maxRetries).toBe(0);
		expect(generateStep.maxRetries).toBe(0);
	});

	test("complete и fail повторяются по умолчанию: запись идемпотентна", () => {
		expect(completeStep.maxRetries).toBeUndefined();
		expect(failStep.maxRetries).toBeUndefined();
	});
});

describe("enhanceStep и generateStep", () => {
	test("enhanceStep отдаёт результат обогащения и передаёт id с движком в трассировку", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		const result = await enhanceStep({
			id: "gen-1",
			engine: "krea",
			prompt: "кот",
		});

		expect(result).toEqual(ENHANCED);
		expect(runtime.enhance).toHaveBeenCalledWith("кот", {
			generationId: "gen-1",
			engine: "krea",
		});
	});

	test("generateStep передаёт вход попытки и возвращает её исход", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);
		const input = {
			userId: "u1",
			engine: "krea" as const,
			prompt: "A pug",
			model: "Turbo" as const,
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
			excludeKeyIds: ["hf-0"],
		};

		expect(await generateStep(input)).toEqual(DRAWN);
		expect(runtime.attempt).toHaveBeenCalledWith(input);
	});
});

describe("completeStep", () => {
	const base = {
		id: "gen-1",
		imageKey: DRAWN.imageKey,
		seed: 77,
		width: 1024,
		height: 1024,
		apiKeyId: "hf-1",
		durationMs: 9000,
		enhanced: ENHANCED,
	};

	test("пишет историю: промпт, ключи, модель и токены LLM", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		await completeStep(base);

		expect(runtime.completeGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			imageKey: DRAWN.imageKey,
			seed: 77,
			width: 1024,
			height: 1024,
			enhancedPrompt: ENHANCED.prompt,
			durationMs: 9000,
			apiKeyId: "hf-1",
			llmKeyId: "llm-1",
			llmModel: "mercury-2.5",
			llmTokens: 150,
			enhanceMs: 1200,
			styleVersion: "abcd1234abcd1234",
		});
	});

	test("уже закрытая запись только логируется", async () => {
		setSpacesRuntime(
			makeSpacesRuntime({ completeGeneration: async () => false }),
		);
		await expect(completeStep(base)).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});
});

describe("failStep", () => {
	test("закрывает строку с кодом, ключом HF и тем, что успел дать LLM", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		await failStep({
			id: "gen-1",
			failure: { code: "error", message: "сломалось", apiKeyId: "hf-1" },
			seed: 5,
			durationMs: 4000,
			enhanced: ENHANCED,
		});

		const params = runtime.failGeneration.mock.calls[0]![0] as {
			error: unknown;
		};
		expect(describeGenerationError(params.error)).toBe("error: сломалось");
		expect(params).toMatchObject({
			id: "gen-1",
			seed: 5,
			durationMs: 4000,
			enhancedPrompt: ENHANCED.prompt,
			apiKeyId: "hf-1",
			llmKeyId: "llm-1",
			llmModel: "mercury-2.5",
			llmTokens: 150,
			enhanceMs: 1200,
			styleVersion: "abcd1234abcd1234",
		});
	});

	test("сбой до обогащения: данных LLM нет", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		await failStep({
			id: "gen-1",
			failure: { code: "all_keys_exhausted", message: "x", apiKeyId: null },
			seed: null,
			durationMs: 10,
			enhanced: null,
		});

		const params = runtime.failGeneration.mock.calls[0]![0] as {
			error: unknown;
		};
		expect(describeGenerationError(params.error).split(":")[0]).toBe(
			"all_keys_exhausted",
		);
		expect(params).toMatchObject({
			enhancedPrompt: null,
			llmKeyId: null,
			llmTokens: null,
			apiKeyId: null,
		});
	});
});
```

Run: `bun test src/lib/__tests__/spaces-steps.test.ts`
Expected: FAIL (`workflows/spaces/steps` не найден).

- [ ] **Step 4: Реализовать шаги**

`workflows/spaces/steps.ts`:

```ts
import type { EnhanceResult } from "../../src/lib/enhance";
import { errorFromFailure } from "../../src/lib/spaces/failure";
import type {
	AttemptInput,
	AttemptOutcome,
	SpaceFailure,
} from "../../src/lib/spaces/types";
import { getSpacesRuntime } from "../../src/lib/spaces/workflow-runtime";

/**
 * Шаги воркфлоу Krea 2 / Ideogram 4: тонкие обёртки над кодом из src/lib/spaces.
 * Каждый шаг выполняется в полном рантайме с отдельным лимитом функции; аргументы и
 * результаты только сериализуемые (строки, числа, простые объекты).
 */

const llmTokens = (enhanced: EnhanceResult | null): number | null =>
	enhanced
		? (enhanced.inputTokens ?? 0) + (enhanced.outputTokens ?? 0) || null
		: null;

/** Обогащение промпта; без повторов: запрос к LLM расходует лимит ключа, сбой уже превращается в fallback */
export async function enhanceStep(input: {
	id: string;
	engine: string;
	prompt: string;
}): Promise<EnhanceResult> {
	"use step";
	const enhanced = await getSpacesRuntime().enhance(input.prompt, {
		generationId: input.id,
		engine: input.engine,
	});
	if (enhanced.fallback) {
		console.warn(
			`Обогащение промпта упало в fallback: ${enhanced.error ?? "unknown"}`,
		);
	}
	return enhanced;
}
enhanceStep.maxRetries = 0;

/**
 * Одна попытка Space: ключ HF, генерация, картинка в хранилище. Без повторов:
 * каждый вызов расходует прогон ZeroGPU. Отказы возвращаются данными.
 */
export async function generateStep(input: AttemptInput): Promise<AttemptOutcome> {
	"use step";
	return getSpacesRuntime().attempt(input);
}
generateStep.maxRetries = 0;

export interface CompleteStepInput {
	id: string;
	imageKey: string;
	seed: number;
	width: number;
	height: number;
	apiKeyId: string;
	durationMs: number;
	enhanced: EnhanceResult;
}

export async function completeStep(input: CompleteStepInput): Promise<void> {
	"use step";
	const { enhanced } = input;
	const closed = await getSpacesRuntime().completeGeneration({
		id: input.id,
		imageKey: input.imageKey,
		seed: input.seed,
		width: input.width,
		height: input.height,
		enhancedPrompt: enhanced.prompt,
		durationMs: input.durationMs,
		apiKeyId: input.apiKeyId,
		llmKeyId: enhanced.keyId,
		llmModel: enhanced.model,
		llmTokens: llmTokens(enhanced),
		enhanceMs: enhanced.durationMs,
		styleVersion: enhanced.styleVersion,
	});
	if (!closed) {
		console.error(
			`Генерация ${input.id} закрыта другим путём, картинка ${input.imageKey} осталась без записи`,
		);
	}
}

export interface FailStepInput {
	id: string;
	failure: SpaceFailure;
	seed: number | null;
	durationMs: number;
	enhanced: EnhanceResult | null;
}

/**
 * Компенсация: закрывает строку и возвращает кредиты одной транзакцией по условию
 * `status = 'running'`, поэтому возврат бывает ровно один раз, даже если шаг
 * повторится.
 */
export async function failStep(input: FailStepInput): Promise<void> {
	"use step";
	const { failure, enhanced } = input;
	console.error(`Space error: ${failure.code}: ${failure.message}`);
	await getSpacesRuntime().failGeneration({
		id: input.id,
		error: errorFromFailure(failure),
		seed: input.seed,
		durationMs: input.durationMs,
		enhancedPrompt: enhanced?.prompt ?? null,
		apiKeyId: failure.apiKeyId,
		llmKeyId: enhanced?.keyId ?? null,
		llmModel: enhanced?.model ?? null,
		llmTokens: llmTokens(enhanced),
		enhanceMs: enhanced?.durationMs ?? null,
		styleVersion: enhanced?.styleVersion ?? null,
	});
}
```

Run: `bun test src/lib/__tests__/spaces-steps.test.ts`
Expected: PASS.

- [ ] **Step 5: Падающие тесты воркфлоу**

`src/lib/__tests__/spaces-workflow.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { spaceImageWorkflow } from "../../../workflows/spaces/index";
import { describeGenerationError } from "../generation-error";
import type { AttemptInput, AttemptOutcome } from "../spaces/types";
import { setSpacesRuntime } from "../spaces/workflow-runtime";
import {
	DRAWN,
	ENHANCED,
	INPUT,
	makeSpacesRuntime,
} from "./helpers/spaces-fakes";

function errorCode(runtime: {
	failGeneration: { mock: { calls: unknown[][] } };
}): string {
	const params = runtime.failGeneration.mock.calls[0]![0] as { error: unknown };
	return describeGenerationError(params.error).split(":")[0]!;
}

/** Исходы попыток по порядку вызовов */
function attempts(...outcomes: AttemptOutcome[]) {
	let index = 0;
	return mock(async (_input: AttemptInput) => outcomes[index++]!);
}

beforeEach(() => {
	spyOn(console, "error").mockImplementation(() => {});
	spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => setSpacesRuntime(null));

describe("spaceImageWorkflow: успех", () => {
	test("обогащение, попытка, запись истории; возврата нет", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		const result = await spaceImageWorkflow(INPUT);

		expect(result).toEqual({ ok: true, imageKey: DRAWN.imageKey });
		expect(runtime.enhance).toHaveBeenCalledWith("пятёрка на троне", {
			generationId: "gen-1",
			engine: "krea",
		});
		// в Space уходит обогащённый промпт, а не исходный
		expect(runtime.attempt.mock.calls[0]![0]).toMatchObject({
			userId: "u1",
			engine: "krea",
			prompt: ENHANCED.prompt,
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
			excludeKeyIds: [],
		});
		expect(runtime.completeGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			imageKey: DRAWN.imageKey,
			seed: 77,
			apiKeyId: "hf-1",
			enhancedPrompt: ENHANCED.prompt,
		});
		expect(runtime.failGeneration).not.toHaveBeenCalled();
	});

	test("исчерпанный ключ: вторая попытка исключает его", async () => {
		const attempt = attempts(
			{
				ok: false,
				reason: "key_exhausted",
				keyId: "hf-0",
				status: 429,
				message: "quota",
			},
			DRAWN,
		);
		const runtime = makeSpacesRuntime({ attempt });
		setSpacesRuntime(runtime);

		await spaceImageWorkflow(INPUT);

		expect(attempt).toHaveBeenCalledTimes(2);
		expect(attempt.mock.calls[1]![0]).toMatchObject({ excludeKeyIds: ["hf-0"] });
		expect(runtime.failGeneration).not.toHaveBeenCalled();
	});

	test("таймаут очереди: повтор тем же ключом", async () => {
		const attempt = attempts(
			{ ok: false, reason: "queue_timeout", keyId: "hf-1", message: "queue" },
			DRAWN,
		);
		setSpacesRuntime(makeSpacesRuntime({ attempt }));

		await spaceImageWorkflow(INPUT);

		expect(attempt.mock.calls[1]![0]).toMatchObject({ excludeKeyIds: [] });
	});
});

describe("spaceImageWorkflow: сбои возвращают кредиты", () => {
	test("ключей нет: all_keys_exhausted, записи истории нет", async () => {
		const runtime = makeSpacesRuntime({
			attempt: attempts({ ok: false, reason: "no_keys" }),
		});
		setSpacesRuntime(runtime);

		const error = await spaceImageWorkflow(INPUT).catch((e) => e);

		expect(error.code).toBe("all_keys_exhausted");
		expect(errorCode(runtime)).toBe("all_keys_exhausted");
		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
		expect(runtime.completeGeneration).not.toHaveBeenCalled();
	});

	test("прочая ошибка попытки: код error, ключ HF и данные LLM в записи", async () => {
		const runtime = makeSpacesRuntime({
			attempt: attempts({
				ok: false,
				reason: "error",
				keyId: "hf-1",
				message: "Не удалось скачать изображение: 500",
			}),
		});
		setSpacesRuntime(runtime);

		await spaceImageWorkflow({ ...INPUT, seed: 5 }).catch(() => {});

		expect(errorCode(runtime)).toBe("error");
		expect(runtime.failGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			seed: 5,
			apiKeyId: "hf-1",
			enhancedPrompt: ENHANCED.prompt,
			llmKeyId: "llm-1",
		});
	});

	test("сбой обогащения: попыток нет, кредиты возвращаются", async () => {
		const runtime = makeSpacesRuntime({
			enhance: async () => {
				throw new Error("LLM недоступна");
			},
		});
		setSpacesRuntime(runtime);

		await spaceImageWorkflow(INPUT).catch(() => {});

		expect(runtime.attempt).not.toHaveBeenCalled();
		expect(errorCode(runtime)).toBe("error");
		expect(runtime.failGeneration.mock.calls[0]![0]).toMatchObject({
			enhancedPrompt: null,
		});
	});

	test("сбой записи истории после картинки тоже возвращает кредиты", async () => {
		const runtime = makeSpacesRuntime({
			completeGeneration: async () => {
				throw new Error("база недоступна");
			},
		});
		setSpacesRuntime(runtime);

		await spaceImageWorkflow(INPUT).catch(() => {});

		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
	});
});
```

Run: `bun test src/lib/__tests__/spaces-workflow.test.ts`
Expected: FAIL (`workflows/spaces/index` не найден).

- [ ] **Step 6: Реализовать воркфлоу**

`workflows/spaces/index.ts`:

```ts
import type { EnhanceResult } from "../../src/lib/enhance";
import { runWithRotation } from "../../src/lib/spaces/attempts";
import {
	SPACE_MAX_ATTEMPTS,
	SPACE_RUN_DEADLINE_MS,
} from "../../src/lib/spaces/constants";
import { toSpaceFailure } from "../../src/lib/spaces/run-error";
import type { SpaceRunInput } from "../../src/lib/spaces/types";
import { completeStep, enhanceStep, failStep, generateStep } from "./steps";

/**
 * Запуск Krea 2 / Ideogram 4: обогащение промпта, попытки Space с ротацией ключей HF
 * (каждая попытка шаг), запись результата. Любая ошибка запускает компенсацию
 * (`failStep`: возврат кредитов) и пробрасывается дальше, чтобы прогон записался
 * неуспешным. Код воркфлоу детерминирован: всё, что обращается к внешнему миру,
 * живёт в шагах.
 */
export async function spaceImageWorkflow(
	input: SpaceRunInput,
): Promise<{ ok: true; imageKey: string }> {
	"use workflow";
	const startedAt = Date.now();
	let enhanced: EnhanceResult | null = null;
	try {
		enhanced = await enhanceStep({
			id: input.id,
			engine: input.engine,
			prompt: input.prompt,
		});
		const prompt = enhanced.prompt;
		const generateStartedAt = Date.now();
		const drawn = await runWithRotation(
			(excludeKeyIds) =>
				generateStep({
					userId: input.userId,
					engine: input.engine,
					prompt,
					negativePrompt: input.negativePrompt,
					model: input.model,
					width: input.width,
					height: input.height,
					steps: input.steps,
					seed: input.seed,
					excludeKeyIds,
				}),
			{
				startedAt,
				now: () => Date.now(),
				maxAttempts: SPACE_MAX_ATTEMPTS,
				deadlineMs: SPACE_RUN_DEADLINE_MS,
			},
		);
		await completeStep({
			id: input.id,
			imageKey: drawn.imageKey,
			seed: drawn.seed,
			width: input.width,
			height: input.height,
			apiKeyId: drawn.apiKeyId,
			durationMs: Date.now() - generateStartedAt,
			enhanced,
		});
		return { ok: true, imageKey: drawn.imageKey };
	} catch (error) {
		await failStep({
			id: input.id,
			failure: toSpaceFailure(error),
			seed: Number.isInteger(input.seed) ? (input.seed as number) : null,
			durationMs: Date.now() - startedAt,
			enhanced,
		});
		throw error;
	}
}
```

Run: `bun test src/lib/__tests__/spaces-workflow.test.ts`
Expected: PASS.

- [ ] **Step 7: Сборщик Workflow находит новый воркфлоу**

Run: `bun run workflow:build`
Expected: сборка без ошибок (в выводе нет «Cannot resolve»/«node:»).

Run: `grep -c "spaceImageWorkflow" .well-known/workflow/v1/flow.mjs`
Expected: число больше 0. Если 0 — вложенная папка не сканируется: свериться с `node_modules/workflow/docs` (раздел про сборщик и `dirs`) и поправить конфигурацию сборки, не перенося воркфлоу в другую папку без разбора причины.

- [ ] **Step 8: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run typecheck`

```bash
git add src/lib/spaces/workflow-runtime.ts workflows/spaces src/lib/__tests__/helpers/spaces-fakes.ts src/lib/__tests__/spaces-steps.test.ts src/lib/__tests__/spaces-workflow.test.ts
git commit -m "$(cat <<'EOF'
Krea и Ideogram: воркфлоу и шаги вместо синхронного обработчика

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Маршрут `/api/generate` запускает воркфлоу и отвечает 202

**Files:**
- Create: `src/lib/spaces/start-deps.ts`
- Modify: `src/api/generate.ts` (импорты и обработчик `POST /api/generate`)

**Interfaces:**
- Consumes: `startRun`, `StartRunDeps` (Task 2), `parseSpaceRequest`, `SpaceRequest` (Task 3), `spaceImageWorkflow` (Task 4), `startGeneration`, `chargeGeneration`, `failGeneration`, `TOO_MANY_REQUESTS_ERROR`.
- Produces: `spaceStartDeps(userId: string, request: SpaceRequest): StartRunDeps`; `POST /api/generate` для `krea`/`ideogram` отвечает `202 { id, engine, cost }` (либо `400/401/402/429/502`).

- [ ] **Step 1: Боевые зависимости приёма**

`src/lib/spaces/start-deps.ts`:

```ts
import { start } from "workflow/api";
import { spaceImageWorkflow } from "../../../workflows/spaces/index";
import {
	chargeGeneration,
	failGeneration,
	startGeneration,
} from "../generations";
import type { StartRunDeps } from "../start-run";
import type { SpaceRequest } from "./request";

/** Боевые зависимости запуска Krea 2 / Ideogram 4; импортируются только публичным сервером */
export function spaceStartDeps(
	userId: string,
	request: SpaceRequest,
): StartRunDeps {
	return {
		startRecord: () =>
			startGeneration({
				...(request.id ? { id: request.id } : {}),
				userId,
				prompt: request.prompt,
				negativePrompt: request.negativePrompt,
				engine: request.engine,
				model: request.recordModel,
				width: request.width,
				height: request.height,
				steps: request.recordSteps,
			}),

		chargeCredits: (params) => chargeGeneration(params),

		startWorkflow: async (id) => {
			await start(spaceImageWorkflow, [
				{
					id,
					userId,
					engine: request.engine,
					prompt: request.prompt,
					negativePrompt: request.negativePrompt,
					model: request.model,
					width: request.width,
					height: request.height,
					steps: request.steps,
					seed: request.seed,
				},
			]);
		},

		failRecord: async (params) => {
			await failGeneration({
				id: params.id,
				error: params.error,
				durationMs: params.durationMs,
			});
		},

		now: Date.now,
	};
}
```

- [ ] **Step 2: Заменить синхронный обработчик**

В `src/api/generate.ts` заменить блок импортов целиком (до `const MAX_ATTEMPTS = 5;` включительно, константу удалить):

```ts
import { auth } from "../lib/auth";
import { getCredits } from "../lib/credits";
import { sql } from "../lib/db";
import { publicGenerationError } from "../lib/generation-error";
import { TOO_MANY_REQUESTS_ERROR } from "../lib/generation-limits";
import {
	type GenerationRecord,
	getActiveGeneration,
	getGeneration,
	listRunningGenerations,
} from "../lib/generations";
import {
	getImageModel,
	publicImageModels,
	resolveImageEngine,
} from "../lib/models";
import { checkRateLimit } from "../lib/rate-limit";
import { parseSpaceRequest } from "../lib/spaces/request";
import { spaceStartDeps } from "../lib/spaces/start-deps";
import { startRun } from "../lib/start-run";
import { getImageUrl } from "../lib/storage";
import { getOrCreateThumb } from "../lib/thumbnails";
import { isUltraAvailable } from "../lib/ultra/codex-auth";
import { parseUltraReasoning } from "../lib/ultra/reasoning";
import { startUltra } from "../lib/ultra/start";
import { startUltraDeps } from "../lib/ultra/start-deps";
```

Тело `POST` (от `const session = …` до закрывающей `},` обработчика, то есть весь блок строк 80–349 прежнего файла) заменить на:

```ts
		POST: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			if (!checkRateLimit(session.user.id, 10, 60_000)) {
				return Response.json(
					{ error: TOO_MANY_REQUESTS_ERROR },
					{ status: 429 },
				);
			}

			const body = await req.json();
			const { prompt } = body;
			// Старые вкладки могут прислать прежний id `turbo`; сервер принимает его как `ultra`.
			const isUltraRequest = body.engine === "ultra" || body.engine === "turbo";
			const ultraAvailable =
				isUltraRequest && (await isUltraAvailable().catch(() => false));
			const engine = resolveImageEngine(body.engine, ultraAvailable);

			if (typeof prompt !== "string" || !prompt || prompt.length > 1000) {
				return Response.json({ error: "Некорректный промпт" }, { status: 400 });
			}

			if (engine === "ultra") {
				// неизвестный уровень отклоняется, а не заменяется молча другим
				const reasoning = parseUltraReasoning(body.reasoning);
				if (!reasoning) {
					return Response.json(
						{ error: "Некорректный уровень рассуждения" },
						{ status: 400 },
					);
				}
				const outcome = await startUltra(
					{
						userId: session.user.id,
						prompt,
						reasoning,
						...(typeof body.id === "string" ? { id: body.id } : {}),
					},
					startUltraDeps,
				);
				return Response.json(outcome.body, { status: outcome.status });
			}

			// Krea 2 и Ideogram 4 тоже идут воркфлоу: запуск принимается в работу и сразу
			// отвечает 202, результат приходит опросом `/api/generations/:id`
			const request = parseSpaceRequest(body, engine);
			const outcome = await startRun(
				{
					userId: session.user.id,
					engine,
					cost: getImageModel(engine).cost,
				},
				spaceStartDeps(session.user.id, request),
			);
			return Response.json(outcome.body, { status: outcome.status });
		},
```

(Остальные маршруты файла — `/api/models`, `/api/generations`, `/thumb`, `/active`, `/running`, `/:id`, `/api/me` — не трогать.)

- [ ] **Step 3: Типы и сборка**

Run: `bun run typecheck`
Expected: без ошибок (если остались неиспользуемые импорты — `bun run lint:fix` уберёт).

Run: `bun run workflow:build`
Expected: без ошибок; `grep -c spaceImageWorkflow .well-known/workflow/v1/flow.mjs` > 0.

- [ ] **Step 4: Адресные тесты затронутых модулей**

Run: `bun test src/lib/__tests__/start-run.test.ts src/lib/__tests__/ultra-start.test.ts src/lib/__tests__/spaces-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run lint`

```bash
git add src/lib/spaces/start-deps.ts src/api/generate.ts
git commit -m "$(cat <<'EOF'
POST /api/generate: Krea и Ideogram запускают воркфлоу и отвечают 202

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Серия запусков: чистая логика страницы

**Files:**
- Create: `src/lib/series.ts`
- Test: `src/lib/__tests__/series.test.ts`

**Interfaces:**
- Consumes: `MAX_RUNNING_GENERATIONS` (`src/lib/generation-limits.ts`).
- Produces (все чистые функции, массивы не мутируются):
  - `MAX_SERIES_RUNS = 8`
  - `interface RunResult { image_url: string; seed: number | null }`
  - `interface Run { id: string; prompt: string; status: "running" | "done"; resumed: boolean; deadline: number; result: RunResult | null }`
  - `interface ServerRecord { id: string; status: "running" | "completed" | "failed"; prompt: string; image_url: string | null; seed: number | null; error: string | null; created_at: string }`
  - `runningCount(runs): number`, `canStart(runs, limit?): boolean`
  - `addRun(runs, run): Run[]`, `settleRun(runs, id, result): Run[]`, `dropRun(runs, id): Run[]`, `renameRun(runs, from, to): Run[]`
  - `resultOf(record: ServerRecord): RunResult`
  - `restoreRuns(records: ServerRecord[], now: number, waitMs: number): Run[]`
  - `mergeRuns(current: Run[], restored: Run[]): Run[]`
  - `seriesIds(runs): string[]`, `parseSeriesIds(raw: string | null): string[]`

- [ ] **Step 1: Падающие тесты**

`src/lib/__tests__/series.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	addRun,
	canStart,
	dropRun,
	MAX_SERIES_RUNS,
	mergeRuns,
	parseSeriesIds,
	type Run,
	renameRun,
	restoreRuns,
	runningCount,
	type ServerRecord,
	seriesIds,
	settleRun,
} from "../series";

const run = (id: string, over: Partial<Run> = {}): Run => ({
	id,
	prompt: `промпт ${id}`,
	status: "running",
	resumed: false,
	deadline: 1_000,
	result: null,
	...over,
});
const done = (id: string): Run =>
	run(id, { status: "done", result: { image_url: `https://img/${id}`, seed: 1 } });

const record = (id: string, over: Partial<ServerRecord> = {}): ServerRecord => ({
	id,
	status: "completed",
	prompt: `промпт ${id}`,
	image_url: `https://img/${id}`,
	seed: 7,
	error: null,
	created_at: "2026-10-18T10:00:00.000Z",
	...over,
});

describe("потолок", () => {
	test("считаются только идущие", () => {
		const runs = [run("a"), done("b"), run("c")];
		expect(runningCount(runs)).toBe(2);
	});

	test("запуск разрешён ниже потолка и запрещён на нём", () => {
		expect(canStart([run("a"), run("b"), run("c")])).toBe(true);
		expect(canStart([run("a"), run("b"), run("c"), run("d")])).toBe(false);
	});

	test("готовые рамки потолок не занимают", () => {
		expect(
			canStart([done("a"), done("b"), done("c"), done("d"), run("e")]),
		).toBe(true);
	});
});

describe("серия", () => {
	test("запуск при нуле идущих начинает серию заново", () => {
		expect(addRun([done("a"), done("b")], run("c")).map((r) => r.id)).toEqual([
			"c",
		]);
	});

	test("запуск при идущем добавляет рамку, новая первой", () => {
		expect(addRun([run("a"), done("b")], run("c")).map((r) => r.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	test("рамок серии не больше предела: уходят самые старые готовые, идущие остаются", () => {
		const many = [
			run("r1"),
			...Array.from({ length: MAX_SERIES_RUNS }, (_, i) => done(`d${i}`)),
		];
		const next = addRun(many, run("r2"));
		expect(next).toHaveLength(MAX_SERIES_RUNS);
		expect(next.map((r) => r.id)).toContain("r1");
		expect(next[0]!.id).toBe("r2");
		// самая старая готовая ушла
		expect(next.map((r) => r.id)).not.toContain(`d${MAX_SERIES_RUNS - 1}`);
	});

	test("если готовых нет, идущие не вытесняются", () => {
		const running = Array.from({ length: MAX_SERIES_RUNS }, (_, i) =>
			run(`r${i}`),
		);
		expect(addRun(running, run("new"))).toHaveLength(MAX_SERIES_RUNS + 1);
	});

	test("итог запуска: картинка, статус готово, признак возобновления снят", () => {
		const runs = settleRun([run("a", { resumed: true })], "a", {
			image_url: "https://img/a",
			seed: 5,
		});
		expect(runs[0]).toMatchObject({
			status: "done",
			resumed: false,
			result: { image_url: "https://img/a", seed: 5 },
		});
	});

	test("итог неизвестного запуска ничего не меняет", () => {
		const runs = [run("a")];
		expect(settleRun(runs, "zzz", { image_url: "x", seed: null })).toEqual(runs);
	});

	test("запуск убирается по id, исходный список не меняется", () => {
		const runs = [run("a"), run("b")];
		expect(dropRun(runs, "a").map((r) => r.id)).toEqual(["b"]);
		expect(runs).toHaveLength(2);
	});

	test("id заменяется, когда сервер выдал другой", () => {
		expect(renameRun([run("a"), run("b")], "a", "srv-1").map((r) => r.id)).toEqual([
			"srv-1",
			"b",
		]);
	});
});

describe("восстановление после обновления страницы", () => {
	test("идущие продолжают ожидание с новым сроком и признаком возобновления", () => {
		const restored = restoreRuns(
			[record("a", { status: "running", image_url: null })],
			10_000,
			900_000,
		);
		expect(restored).toEqual([
			{
				id: "a",
				prompt: "промпт a",
				status: "running",
				resumed: true,
				deadline: 910_000,
				result: null,
			},
		]);
	});

	test("готовые возвращаются картинкой, неуспешные выпадают", () => {
		const restored = restoreRuns(
			[
				record("ok"),
				record("bad", { status: "failed", image_url: null, error: "x" }),
				record("noimg", { image_url: null }),
			],
			0,
			1,
		);
		expect(restored.map((r) => r.id)).toEqual(["ok"]);
		expect(restored[0]).toMatchObject({
			status: "done",
			result: { image_url: "https://img/ok", seed: 7 },
		});
	});

	test("записи без повторов, свежие первыми", () => {
		const restored = restoreRuns(
			[
				record("old", { created_at: "2026-10-18T09:00:00.000Z" }),
				record("new", { created_at: "2026-10-18T11:00:00.000Z" }),
				record("old", { created_at: "2026-10-18T09:00:00.000Z" }),
			],
			0,
			1,
		);
		expect(restored.map((r) => r.id)).toEqual(["new", "old"]);
	});

	test("слияние: текущие запуски впереди, дубли отбрасываются", () => {
		const merged = mergeRuns([run("a")], [run("a", { resumed: true }), run("b")]);
		expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
		expect(merged[0]!.resumed).toBe(false);
	});
});

describe("хранение id серии", () => {
	test("id рамок по порядку", () => {
		expect(seriesIds([run("a"), done("b")])).toEqual(["a", "b"]);
	});

	test("разбор устойчив к мусору", () => {
		expect(parseSeriesIds(null)).toEqual([]);
		expect(parseSeriesIds("{не json")).toEqual([]);
		expect(parseSeriesIds('{"a":1}')).toEqual([]);
		expect(parseSeriesIds('["a",1,"",null,"b"]')).toEqual(["a", "b"]);
	});

	test("разбор ограничивает число id пределом серии", () => {
		const raw = JSON.stringify(
			Array.from({ length: MAX_SERIES_RUNS + 5 }, (_, i) => `id${i}`),
		);
		expect(parseSeriesIds(raw)).toHaveLength(MAX_SERIES_RUNS);
	});
});
```

Run: `bun test src/lib/__tests__/series.test.ts`
Expected: FAIL (`../series` не найден).

- [ ] **Step 2: Реализовать модуль**

`src/lib/series.ts`:

```ts
import { MAX_RUNNING_GENERATIONS } from "./generation-limits";

/** Сколько рамок серии держит страница; готовые сверх предела остаются только в «Недавних» */
export const MAX_SERIES_RUNS = 8;

export interface RunResult {
	image_url: string;
	seed: number | null;
}

/** Один запуск серии: своя рамка на странице */
export interface Run {
	id: string;
	prompt: string;
	status: "running" | "done";
	/** Возобновлён после обновления страницы: рамка пропускает первую ступень ожидания */
	resumed: boolean;
	/** Когда страница перестаёт ждать (мс, `Date.now()`) */
	deadline: number;
	result: RunResult | null;
}

/** Запись генерации в форме `generationJson` сервера (нужные странице поля) */
export interface ServerRecord {
	id: string;
	status: "running" | "completed" | "failed";
	prompt: string;
	image_url: string | null;
	seed: number | null;
	error: string | null;
	created_at: string;
}

export function runningCount(runs: Run[]): number {
	return runs.filter((run) => run.status === "running").length;
}

/** Новый запуск разрешён, пока идущих меньше потолка сервера */
export function canStart(
	runs: Run[],
	limit: number = MAX_RUNNING_GENERATIONS,
): boolean {
	return runningCount(runs) < limit;
}

/** Готовые сверх предела уходят начиная с самых старых; идущие не вытесняются никогда */
function trimSeries(runs: Run[]): Run[] {
	const result = [...runs];
	while (result.length > MAX_SERIES_RUNS) {
		const oldestDone = result.findLastIndex((run) => run.status === "done");
		if (oldestDone === -1) break;
		result.splice(oldestDone, 1);
	}
	return result;
}

/**
 * Новый запуск встаёт первым. Если идущих нет, это начало новой серии: готовые рамки
 * прежней уходят (они остаются в «Недавних»).
 */
export function addRun(runs: Run[], run: Run): Run[] {
	return trimSeries(runningCount(runs) === 0 ? [run] : [run, ...runs]);
}

export function settleRun(runs: Run[], id: string, result: RunResult): Run[] {
	return runs.map((run) =>
		run.id === id ? { ...run, status: "done", resumed: false, result } : run,
	);
}

export function dropRun(runs: Run[], id: string): Run[] {
	return runs.filter((run) => run.id !== id);
}

/** Сервер выдал другой id (клиентский был занят) */
export function renameRun(runs: Run[], from: string, to: string): Run[] {
	return runs.map((run) => (run.id === from ? { ...run, id: to } : run));
}

export function resultOf(
	record: Pick<ServerRecord, "image_url" | "seed">,
): RunResult {
	return { image_url: record.image_url ?? "", seed: record.seed ?? null };
}

/**
 * Запуски из записей сервера: идущие продолжают ожидание, готовые возвращаются
 * картинкой, неуспешные выпадают. Записи без повторов, свежие первыми.
 */
export function restoreRuns(
	records: ServerRecord[],
	now: number,
	waitMs: number,
): Run[] {
	const unique = new Map<string, ServerRecord>();
	for (const record of records) {
		if (!unique.has(record.id)) unique.set(record.id, record);
	}
	return [...unique.values()]
		.sort(
			(a, b) =>
				(Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
		)
		.slice(0, MAX_SERIES_RUNS)
		.flatMap((record): Run[] => {
			if (record.status === "running") {
				return [
					{
						id: record.id,
						prompt: record.prompt,
						status: "running",
						resumed: true,
						deadline: now + waitMs,
						result: null,
					},
				];
			}
			if (record.status === "completed" && record.image_url) {
				return [
					{
						id: record.id,
						prompt: record.prompt,
						status: "done",
						resumed: false,
						deadline: now,
						result: resultOf(record),
					},
				];
			}
			return [];
		});
}

/** Восстановленное добавляется к тому, что уже есть на странице; текущие запуски впереди */
export function mergeRuns(current: Run[], restored: Run[]): Run[] {
	const known = new Set(current.map((run) => run.id));
	return trimSeries([
		...current,
		...restored.filter((run) => !known.has(run.id)),
	]);
}

export function seriesIds(runs: Run[]): string[] {
	return runs.map((run) => run.id);
}

/** id серии из `localStorage`: устойчив к мусору */
export function parseSeriesIds(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const data: unknown = JSON.parse(raw);
		if (!Array.isArray(data)) return [];
		return data
			.filter(
				(id): id is string =>
					typeof id === "string" && id.length > 0 && id.length <= 64,
			)
			.slice(0, MAX_SERIES_RUNS);
	} catch {
		return [];
	}
}
```

- [ ] **Step 3: Тесты проходят**

Run: `bun test src/lib/__tests__/series.test.ts`
Expected: PASS.

- [ ] **Step 4: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run typecheck`

```bash
git add src/lib/series.ts src/lib/__tests__/series.test.ts
git commit -m "$(cat <<'EOF'
Серия запусков: чистая логика страницы (потолок, сброс серии, восстановление)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Страница ведёт несколько запусков

Перед правкой загрузить скилл `shadcn` (правило проекта: любые фронтенд-изменения только через него); новых shadcn-компонентов не добавляется, пользуемся имеющимися `Button`, `Tabs`, `Slider`, `InputGroup`, `ResultFrame`. Текст в интерфейсе не добавляется.

**Files:**
- Modify: `src/components/Generate.tsx`

**Interfaces:**
- Consumes: `src/lib/series.ts` (Task 6: `Run`, `ServerRecord`, `addRun`, `canStart`, `dropRun`, `mergeRuns`, `parseSeriesIds`, `renameRun`, `resultOf`, `restoreRuns`, `seriesIds`, `settleRun`), `GET /api/generations/running` (Task 1), ответы `202` от `/api/generate` (Task 5).
- Produces: страница с рамкой на каждый запуск (`data-run="<id>"` на обёртке рамки), ключ `localStorage` `gen42-series`.

Правки применяются через `Edit` по регионам.

- [ ] **Step 1: Импорты**

В блоке импортов:
- добавить `import { cn } from "@/lib/utils";` и

```ts
import {
	addRun,
	canStart,
	dropRun,
	mergeRuns,
	parseSeriesIds,
	type Run,
	renameRun,
	resultOf,
	restoreRuns,
	type ServerRecord,
	seriesIds,
	settleRun,
} from "@/lib/series";
```

- [ ] **Step 2: Константы и хранилище серии**

Заменить блок от комментария `/** Идущая генерация: по этому ключу она возобновляется после обновления страницы */` до конца функции `rememberResult` (константы `PENDING_KEY`, `RESULT_KEY`, `POLL_INTERVAL_MS`, `POLL_TIMEOUT_MS`, функции `newGenerationId`, `readStored`, `rememberPending`, `forgetPending`, `rememberResult`) на:

```ts
/** Серия запусков: id рамок, по ним после обновления страницы возвращаются готовые и дожидаются идущие */
const SERIES_KEY = "gen42-series";
/** Ключи прежней версии (одна генерация): читаются один раз как затравка и удаляются */
const LEGACY_KEYS = ["gen42-pending", "gen42-result"];
const POLL_INTERVAL_MS = 2500;
/** Дольше воркфлоу (худший прогон ~14 минут) и короче закрытия зависших на сервере: см. `ULTRA_CLIENT_WAIT_MS` */
const POLL_TIMEOUT_MS = ULTRA_CLIENT_WAIT_MS;

/** id запуска придумывает клиент — иначе после обновления его не найти */
function newGenerationId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}
}

function readSeriesIds(): string[] {
	try {
		const ids = parseSeriesIds(localStorage.getItem(SERIES_KEY));
		for (const key of LEGACY_KEYS) {
			const legacy = localStorage.getItem(key);
			if (legacy) ids.push(legacy);
			localStorage.removeItem(key);
		}
		return [...new Set(ids)];
	} catch {
		return [];
	}
}

function writeSeriesIds(ids: string[]) {
	try {
		localStorage.setItem(SERIES_KEY, JSON.stringify(ids));
	} catch {
		/* хранилище недоступно — серия просто не переживёт обновление */
	}
}
```

- [ ] **Step 3: Состояние компонента**

Заменить блок состояний от `const [prompt, setPrompt] = useState("");` до `const aliveRef = useRef(true);` включительно (вместе с комментариями; состояния `loading`, `resumed`, `result`, `resultPrompt`, `seedCopied` уходят) на:

```ts
	const [prompt, setPrompt] = useState("");
	// запуски серии, у каждого своя рамка; ref — синхронный взгляд для асинхронных
	// обработчиков (опрос, ответы сервера), состояние — для отрисовки
	const [runs, setRuns] = useState<Run[]>([]);
	const runsRef = useRef<Run[]>([]);
	const [error, setError] = useState("");
	const [copiedRun, setCopiedRun] = useState<string | null>(null);
	const [history, setHistory] = useState<any[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [models, setModels] = useState<PublicImageModel[]>([]);
	const [engine, setEngine] = useState<SpaceEngine>("krea");
	const [mode, setMode] = useState<Mode>(readStoredMode);
	const [reasoning, setReasoning] =
		useState<UltraReasoning>(readStoredReasoning);
	const pollTimer = useRef<number | null>(null);
	const galleryRef = useRef<HTMLDivElement>(null);
	// запуск, чья картинка вошла в «Недавние» последней: из его рамки вылетает миниатюра
	const lastSettled = useRef<string | null>(null);
	useFlipList(galleryRef, history.map((img) => img.id).join(","), () =>
		document.querySelector<HTMLElement>(
			`[data-run="${lastSettled.current}"] [data-slot="result-frame"]`,
		),
	);
	// асинхронные продолжения не должны жить дольше экрана: он снимается при
	// переходе в админку
	const aliveRef = useRef(true);

	function commit(next: Run[]) {
		runsRef.current = next;
		setRuns(next);
		writeSeriesIds(seriesIds(next));
	}
```

- [ ] **Step 4: Монтирование**

В эффекте монтирования (`useEffect(() => { aliveRef.current = true; … }, [])`) заменить вызов `resumeGeneration();` на `resumeRuns();`, а очистку таймера на:

```ts
		return () => {
			aliveRef.current = false;
			if (pollTimer.current !== null) {
				clearTimeout(pollTimer.current);
				pollTimer.current = null;
			}
		};
```

- [ ] **Step 5: Запросы, опрос, восстановление, запуск**

Удалить функции `fetchGeneration`, `fetchActiveGeneration`, `showResult`, `settleGeneration`, `pollGeneration`, `waitForGeneration`, `resumeGeneration` и `handleGenerate` (один непрерывный блок: от `async function fetchGeneration` до конца `handleGenerate` перед `async function downloadImage`) и вставить на их место:

```ts
	async function fetchGeneration(id: string): Promise<ServerRecord | null> {
		try {
			const res = await fetch(`/api/generations/${id}`);
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	}

	async function fetchRunning(): Promise<ServerRecord[]> {
		try {
			const res = await fetch("/api/generations/running");
			if (!res.ok) return [];
			const data = await res.json();
			return Array.isArray(data) ? data : [];
		} catch {
			return [];
		}
	}

	/** Итог запуска: картинка в его рамке или ошибка вместо ожидания */
	function settleRecord(id: string, record: ServerRecord) {
		if (record.status === "completed" && record.image_url) {
			lastSettled.current = id;
			commit(settleRun(runsRef.current, id, resultOf(record)));
			refreshBalance();
			loadHistory();
			return;
		}
		commit(dropRun(runsRef.current, id));
		setError(
			record.error || "Не удалось создать изображение, кредиты возвращены",
		);
		refreshBalance();
	}

	/** Один цикл опроса на все идущие запуски; сам себя планирует, пока что-то идёт */
	function schedulePoll() {
		if (pollTimer.current !== null) return;
		if (!runsRef.current.some((run) => run.status === "running")) return;
		pollTimer.current = window.setTimeout(pollRuns, POLL_INTERVAL_MS);
	}

	async function pollRuns() {
		pollTimer.current = null;
		if (!aliveRef.current) return;
		const active = runsRef.current.filter((run) => run.status === "running");
		const records = await Promise.all(active.map((run) => fetchGeneration(run.id)));
		if (!aliveRef.current) return;
		active.forEach((run, index) => {
			const record = records[index];
			if (record && record.status !== "running") {
				settleRecord(run.id, record);
				return;
			}
			if (Date.now() < run.deadline) return;
			// сервер молчит дольше обычного — не держим рамку в ожидании
			commit(dropRun(runsRef.current, run.id));
			setError(
				record
					? "Не удалось дождаться результата, обновите страницу"
					: "Не удалось получить результат, обновите страницу",
			);
		});
		schedulePoll();
	}

	/**
	 * Обновление страницы не должно терять процесс: идущие запуски (свои из серии и
	 * из других вкладок) продолжают ждаться, готовые возвращаются картинкой.
	 */
	async function resumeRuns() {
		const ids = readSeriesIds();
		const [running, known] = await Promise.all([
			fetchRunning(),
			Promise.all(ids.map(fetchGeneration)),
		]);
		if (!aliveRef.current) return;
		const found = known.filter(
			(record): record is ServerRecord => record !== null,
		);
		const failed = found.find((record) => record.status === "failed");
		if (failed) {
			setError(
				failed.error || "Не удалось создать изображение, кредиты возвращены",
			);
		}
		const restored = restoreRuns([...running, ...found], Date.now(), POLL_TIMEOUT_MS);
		// промпт идущей генерации возвращается в поле
		const newest = restored.find((run) => run.status === "running");
		if (newest) setPrompt((current) => current || newest.prompt);
		commit(mergeRuns(runsRef.current, restored));
		schedulePoll();
	}

	async function handleGenerate() {
		if (!prompt.trim() || outOfCredits || !canStart(runsRef.current)) return;

		// id придумывает клиент: так запуск находится после обновления страницы
		const id = newGenerationId();
		setError("");
		commit(
			addRun(runsRef.current, {
				id,
				prompt,
				status: "running",
				resumed: false,
				deadline: Date.now() + POLL_TIMEOUT_MS,
				result: null,
			}),
		);
		schedulePoll();

		try {
			const res = await fetch("/api/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					activeMode === "ultra"
						? { prompt, engine: "ultra", id, reasoning }
						: {
								prompt,
								engine,
								id,
								...(engine === "krea" ? { model: "Turbo", steps: 8 } : {}),
								width: 1024,
								height: 1024,
								guidance: 0.0,
							},
				),
			});

			// ответ платформы может быть не-JSON (обрыв, лимит времени) — тогда пользователю
			// достаётся нейтральный текст, а не сообщение парсера
			const fallback =
				activeMode === "ultra"
					? "Не удалось создать изображение"
					: "Ошибка генерации";
			const data = await res.json().catch(() => null);
			if (!res.ok || !data) {
				throw new Error(data?.error || fallback);
			}

			// сервер принимает запуск в работу и отвечает сразу; если клиентский id был
			// занят, он выдал другой
			if (data.id && data.id !== id) {
				commit(renameRun(runsRef.current, id, data.id));
			}
			refreshBalance();
		} catch (err: any) {
			// обрыв связи или сбой ответа: строка на сервере — источник правды
			const record = await fetchGeneration(id);
			if (record?.status === "running") return;
			if (record) {
				settleRecord(id, record);
				return;
			}
			commit(dropRun(runsRef.current, id));
			setError(err.message);
			refreshBalance();
		}
	}
```

- [ ] **Step 6: Копирование seed**

Заменить функцию `copySeed` на:

```ts
	async function copySeed(run: Run) {
		const seed = run.result?.seed;
		if (seed === null || seed === undefined) return;
		try {
			await navigator.clipboard.writeText(String(seed));
			setCopiedRun(run.id);
			setTimeout(
				() => setCopiedRun((current) => (current === run.id ? null : current)),
				1500,
			);
		} catch {
			/* буфер обмена недоступен */
		}
	}
```

- [ ] **Step 7: Разметка поля и рамок**

В JSX:

1. У обоих `TabsTrigger` убрать `disabled={loading}`; у `ModelPicker` убрать строку `disabled={loading}`; у `Slider` убрать строку `disabled={loading}`.
2. У кнопки генерации `disabled={loading || !prompt.trim() || outOfCredits}` заменить на:

```tsx
										disabled={!prompt.trim() || outOfCredits || !canStart(runs)}
```

3. Блок результата — от `{(loading || result || history.length === 0) && (` до его закрывающего `)}` (перед `{history.length > 0 && (` секции «Недавние») — заменить на:

```tsx
			{(runs.length > 0 || history.length === 0) && (
				<div className="animate-pop-in mt-10">
					<div
						className={cn("grid grid-cols-1 gap-4", runs.length > 1 && "sm:grid-cols-2")}
					>
						{runs.length === 0 ? (
							<ResultFrame loading={false} image={null} />
						) : (
							runs.map((run) => (
								<div key={run.id} data-run={run.id}>
									<ResultFrame
										loading={run.status === "running"}
										resumed={run.resumed}
										image={
											run.result
												? {
														url: run.result.image_url,
														alt: run.prompt || "Сгенерированное изображение",
													}
												: null
										}
									/>
									{run.result && (
										<div className="mt-4 flex items-center justify-end gap-2">
											{run.result.seed !== null && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => copySeed(run)}
													title="Скопировать seed"
													aria-label={`Скопировать seed ${run.result.seed}`}
													className="tabular-nums"
												>
													{copiedRun === run.id ? (
														<IconCheck className="size-3.5 text-primary" />
													) : (
														<IconCopy className="size-3.5" />
													)}
													{run.result.seed}
												</Button>
											)}
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													downloadImage(run.result!.image_url, run.result!.seed)
												}
											>
												<IconDownload className="size-4" />
												Скачать
											</Button>
										</div>
									)}
								</div>
							))
						)}
					</div>
				</div>
			)}
```

- [ ] **Step 8: Типы, текст, импульсы**

Run: `bun run lint:fix`
Run: `bun run typecheck`
Expected: без ошибок (в файле не осталось ссылок на `loading`, `result`, `resultPrompt`, `seedCopied`, `PENDING_KEY`, `RESULT_KEY`, `resumed`).

Run: `bun test src/lib/__tests__/ui-text.test.ts src/lib/__tests__/ui-impulse-coverage.test.ts`
Expected: PASS (новых русских строк нет: все использованные строки уже были в файле; `ui-text.baseline.json` не менялся).

- [ ] **Step 9: Коммит**

```bash
git add src/components/Generate.tsx
git commit -m "$(cat <<'EOF'
Страница: несколько запусков одновременно, сетка рамок серии

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Сценарий `ui:check` для нескольких запусков

**Files:**
- Modify: `scripts/ui-check.ts`

**Interfaces:**
- Consumes: страница из Task 7, контракт `202` и `GET /api/generations/running`.
- Produces: подставной API с `202` и опросом по id; проверки «рамок 4», «две колонки», «кнопка неактивна на четырёх», «новая серия — одна рамка», бюджеты слоёв и анимаций для нескольких рамок.

- [ ] **Step 1: Подставной API**

В `scripts/ui-check.ts` заменить в `mockApi` блок от `if (p === "/api/generations") return json(state.history);` до закрывающей скобки ветки опроса записи (`/^\/api\/generations\/[^/]+$/`) на:

```ts
		const waitMs = opts.waitMs ?? 4500;
		const record = (id: string, run: { startedAt: number; prompt: string }) =>
			Date.now() - run.startedAt < waitMs
				? {
						id,
						status: "running",
						prompt: run.prompt,
						created_at: new Date(run.startedAt).toISOString(),
					}
				: {
						...REC,
						id,
						prompt: run.prompt,
						created_at: new Date(run.startedAt).toISOString(),
					};
		if (p === "/api/generations")
			return json(
				[...state.runs]
					.map(([id, run]) => record(id, run))
					.filter((r) => r.status === "completed")
					.reverse(),
			);
		if (p === "/api/generations/active") return json({ error: "none" }, 404);
		if (p === "/api/generations/running")
			return json(
				[...state.runs]
					.map(([id, run]) => record(id, run))
					.filter((r) => r.status === "running")
					.reverse(),
			);
		if (p === "/api/generate") {
			// запуск принимается сразу, результат приходит опросом (как у воркфлоу)
			const body = JSON.parse(route.request().postData() ?? "{}");
			const id =
				typeof body.id === "string" ? body.id : `g${state.runs.size + 1}`;
			state.runs.set(id, {
				startedAt: Date.now(),
				prompt: body.prompt ?? "кот в короне",
			});
			return json({ id, engine: "krea", cost: 1 }, 202);
		}
		// опрос записи: идёт, пока не прошло время ожидания
		if (/^\/api\/generations\/[^/]+$/.test(p)) {
			const id = p.split("/").pop() ?? "";
			const run = state.runs.get(id);
			return run ? json(record(id, run)) : json({ error: "Не найдено" }, 404);
		}
```

Объявление `state` заменить на:

```ts
const state: {
	runs: Map<string, { startedAt: number; prompt: string }>;
} = { runs: new Map() };
```

В начале функции `open(...)` (после `const context = await browser.newContext({…})`... точнее первой строкой тела функции) добавить `state.runs.clear();`, чтобы запуски одного контекста не попадали в другой.

В шапке-комментарии файла после слов «слайдер → генерация → занавес → лайтбокс» добавить «→ несколько запусков сразу».

Run: `grep -n "state.history\|state.startedAt" scripts/ui-check.ts`
Expected: пустой вывод (старые поля состояния нигде не остались).

- [ ] **Step 2: Замер анимаций одной рамки**

Перед строкой `await shot(page, "09-waiting");` вставить:

```ts
		// сколько анимаций приносит одна рамка ожидания: по этой цене считается бюджет серии
		const waitAnimations = await animations(page);
```

- [ ] **Step 3: Сценарий нескольких запусков**

Перед строкой `const raf1 = await rafCount(page);` вставить:

```ts
		// ── несколько запусков сразу: рамки серии, потолок четыре ────────────
		{
			const generate = page.getByRole("button", { name: /Сгенерировать/ });
			const frames = page.locator('[data-slot="result-frame"]');
			const finished = (count: number) =>
				page.waitForFunction(
					(n) =>
						document.querySelectorAll('[data-slot="result-frame"] img')
							.length === n,
					count,
					{ timeout: 20000 },
				);
			await page.fill("#prompt", "кот в короне");
			await generate.click();
			await pause(page, 300);
			const stillOpen =
				(await generate.isEnabled()) &&
				(await page.getByRole("tab", { name: "Ультра" }).isEnabled());
			check(
				"несколько запусков: во время ожидания кнопка и вкладки доступны",
				stillOpen ? 1 : 0,
				stillOpen,
			);
			for (let i = 0; i < 3; i++) {
				await generate.click();
				await pause(page, 150);
			}
			await pause(page, 1500);
			const count = await frames.count();
			check("несколько запусков: рамок серии", count, count === 4);
			const blocked = await generate.isDisabled();
			check(
				"несколько запусков: при четырёх идущих кнопка неактивна",
				blocked ? 1 : 0,
				blocked,
			);
			const columns = await page.evaluate(
				() =>
					new Set(
						[
							...document.querySelectorAll('[data-slot="result-frame"]'),
						].map((frame) => Math.round(frame.getBoundingClientRect().left)),
					).size,
			);
			check("несколько запусков: рамки в две колонки", columns, columns === 2);
			// каждая рамка ожидания стоит не больше, чем одна в прежнем бюджете
			const seriesLayers = IDLE_LAYERS + 4 * (WAIT_LAYERS - IDLE_LAYERS);
			check(
				"несколько запусков: слоёв композитора",
				layers,
				layers <= seriesLayers,
			);
			if (layers > seriesLayers) console.log("  слои:", await describeLayers());
			const seriesAnimations = await animations(page);
			check(
				"несколько запусков: активных анимаций (дрейф + по рамке)",
				seriesAnimations,
				seriesAnimations <= 1 + 4 * (waitAnimations - 1),
			);
			const rafSeries0 = await rafCount(page);
			await pause(page, 1000);
			check(
				"несколько запусков: вызовов requestAnimationFrame за 1 с",
				(await rafCount(page)) - rafSeries0,
				(await rafCount(page)) === rafSeries0,
			);
			await shot(page, "12c-series-waiting");
			await finished(4);
			await pause(page, 1500);
			await shot(page, "12d-series-done");
			const reopened = await generate.isEnabled();
			check(
				"несколько запусков: после итога кнопка снова доступна",
				reopened ? 1 : 0,
				reopened,
			);
			// новый запуск при нуле идущих начинает серию заново
			await generate.click();
			await pause(page, 300);
			const afterReset = await frames.count();
			check(
				"несколько запусков: новая серия начинается с одной рамки",
				afterReset,
				afterReset === 1,
			);
			await finished(1);
		}

```

(Пустая строка после закрывающей `}` отделяет блок от `const raf1 …`.)

- [ ] **Step 4: Прогон**

Run (в фоне, `run_in_background`): `bun run ui:check`
Expected: все строки со знаком `✓`, включая новые «несколько запусков: …»; прежние строки (простой, ожидание, вспышка, шапка, обновление страницы, дудлы, reduced-motion) тоже `✓`. Скриншоты `captures/ui-check/shots/12c-series-waiting.png` и `12d-series-done.png` открыть и убедиться глазами: четыре рамки в две колонки, у готовых кнопки «Скачать» и seed. Если красная строка по слоям или анимациям — разобрать причину (`describeLayers`, `describeAnimations`), а не ослаблять порог.

- [ ] **Step 5: Проверки и коммит**

Run: `bun run lint:fix`
Run: `bun run typecheck`

```bash
git add scripts/ui-check.ts
git commit -m "$(cat <<'EOF'
ui:check: несколько запусков сразу, потолок и новая серия

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Документация и спеки

**Files:**
- Modify: `AGENTS.md`, `README.md` (если упоминает синхронную генерацию), `docs/superpowers/specs/2026-10-18-parallel-generations-design.md`

- [ ] **Step 1: Найти устаревшие места**

Run: `grep -nE "gen42-pending|gen42-result|на время генерации слайдер|/api/generations/active|синхронн" AGENTS.md README.md`
Expected: список строк для правки (в `AGENTS.md` это абзац «Генерация: выбор движка …» раздела «Стиль UI», строка про `/api/generations/active` в «Архитектура» и абзац «Обновление страницы не теряет процесс» раздела «Обогащение промпта»).

- [ ] **Step 2: `AGENTS.md`**

Правки через `Edit` по точным подстрокам:

1. В пункте «`src/server.ts` — основной entrypoint» в перечне роутов заменить `` `/api/generations`, `/api/generations/active`, `/api/generations/:id` `` на `` `/api/generations`, `/api/generations/active`, `/api/generations/running`, `/api/generations/:id` ``.
2. В разделе «Генерация (HuggingFace)» первым пунктом добавить:

```
- Krea 2 и Ideogram 4 идут воркфлоу Vercel Workflow (`workflows/spaces/`, логика попытки и ротации ключей в `src/lib/spaces/`), как «Ультра»: `POST /api/generate` создаёт строку `running`, списывает кредиты, стартует воркфлоу и сразу отвечает `202 { id, engine, cost }` (общий приём `src/lib/start-run.ts`), страница ждёт опросом `/api/generations/:id`. Шаги: `enhance` → `generate` (одна попытка: ключ HF, Space, скачивание, картинка и превью в хранилище, квота ключа; `maxRetries = 0`, потому что каждый вызов расходует прогон ZeroGPU) → `complete`; любая ошибка → `fail` с возвратом кредитов ровно один раз. Цикл до 5 попыток (`key_exhausted` исключает ключ, `queue_timeout` повторяет тот же, нет ключей или прочая ошибка завершают запуск) живёт в коде воркфлоу (`runWithRotation`), новые попытки не начинаются позже 10 минут от старта (`SPACE_RUN_DEADLINE_MS`); порядок «худший прогон < ожидание страницы < закрытие зависших» держит `ultra-budgets.test.ts`. Коды сбоев в истории прежние: на практике приходят `all_keys_exhausted` и `error` (остальные исходы попытки воркфлоу повторяет). Krea и Ideogram теперь зависят от Workflow и очереди Vercel: при их недоступности запуск закрывается с возвратом кредитов (502)
```

3. В абзаце «Жизненный цикл записи генерации» после фразы про клиентский `id` добавить: `Идущих запусков у пользователя не больше MAX_RUNNING_GENERATIONS (4, src/lib/generation-limits.ts): подсчёт и вставка строки идут в startGeneration одной транзакцией под pg_advisory_xact_lock по пользователю; на потолке 429 текстом лимита запросов (TOO_MANY_REQUESTS_ERROR), у «Ультры» то же`.
4. В абзаце «Обновление страницы не теряет процесс» добавить: `GET /api/generations/running` отдаёт все идущие запуски пользователя (до потолка).`, а слова «клиент опрашивает их каждые 2,5 с» заменить на «клиент опрашивает идущие запуски одним циклом каждые 2,5 с».
5. В абзаце «Генерация: выбор движка …» раздела «Стиль UI»: убрать слова «на время генерации слайдер заблокирован»; заменить фразу «обновление страницы во время генерации продолжает то же ожидание (промпт возвращается в поле), а последняя показанная картинка остаётся на экране — это держится на `localStorage` `gen42-pending` (идущая генерация) и `gen42-result` (последний результат)» на «обновление страницы во время генерации продолжает то же ожидание (промпт идущего запуска возвращается в поле), а готовые рамки серии остаются на экране — это держится на `localStorage` `gen42-series` (id рамок серии) и на `GET /api/generations/running`; ключи прежней версии `gen42-pending` и `gen42-result` читаются один раз как затравка и удаляются».
6. В «Стиль UI» после абзаца о генерации добавить новый пункт:

```
- **Несколько запусков одновременно** (issue #33): пока идёт генерация, поле, вкладки «Изображение / Ультра», выбор движка и ползунок рассуждения остаются доступными; кнопка неактивна только при пустом промпте, нехватке кредитов или четырёх идущих запусках (потолок сервера). Каждый запуск — своя рамка `ResultFrame` (обёртка `data-run="<id>"`) со своим ожиданием, занавесом и «выдохом», под готовой картинкой свои «Скачать» и seed. Одна рамка занимает всю ширину, две и больше встают в две колонки; новые первыми. Запуск при нуле идущих начинает серию заново (готовые рамки уходят в «Недавние»), запуск при идущем добавляет рамку; в серии не больше 8 рамок (идущие не вытесняются). Логика серии — чистый модуль `src/lib/series.ts` (тесты `series.test.ts`), опрос идущих — один цикл каждые 2,5 с; миниатюра в «Недавних» вылетает из рамки своего запуска (`lastSettled` в `Generate.tsx`). Видимого текста сценарий не добавляет; проверка — раздел «несколько запусков» в `bun run ui:check`
```

7. В разделе «Режим «Ультра»» убрать упоминание, что слайдер блокируется (если осталось), и в «Проверка» перечне `ui:check` дописать «→ несколько запусков».

- [ ] **Step 3: `README.md`**

Run: `grep -nE "генерац|Workflow|202" README.md`
Если README описывает синхронный ответ `POST /api/generate` или запрет параллельных запусков — привести в соответствие (ответ `202` и опрос, потолок 4 идущих); если не описывает — оставить без изменений и отметить это в итоге.

- [ ] **Step 4: Правки спеки**

В `docs/superpowers/specs/2026-10-18-parallel-generations-design.md`:

1. В разделе «4. Клиент» заменить предложение про `useFlipList`: «`useFlipList` получает поиск рамки по id запуска вместо первой рамки на странице» на «источником вылета служит рамка последнего завершённого запуска (`[data-run="<id>"]`), `useFlipList` остаётся без изменений».
2. В разделе «2. Воркфлоу», шаг `fail`: заменить «`error_message` в прежнем формате `<код>: <текст>` (`all_keys_exhausted`, `key_exhausted (<статус>)`, `queue_timeout`, `error`)» на «`error_message` в прежнем формате `<код>: <текст>`; на практике приходят `all_keys_exhausted` и `error`, как и у прежнего обработчика (исходы `key_exhausted` и `queue_timeout` воркфлоу всегда повторяет)».

- [ ] **Step 5: Коммит**

Run: `bun run lint`

```bash
git add AGENTS.md README.md docs/superpowers/specs/2026-10-18-parallel-generations-design.md
git commit -m "$(cat <<'EOF'
Документация: несколько генераций одновременно, воркфлоу Krea и Ideogram

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

(Если `README.md` не менялся, в `git add` его не включать.)

---

### Task 10: Живая проверка на dev и итоговая верификация

Перед началом загрузить скиллы `agent-browser` (живые проверки) и `verification-before-completion`. Правила замеров проекта: каждый запрос отдельной фоновой задачей; лишнего не гонять (расходуются прогоны ZeroGPU); сеть владельца не чинить.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-18-parallel-generations-design.md` (таблица «Источники и статусы»)

- [ ] **Step 1: Сборка и dev-сервер**

Run: `bun run workflow:build`
Expected: без ошибок.

Run (в фоне, `run_in_background`): `bun dev`
Expected: сервер на `http://localhost:3000`; в логе нет ошибок Workflow.

- [ ] **Step 2: Рабочий HF-ключ в dev**

Через Neon MCP (`list_branches` для id ветки `dev` проекта `rapid-water-10723622`, затем `run_sql` с `branch_id`; только SELECT без колонки `key`):

```sql
SELECT id, name, is_active, hf_current, hf_runs_remaining, hf_runs_limit FROM api_keys WHERE provider = 'huggingface'
```

Expected: хотя бы один активный ключ с `hf_runs_remaining >= 6` (нужно до 4 прогонов Krea и 1 Ideogram). Если ключа нет или прогонов не хватает — остановиться и спросить владельца (это его ключи; не выдумывать обходов).

- [ ] **Step 3: Тестовый пользователь на dev**

Зарегистрировать временного пользователя на dev-сервере (стартовые 42 кредита выдаются при регистрации):

```bash
curl -sS -c /tmp/claude-1000/-home-crbsnana--------------coding-jb-gen42/8012ed7d-06fa-4caa-b08c-698a02b4bf18/scratchpad/jar.txt -H "Content-Type: application/json" -d '{"email":"parallel-check@example.test","password":"check-12345678","name":"Проверка"}' http://localhost:3000/api/auth/sign-up/email
```

Expected: JSON с пользователем и cookie в файле. Если регистрация закрыта — спросить владельца, как войти.

- [ ] **Step 4: Четыре Krea одновременно, пятый отклонён**

Запустить четыре запроса, каждый отдельной фоновой командой (`run_in_background`), ответ и время в отдельные файлы scratchpad:

```bash
curl -sS -b /tmp/claude-1000/-home-crbsnana--------------coding-jb-gen42/8012ed7d-06fa-4caa-b08c-698a02b4bf18/scratchpad/jar.txt -H "Content-Type: application/json" -d '{"prompt":"кот в короне №1","engine":"krea","id":"par-check-0001","model":"Turbo","steps":8,"width":1024,"height":1024}' -w "\nHTTP %{http_code} %{time_total}s\n" http://localhost:3000/api/generate
```

(для остальных поменять `№1` и `id` на `par-check-0002…0004`). Затем пятый с `id` `par-check-0005`.
Expected: первые четыре `HTTP 202` с `{"id":…,"engine":"krea","cost":1}` за доли секунды; пятый `HTTP 429` с текстом «Слишком много запросов, подождите минуту», и строки для него нет.

Run: `curl -sS -b …/jar.txt http://localhost:3000/api/generations/running`
Expected: массив из 4 записей `status: "running"`.

- [ ] **Step 5: Итоги и замеры**

Опрашивать каждые ~5 с `GET /api/generations/par-check-000N` (фоновый цикл `until`-проверкой через Monitor, не `sleep`) до `completed`/`failed`. Записать: время каждого запуска от POST до `completed`, итоговый статус, `duration`.

Run: `node_modules/.bin/workflow inspect runs`
Expected: четыре прогона `spaceImageWorkflow` в `completed`; по каждому снять число шагов и событий (`workflow inspect steps` / `events` для одного из прогонов).

Проверить в базе (Neon MCP, ветка `dev`): `SELECT id, status, cost, error_message, enhanced_prompt IS NOT NULL AS has_prompt, api_key_id, llm_key_id FROM generations WHERE id LIKE 'par-check-%'` — у успешных `cost = 1`, поля заполнены; кредиты пользователя списаны ровно на 4.

Один запуск Ideogram (`"engine":"ideogram"`, `id` `par-check-0006`) — убедиться в статусе и цене 3.

- [ ] **Step 6: Проверка сбоя и возврата**

Запустить заведомо неуспешный сценарий, не расходуя прогонов: временно (в dev-базе) пометить единственный HF-ключ `is_active = FALSE`, отправить запрос Krea — ожидается `202`, затем запись `failed` с `error_message` `all_keys_exhausted: …`, кредиты возвращены (`cost = 0`, баланс прежний). Ключ вернуть `is_active = TRUE`. (Это правка dev-ветки, а не прод-данных.)

- [ ] **Step 7: Остановить dev-сервер, записать результаты в спеку**

Остановить фоновый `bun dev` (TaskStop). В таблице «Источники и статусы» спеки заменить строки:
- «Реальная параллельность двух запросов с одного ключа HF» → «подтверждено/опровергнуто замером: …» с фактическими временами четырёх запусков из Step 5;
- «Накладные расходы очереди Workflow на 10-секундном прогоне Krea» → фактическое время запуска Krea через воркфлоу против прежних ~10 с, число шагов и событий на запуск (заменить и строку про «10–13 событий» на измеренное);
- добавить строки про проверку потолка (пятый → 429) и возврата при сбое.

Run: `bun run lint`

```bash
git add docs/superpowers/specs/2026-10-18-parallel-generations-design.md
git commit -m "$(cat <<'EOF'
Спека: результаты живой проверки параллельных генераций на dev

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Итоговая верификация (свежие свидетельства)**

Каждая команда отдельным вызовом, вывод читать целиком, прежде чем делать выводы:

Run: `bun run lint`
Expected: без ошибок и предупреждений.

Run: `bun run typecheck`
Expected: без ошибок.

Run: `bun test`
Expected: все тесты проходят (один полный прогон; при красных — сначала разобрать причину, затем один повторный прогон).

Run: `bun run build`
Expected: сборка воркфлоу и фронтенда без ошибок.

Run: `bun run build:vercel`
Expected: сборка Build Output API без ошибок; в `.vercel/output/functions/.well-known/workflow/v1/flow.func` присутствует новый воркфлоу (`grep -rl spaceImageWorkflow .vercel/output/functions/.well-known/workflow/v1/flow.func`).

Run (в фоне): `bun run ui:check`
Expected: все строки `✓`.

- [ ] **Step 9: Доклад владельцу**

Не пушить и не открывать PR. Сообщить, что работа на ветке `feat/parallel-generations` закончена и проверена (с цифрами замеров из Step 5), и спросить: «Считаешь ли готовым? После «готово» запушу ветку, открою PR (скриншоты до/после через скилл `before-and-after`) и прослежу за CI».

---

## Самопроверка плана против спеки

| Раздел спеки | Где реализовано |
|---|---|
| §1 Контракт: `202` для Krea/Ideogram, общий приём, ошибки 400/401/402/429/502 | Task 2, Task 5 |
| §1 `GET /api/generations/running`, `/active` не тронут | Task 1 |
| §1 Совместимость открытых вкладок | следует из ветки `res.status === 202` в прежнем клиенте; сохранена в Task 7 |
| §2 Воркфлоу и шаги, `maxRetries = 0`, данные вместо ошибок, цикл попыток, срок 10 минут | Task 3, Task 4 |
| §2 Нет node-пакетов в коде воркфлоу | Task 3 (чистые модули), Global Constraints |
| §3 Потолок 4, транзакция + замок, 429 существующим текстом | Task 1, Task 2 |
| §4 Клиент: серия, запуск, неблокируемые контролы, раскладка, сброс серии, сбой, обновление страницы, нулевой текст | Task 6, Task 7 |
| §4 Миниатюра вылетает из рамки своего запуска | Task 7 (`lastSettled`), правка спеки в Task 9 |
| §5 Бюджеты времени, связанность с Workflow | Task 3 (тест бюджетов), Task 9 (документация) |
| §6 Тесты, живой прогон, `ui:check` | Tasks 1–8, Task 10 |
| §7 Выкат: без миграций и env; сборщик находит папку; документация; ветка без пуша | Task 4 Step 7, Task 9, Task 10 Step 9 |
| Статусы «не проверено» (параллельность Space, накладные расходы очереди) | Task 10 Steps 4–5, 7 |
