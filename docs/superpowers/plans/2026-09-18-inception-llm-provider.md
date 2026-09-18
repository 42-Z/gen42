# Inception Labs (mercury-2.5) — второй LLM-провайдер. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить Inception Labs (`https://api.inceptionlabs.ai/v1`, модель `mercury-2.5`) как второго LLM-провайдера для обогащения промптов рядом с Poolside: единый generic-клиент, общий пул ключей с ротацией, поддержка в админке.

**Architecture:** `src/lib/poolside.ts` превращается в `src/lib/llm.ts` с реестром провайдеров `LLM_PROVIDERS` и generic-вызовом `callLlm({ provider, ... })`. Ключи обоих провайдеров живут в существующей таблице `api_keys` (`provider`: `poolside` | `inception`); enhance берёт ключ из единого LLM-пула (`getAvailableLlmKey`) и диспетчерит вызов по `key.provider`. Админка получает селект провайдера при добавлении и колонку «Провайдер».

**Tech Stack:** Bun, `ai` v7 + `@ai-sdk/openai-compatible` v3 (оба уже в проекте, версии актуальные: ai 7.0.105 при последней 7.0.106 — патч, апгрейд не требуется), postgres.js, React + shadcn/ui.

**Проверено по источникам (не по памяти):**
- Inception API: OpenAI-совместимый, Bearer-ключ в `Authorization`, 401/402/403/429 = «ключ не работает» (402 — биллинг/квота), rate-limit заголовков в спецификации нет → `rl_*` остаются `null` (штатно). Temperature допустима 0.5–1 (используем 0.9 как у Poolside). `reasoning_effort`: `instant|low|medium|high` (по умолчанию medium — медленно для дедлайна enhance 25 сек, ставим `low`).
- AI SDK (бандл-доки установленной версии, `node_modules/@ai-sdk/openai-compatible/docs/index.mdx`): `reasoningEffort` — штатная chat-опция (`providerOptions: { [providerName]: { reasoningEffort: "low" } }` → в body уйдёт `reasoning_effort`); произвольные поля провайдера прокидываются в тело через `providerOptions` под camelCase-именем провайдера — механизм, которым poolside уже передаёт `chat_template_kwargs`.
- Схема БД не меняется: `api_keys.provider VARCHAR(20)` без CHECK — `"inception"` влезает; миграция не нужна.
- Формат ключей Inception недокументирован; по решению владельца валидация — любой непустой ключ.
- В `vercel.json` ничего добавлять не нужно: новых пакетов нет (NFT-трассировка та же).

**Решения:**
- Ротация ключей — единый пул по провайдерам `poolside + inception` (`ORDER BY rl_remaining DESC NULLS LAST`): ключи с измеренным остатком (Poolside) идут первыми, ключи Inception (без заголовков → `NULL`) подключаются после; ключ выбирается до вызова, как сейчас.
- Inception 402 трактуется как «ключ мёртв» → деактивация (у Poolside списка 402 нет).
- Сообщение об ошибке валидации для inception: «Нужны name и ключ» (без префикса).

**Ручные шаги после мержа и деплоя (владельцу, не в плане):** добавить Inception-ключ в админке («Ключи LLM» → провайдер Inception), нажать «Проверить и включить», опционально прогнать `bun scripts/smoke-llm.ts inception`. Env-переменные не нужны — дефолты вшиты в код.

---

## File Structure

| Файл | Действие | Ответственность |
| --- | --- | --- |
| `src/lib/llm.ts` | создать (переезд из `src/lib/poolside.ts`) | реестр LLM-провайдеров, generic `callLlm`, общие типы и ошибки |
| `src/lib/keys.ts` | править | провайдер `inception`, `isLlmProvider`, `getAvailableLlmKey` (единый пул), валидация ключей |
| `src/lib/enhance.ts` | править | ключ из общего пула, диспетчеризация `callLlm` по `key.provider`, модель провайдера в результат |
| `src/api/admin.ts` | править | `provider=inception` в GET/POST, «Проверить и включить» через `callLlm` |
| `src/components/Admin.tsx` | править | селект провайдера, колонка «Провайдер», загрузка обоих пулов |
| `scripts/smoke-llm.ts` | править | аргумент провайдера |
| `src/lib/__tests__/llm.test.ts` | создать (из `poolside.test.ts`) | тесты обоих клиентов |
| `src/lib/__tests__/keys.test.ts` | править | тесты LLM-веток выбора ключа |
| `src/lib/__tests__/enhance.test.ts` | править | deps на `getAvailableLlmKey`/`callLlm`, тест inception-ключа |
| `src/lib/__tests__/admin-keys.test.ts` | править | валидация inception-ключа |
| `AGENTS.md`, `README.md` | править | документация провайдеров |
| `src/lib/poolside.ts`, `src/lib/__tests__/poolside.test.ts` | удалить | заменены на `llm.ts` |

Удаляемые файлы: только `poolside.ts` и его тест — содержимое переезжает.

---

### Task 1: Переезд `poolside.ts` → `llm.ts` (чистый rename, поведение не меняется)

**Files:**
- Create (git mv): `src/lib/llm.ts` (из `src/lib/poolside.ts`)
- Create (git mv): `src/lib/__tests__/llm.test.ts` (из `src/lib/__tests__/poolside.test.ts`)
- Modify: `src/lib/enhance.ts:7`, `src/api/admin.ts:12`, `scripts/smoke-llm.ts:2`
- Delete: `src/lib/poolside.ts`, `src/lib/__tests__/poolside.test.ts` (через git mv)

- [ ] **Step 1: Создать ветку**

```bash
git checkout main && git pull && git checkout -b feat/inception-llm-provider
```

Expected: переключились на новую ветку без конфликтов.

- [ ] **Step 2: Переименовать файлы через git mv**

```bash
git mv src/lib/poolside.ts src/lib/llm.ts
git mv src/lib/__tests__/poolside.test.ts src/lib/__tests__/llm.test.ts
```

- [ ] **Step 3: Обновить импорт в `src/lib/enhance.ts` (строка 7)**

Было:

```ts
import { callPoolside, LlmKeyExhaustedError, POOLSIDE_MODEL } from "./poolside";
```

Стало:

```ts
import { callPoolside, LlmKeyExhaustedError, POOLSIDE_MODEL } from "./llm";
```

- [ ] **Step 4: Обновить импорт в `src/api/admin.ts` (строка 12)**

Было:

```ts
import { callPoolside } from "../lib/poolside";
```

Стало:

```ts
import { callPoolside } from "../lib/llm";
```

- [ ] **Step 5: Обновить импорт в `scripts/smoke-llm.ts` (строка 2)**

Было:

```ts
import { callPoolside } from "../src/lib/poolside";
```

Стало:

```ts
import { callPoolside } from "../src/lib/llm";
```

- [ ] **Step 6: Прогнать тесты**

Run: `bun test`
Expected: все тесты проходят (файл тот же, изменилось только имя модуля).

- [ ] **Step 7: Прогнать typecheck**

Run: `bun run typecheck`
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "refactor(llm): переименован poolside.ts в llm.ts"
```

---

### Task 2: Generic-клиент и провайдер Inception в реестре

**Files:**
- Modify: `src/lib/llm.ts` (полная замена содержимого, код ниже)
- Modify: `src/lib/__tests__/llm.test.ts` (полная замена, код ниже)
- Modify: `src/lib/enhance.ts`, `src/api/admin.ts`, `scripts/smoke-llm.ts` (вызовы `callPoolside` → `callLlm`)

- [ ] **Step 1: Дописать failing-тесты Inception в `src/lib/__tests__/llm.test.ts`**

Добавить в конец файла (после существующего describe, временно — на шаге 3 тесты будут падать, т.к. `callLlm` ещё не существует):

```ts
const INCEPTION_COMPLETION = {
	id: "chatcmpl-2",
	object: "chat.completion",
	model: "mercury-2.5",
	choices: [
		{
			index: 0,
			message: { role: "assistant", content: "A neon-soaked scene." },
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 1100, completion_tokens: 200, total_tokens: 1300 },
};

describe("Inception client", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("успешный вызов: mercury-2.5, reasoning_effort low, без rate-limit заголовков", async () => {
		let body: any = null;
		let url = "";
		globalThis.fetch = mock(async (input: string | URL, init?: RequestInit) => {
			url = String(input);
			body = JSON.parse(String(init?.body));
			return llmResponse(INCEPTION_COMPLETION);
		}) as any;

		const { callLlm } = await import("../llm");
		const result = await callLlm({
			provider: "inception",
			system: "system rules",
			user: "кот",
			apiKey: "sk_test",
		});

		expect(result.text).toBe("A neon-soaked scene.");
		expect(result.usage).toEqual({
			inputTokens: 1100,
			outputTokens: 200,
			totalTokens: 1300,
		});
		expect(result.rateLimit).toEqual({ limit: null, remaining: null });
		expect(url).toBe("https://api.inceptionlabs.ai/v1/chat/completions");
		expect(body.model).toBe("mercury-2.5");
		expect(body.reasoning_effort).toBe("low");
		expect(body.temperature).toBe(0.9);
		expect(body.messages[0]).toEqual({
			role: "system",
			content: "system rules",
		});
		expect(body.messages[1].role).toBe("user");
	});

	test("429 -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(async () => errorResponse(429)) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("402 (биллинг) -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(async () => errorResponse(402)) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("401 -> LlmKeyExhaustedError", async () => {
		globalThis.fetch = mock(async () => errorResponse(401)) as any;
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
	});

	test("500 -> LlmCallError", async () => {
		globalThis.fetch = mock(async () => errorResponse(500)) as any;
		const { callLlm, LlmCallError } = await import("../llm");
		await expect(
			callLlm({
				provider: "inception",
				system: "s",
				user: "u",
				apiKey: "sk_test",
			}),
		).rejects.toThrow(LlmCallError);
	});
});
```

- [ ] **Step 2: Запустить тесты, убедиться в отказе**

Run: `bun test src/lib/__tests__/llm.test.ts`
Expected: FAIL — `callLlm` не экспортируется из `../llm` (сейчас там только `callPoolside`).

- [ ] **Step 3: Переписать `src/lib/llm.ts` — generic-клиент с реестром**

Полное новое содержимое файла:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText } from "ai";

export const POOLSIDE_BASE_URL =
	process.env.POOLSIDE_BASE_URL ?? "https://inference.poolside.ai/v1";
export const POOLSIDE_MODEL =
	process.env.POOLSIDE_MODEL ?? "poolside/laguna-xs-2.1";
export const INCEPTION_BASE_URL =
	process.env.INCEPTION_BASE_URL ?? "https://api.inceptionlabs.ai/v1";
export const INCEPTION_MODEL = process.env.INCEPTION_MODEL ?? "mercury-2.5";

export type LlmProviderId = "poolside" | "inception";

export function isLlmProvider(provider: string): provider is LlmProviderId {
	return provider === "poolside" || provider === "inception";
}

export interface LlmProviderConfig {
	/** Имя провайдера в SDK; ключ providerOptions — само имя (уже camelCase-совместимо) */
	name: string;
	baseURL: string;
	model: string;
	/** Опции, прокидываемые в тело запроса через providerOptions[name] */
	providerOptions: Record<string, unknown>;
	/** HTTP-статусы, означающие «ключ не работает» */
	exhaustedStatuses: number[];
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderConfig> = {
	poolside: {
		name: "poolside",
		baseURL: POOLSIDE_BASE_URL,
		model: POOLSIDE_MODEL,
		providerOptions: { chat_template_kwargs: { enable_thinking: false } },
		exhaustedStatuses: [401, 403, 429],
	},
	inception: {
		name: "inception",
		baseURL: INCEPTION_BASE_URL,
		model: INCEPTION_MODEL,
		providerOptions: { reasoningEffort: "low" },
		exhaustedStatuses: [401, 402, 403, 429],
	},
};

export interface LlmUsage {
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
}

export interface LlmRateLimit {
	limit: number | null;
	remaining: number | null;
}

export interface LlmResult {
	text: string;
	usage: LlmUsage;
	rateLimit: LlmRateLimit;
}

export class LlmKeyExhaustedError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export class LlmCallError extends Error {}

export function headerValue(headers: unknown, name: string): string | null {
	if (!headers) return null;
	if (typeof (headers as Headers).get === "function") {
		return (headers as Headers).get(name);
	}
	const lower = name.toLowerCase();
	for (const [key, value] of Object.entries(
		headers as Record<string, string>,
	)) {
		if (key.toLowerCase() === lower) return value;
	}
	return null;
}

function toNumber(value: string | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export async function callLlm(params: {
	provider: LlmProviderId;
	system: string;
	user: string;
	apiKey: string;
	timeoutMs?: number;
	maxOutputTokens?: number;
}): Promise<LlmResult> {
	const {
		provider: providerId,
		system,
		user,
		apiKey,
		timeoutMs = 30_000,
		maxOutputTokens = 900,
	} = params;

	const config = LLM_PROVIDERS[providerId];

	const provider = createOpenAICompatible({
		name: config.name,
		baseURL: config.baseURL,
		apiKey,
	});

	try {
		const result = await generateText({
			model: provider(config.model),
			instructions: system,
			prompt: user,
			temperature: 0.9,
			maxOutputTokens,
			maxRetries: 0,
			timeout: { totalMs: timeoutMs },
			providerOptions: {
				[config.name]: config.providerOptions,
			},
		});

		const headers = result.finalStep.response?.headers;
		const usage = result.usage;

		return {
			text: result.text,
			usage: {
				inputTokens: usage.inputTokens ?? null,
				outputTokens: usage.outputTokens ?? null,
				totalTokens: usage.totalTokens ?? null,
			},
			rateLimit: {
				limit: toNumber(headerValue(headers, "x-ratelimit-limit-requests")),
				remaining: toNumber(
					headerValue(headers, "x-ratelimit-remaining-requests"),
				),
			},
		};
	} catch (error) {
		const status = APICallError.isInstance(error)
			? error.statusCode
			: undefined;
		if (status !== undefined && config.exhaustedStatuses.includes(status)) {
			throw new LlmKeyExhaustedError(
				status,
				`${config.name} key rejected: ${status}`,
			);
		}
		throw new LlmCallError(
			error instanceof Error ? error.message : String(error),
		);
	}
}
```

- [ ] **Step 4: Переписать старые poolside-тесты на `callLlm` в `src/lib/__tests__/llm.test.ts`**

В describe `"Poolside client"` (переименовать в `"Poolside client"` оставляем как есть или `"Poolside client"` — оставить текущее имя не критично; главное — вызовы):

Было (все три места + первый тест):

```ts
		const { callPoolside } = await import("../poolside");
		const result = await callPoolside({
```

Стало:

```ts
		const { callLlm } = await import("../llm");
		const result = await callLlm({
			provider: "poolside",
```

и в тестах 429/401/500:

```ts
		const { callPoolside, LlmKeyExhaustedError } = await import("../poolside");
```

→

```ts
		const { callLlm, LlmKeyExhaustedError } = await import("../llm");
```

```ts
		await expect(
			callPoolside({ system: "s", user: "u", apiKey: "sky_test" }),
		).rejects.toThrow(LlmKeyExhaustedError);
```

→

```ts
		await expect(
			callLlm({
				provider: "poolside",
				system: "s",
				user: "u",
				apiKey: "sky_test",
			}),
		).rejects.toThrow(LlmKeyExhaustedError);
```

(аналогично для `LlmCallError`-теста; заголовок describe `"Poolside client"` оставить).

- [ ] **Step 5: Обновить `src/lib/enhance.ts` — импорт и вызов**

Строка 7, было:

```ts
import { callPoolside, LlmKeyExhaustedError, POOLSIDE_MODEL } from "./llm";
```

Стало:

```ts
import { callLlm, isLlmProvider, LlmKeyExhaustedError, LLM_PROVIDERS } from "./llm";
```

Интерфейс deps (строки 40–46), было:

```ts
export interface EnhanceDeps {
	getAvailableKey: typeof getAvailableKey;
	deactivateKey: typeof deactivateKey;
	updateKeyRateLimit: typeof updateKeyRateLimit;
	callPoolside: typeof callPoolside;
	deadlineMs: number;
}
```

Стало:

```ts
export interface EnhanceDeps {
	getAvailableKey: typeof getAvailableKey;
	deactivateKey: typeof deactivateKey;
	updateKeyRateLimit: typeof updateKeyRateLimit;
	callLlm: typeof callLlm;
	deadlineMs: number;
}
```

`defaultDeps` (строки 48–54): `callPoolside,` → `callLlm,`.

Деструктуризация (строки 60–66), было:

```ts
	const {
		getAvailableKey: takeKey,
		deactivateKey: dropKey,
		updateKeyRateLimit: saveLimits,
		callPoolside: callLlm,
		deadlineMs,
	} = { ...defaultDeps, ...deps };
```

Стало:

```ts
	const {
		getAvailableKey: takeKey,
		deactivateKey: dropKey,
		updateKeyRateLimit: saveLimits,
		callLlm: callModel,
		deadlineMs,
	} = { ...defaultDeps, ...deps };
```

Выбор ключа (строки 90–96), было:

```ts
		let key: Awaited<ReturnType<typeof getAvailableKey>>;
		try {
			key = await takeKey("poolside");
		} catch (error) {
			if (error instanceof AllKeysExhaustedError) break;
			throw error;
		}
```

Стало:

```ts
		let key: Awaited<ReturnType<typeof getAvailableKey>>;
		try {
			key = await takeKey("poolside");
		} catch (error) {
			if (error instanceof AllKeysExhaustedError) break;
			throw error;
		}
		if (!isLlmProvider(key.provider)) {
			lastError = `unexpected key provider: ${key.provider}`;
			break;
		}
```

Вызов (строки 98–104), было:

```ts
			const result = await callLlm({
				system: STYLE_SYSTEM,
				user: message,
				apiKey: key.key,
				timeoutMs: Math.max(2_000, deadlineMs - (Date.now() - started)),
			});
```

Стало:

```ts
			const result = await callModel({
				provider: key.provider,
				system: STYLE_SYSTEM,
				user: message,
				apiKey: key.key,
				timeoutMs: Math.max(2_000, deadlineMs - (Date.now() - started)),
			});
```

Результат (строка 149), было:

```ts
				model: POOLSIDE_MODEL,
```

Стало:

```ts
				model: LLM_PROVIDERS[key.provider].model,
```

- [ ] **Step 6: Обновить `src/api/admin.ts` — импорт и вызов проверки**

Строка 12, было:

```ts
import { callPoolside } from "../lib/llm";
```

Стало:

```ts
import { callLlm } from "../lib/llm";
```

Блок проверки ключа (строки 185–208), было:

```ts
				if (keys[0]!.provider === "poolside") {
					try {
						const result = await callPoolside({
```

Стало:

```ts
				if (keys[0]!.provider === "poolside") {
					try {
						const result = await callLlm({
							provider: "poolside",
```

(остальные аргументы — без изменений).

- [ ] **Step 7: Обновить `scripts/smoke-llm.ts`**

Было:

```ts
import { getAvailableKey, updateKeyRateLimit } from "../src/lib/keys";
import { callPoolside } from "../src/lib/llm";

const key = await getAvailableKey("poolside");
const started = Date.now();
const result = await callPoolside({
	system: "You write one vivid English sentence. Output only the sentence.",
	user: "A pug in a leopard coat rides a neon scooter.",
	apiKey: key.key,
});
```

Стало:

```ts
import { getAvailableKey, updateKeyRateLimit } from "../src/lib/keys";
import { callLlm } from "../src/lib/llm";

const key = await getAvailableKey("poolside");
const started = Date.now();
const result = await callLlm({
	provider: "poolside",
	system: "You write one vivid English sentence. Output only the sentence.",
	user: "A pug in a leopard coat rides a neon scooter.",
	apiKey: key.key,
});
```

- [ ] **Step 8: Обновить `src/lib/__tests__/enhance.test.ts` — импорт и fixture**

Строка 4, было:

```ts
import { LlmKeyExhaustedError } from "../poolside";
```

Стало:

```ts
import { LlmKeyExhaustedError } from "../llm";
```

Fixture KEY (строки 9–13), было:

```ts
const KEY = {
	id: "p1",
	name: "poolside-1",
	key: "sky_test",
} as Awaited<ReturnType<EnhanceDeps["getAvailableKey"]>>;
```

Стало:

```ts
const KEY = {
	id: "p1",
	name: "poolside-1",
	key: "sky_test",
	provider: "poolside",
} as Awaited<ReturnType<EnhanceDeps["getAvailableKey"]>>;
```

В `makeDeps` (строки 15–28), было:

```ts
		callPoolside: mock(async () => ({
```

Стало:

```ts
		callLlm: mock(async () => ({
```

Все обращения `deps.callPoolside` в тестах (строки 49, 71, 88, 96, 105, 116, 121, 134, 148, 168, 176, 183) заменить на `deps.callLlm` (replaceAll).

- [ ] **Step 9: Прогнать тесты**

Run: `bun test`
Expected: все проходят, включая новые inception-тесты (5 штук) и обновлённые poolside/enhance.

- [ ] **Step 10: Прогнать typecheck**

Run: `bun run typecheck`
Expected: без ошибок (в частности, тип guard `isLlmProvider` сужает `key.provider` для `LLM_PROVIDERS[key.provider]`).

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(llm): generic-клиент callLlm + провайдер Inception Labs (mercury-2.5)"
```

---

### Task 3: `keys.ts` — провайдер inception, единый LLM-пул, валидация

**Files:**
- Modify: `src/lib/keys.ts`
- Modify: `src/lib/__tests__/keys.test.ts`
- Modify: `scripts/smoke-llm.ts` (аргумент провайдера)

- [ ] **Step 1: Обновить `src/lib/__tests__/keys.test.ts` — failing-тесты**

1) Моку не нужны изменения (значения уже приходят в `mock.calls[i]` после `strings`). Заменить тест `getAvailableKey('poolside') фильтрует по provider и остатку` (строки 214–236) на три теста:

```ts
	test("getAvailableKey('poolside') фильтрует по provider и остатку", async () => {
		responses = {
			"provider = ?": [
				{
					id: "p1",
					name: "poolside-1",
					key: "sky_x",
					provider: "poolside",
					is_active: true,
					rl_limit: 60,
					rl_remaining: 30,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableKey("poolside");
		expect(key.id).toBe("p1");
		const [strings, values] = mockSql.mock.calls[0]! as unknown as [
			TemplateStringsArray,
			string[],
		];
		const query = strings.join("?");
		expect(query).toContain("provider = ?");
		expect(values[0]).toBe("poolside");
		expect(query).toContain("rl_remaining > 0");
		expect(query).toContain("rl_checked_at < NOW() - INTERVAL '2 minutes'");
		expect(query).toContain("ORDER BY rl_remaining DESC NULLS LAST");
	});

	test("getAvailableKey('inception') фильтрует по provider и остатку", async () => {
		responses = {
			"provider = ?": [
				{
					id: "i1",
					name: "inception-1",
					key: "sk_x",
					provider: "inception",
					is_active: true,
					rl_limit: null,
					rl_remaining: null,
					created_at: new Date(),
				},
			],
		};
		const key = await getAvailableKey("inception");
		expect(key.id).toBe("i1");
		const [strings, values] = mockSql.mock.calls[0]! as unknown as [
			TemplateStringsArray,
			string[],
		];
		expect((values as string[])[0]).toBe("inception");
	});

	test("getAvailableKey('poolside') бросает AllKeysExhaustedError без ключей", async () => {
		responses = { "provider = ?": [] };
		await expect(getAvailableKey("poolside")).rejects.toThrow(
			AllKeysExhaustedError,
		);
	});

	test("getAvailableLlmKey берёт из единого пула poolside+inception", async () => {
		responses = {
			"provider IN ('poolside', 'inception')": [
				{
					id: "i1",
					name: "inception-1",
					key: "sk_x",
					provider: "inception",
					is_active: true,
					rl_limit: null,
					rl_remaining: null,
					created_at: new Date(),
				},
			],
		};
		const { getAvailableLlmKey } = await import("../keys");
		const key = await getAvailableLlmKey();
		expect(key.id).toBe("i1");
		const query = (
			mockSql.mock.calls[0]![0] as TemplateStringsArray
		).join("?");
		expect(query).toContain("provider IN ('poolside', 'inception')");
		expect(query).toContain("rl_remaining > 0");
		expect(query).toContain("ORDER BY rl_remaining DESC NULLS LAST");
	});

	test("getAvailableLlmKey бросает AllKeysExhaustedError без ключей", async () => {
		const { getAvailableLlmKey, AllKeysExhaustedError } = await import(
			"../keys"
		);
		responses = { "provider IN ('poolside', 'inception')": [] };
		await expect(getAvailableLlmKey()).rejects.toThrow(AllKeysExhaustedError);
	});
```

2) В деструктурирующий импорт (строки 15–24) добавить `getAvailableLlmKey,`:

```ts
const {
	getAvailableKey,
	getAvailableLlmKey,
	AllKeysExhaustedError,
	hasConfirmedQuota,
	hasRemainingQuota,
	isKeyQuotaStale,
	updateKeyQuota,
	deactivateKey,
	updateKeyRateLimit,
} = await import("../keys");
```

- [ ] **Step 2: Запустить тесты, убедиться в отказе**

Run: `bun test src/lib/__tests__/keys.test.ts`
Expected: FAIL — `getAvailableLlmKey` не существует; старый poolside-тест падает на паттерне `provider = 'poolside'` (запрос теперь `provider = ?`).

- [ ] **Step 3: Реализовать изменения в `src/lib/keys.ts`**

3.1. Импорт типа вверху (после импорта `hf`):

```ts
import type { LlmProviderId } from "./llm";
```

3.2. Тип и guard, было:

```ts
export type KeyProvider = "huggingface" | "poolside";
```

Стало:

```ts
export type KeyProvider = "huggingface" | LlmProviderId;

export function isLlmProvider(provider: string): provider is LlmProviderId {
	return provider === "poolside" || provider === "inception";
}
```

3.3. `getAvailableKey` — LLM-ветку (строки 90–109) параметризовать, было:

```ts
	if (provider === "poolside") {
		const keys = (await sql`
      SELECT * FROM api_keys
      WHERE provider = 'poolside'
```

Стало:

```ts
	if (isLlmProvider(provider)) {
		const keys = (await sql`
      SELECT * FROM api_keys
      WHERE provider = ${provider}
```

(остальное тело ветки — без изменений).

3.4. Добавить новую функцию сразу после `getAvailableKey` (перед `deactivateKey`):

```ts
export async function getAvailableLlmKey(): Promise<ApiKeyRow> {
	const keys = (await sql`
    SELECT * FROM api_keys
    WHERE provider IN ('poolside', 'inception')
      AND is_active = TRUE
      AND (
        rl_remaining IS NULL
        OR rl_remaining > 0
        OR rl_checked_at IS NULL
        OR rl_checked_at < NOW() - INTERVAL '2 minutes'
      )
    ORDER BY rl_remaining DESC NULLS LAST
    LIMIT 1
  `) as ApiKeyRow[];

	if (keys.length === 0) {
		throw new AllKeysExhaustedError();
	}
	return keys[0]!;
}
```

3.5. Валидация, было:

```ts
export function isValidKeyForProvider(provider: string, key: string): boolean {
	const prefix = keyPrefixFor(provider);
	return prefix !== null && key.startsWith(prefix);
}
```

Стало:

```ts
export function isValidKeyForProvider(provider: string, key: string): boolean {
	if (provider === "inception") {
		return key.trim().length > 0;
	}
	const prefix = keyPrefixFor(provider);
	return prefix !== null && key.startsWith(prefix);
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `bun test src/lib/__tests__/keys.test.ts`
Expected: PASS — все тесты, включая новые.

- [ ] **Step 5: Аргумент провайдера в `scripts/smoke-llm.ts`**

Было:

```ts
import { getAvailableKey, updateKeyRateLimit } from "../src/lib/keys";
import { callLlm } from "../src/lib/llm";

const key = await getAvailableKey("poolside");
```

Стало:

```ts
import {
	getAvailableKey,
	isLlmProvider,
	updateKeyRateLimit,
} from "../src/lib/keys";
import { callLlm } from "../src/lib/llm";

const arg = process.argv[2] ?? "poolside";
if (!isLlmProvider(arg)) {
	console.error(`Неизвестный LLM-провайдер: ${arg} (доступны: poolside, inception)`);
	process.exit(1);
}
const key = await getAvailableKey(arg);
```

и вызов:

```ts
const result = await callLlm({
	provider: arg,
	system: "You write one vivid English sentence. Output only the sentence.",
	user: "A pug in a leopard coat rides a neon scooter.",
	apiKey: key.key,
});
```

- [ ] **Step 6: Прогнать тесты и typecheck**

Run: `bun test && bun run typecheck`
Expected: всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(keys): провайдер inception и единый LLM-пул getAvailableLlmKey"
```

---

### Task 4: `enhance.ts` — общий пул ключей вместо `getAvailableKey("poolside")`

**Files:**
- Modify: `src/lib/enhance.ts`
- Modify: `src/lib/__tests__/enhance.test.ts`

- [ ] **Step 1: Обновить `src/lib/__tests__/enhance.test.ts` — failing-тесты**

1.1. `makeDeps`, было:

```ts
const deps = {
	getAvailableKey: mock(async () => KEY),
	deactivateKey: mock(async () => {}),
	updateKeyRateLimit: mock(async () => {}),
	callLlm: mock(async () => ({
		text: GOOD_TEXT,
		usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
		rateLimit: { limit: 60, remaining: 29 },
	})),
	deadlineMs: 35_000,
};
```

Стало:

```ts
const deps = {
	getAvailableLlmKey: mock(async () => KEY),
	deactivateKey: mock(async () => {}),
	updateKeyRateLimit: mock(async () => {}),
	callLlm: mock(async () => ({
		text: GOOD_TEXT,
		usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
		rateLimit: { limit: 60, remaining: 29 },
	})),
	deadlineMs: 35_000,
};
```

1.2. Тип fixture, было:

```ts
} as Awaited<ReturnType<EnhanceDeps["getAvailableKey"]>>;
```

Стало:

```ts
} as Awaited<ReturnType<EnhanceDeps["getAvailableLlmKey"]>>;
```

1.3. Тест «нет ключей -> сразу fallback», было:

```ts
		deps.getAvailableKey.mockImplementationOnce(async () => {
			throw new AllKeysExhaustedError();
		});
```

Стало:

```ts
		deps.getAvailableLlmKey.mockImplementationOnce(async () => {
			throw new AllKeysExhaustedError();
		});
```

и assert в нём не меняется.

1.4. В первый тест добавить проверку модели (после `expect(result.outputTokens).toBe(50);`):

```ts
		expect(result.model).toBe("poolside/laguna-xs-2.1");
```

1.5. Новый тест в конец describe:

```ts
	test("ключ inception даёт модель mercury-2.5", async () => {
		deps.getAvailableLlmKey = mock(async () => ({
			...KEY,
			id: "i1",
			name: "inception-1",
			key: "sk_test",
			provider: "inception",
		})) as any;

		const { enhancePrompt } = await import("../enhance");
		const result = await enhancePrompt("кот", deps);
		expect(result.fallback).toBe(false);
		expect(result.keyId).toBe("i1");
		expect(result.model).toBe("mercury-2.5");
		const call = (deps.callLlm.mock.calls[0] as unknown as [
			{ provider: string },
		])[0];
		expect(call.provider).toBe("inception");
	});
```

- [ ] **Step 2: Запустить тесты, убедиться в отказе**

Run: `bun test src/lib/__tests__/enhance.test.ts`
Expected: FAIL — `getAvailableLlmKey` отсутствует в deps/реализации, `result.model` не `mercury-2.5`.

- [ ] **Step 3: Реализовать в `src/lib/enhance.ts`**

3.1. Импорт из keys, было:

```ts
import {
	AllKeysExhaustedError,
	deactivateKey,
	getAvailableKey,
	updateKeyRateLimit,
} from "./keys";
```

Стало:

```ts
import {
	AllKeysExhaustedError,
	deactivateKey,
	getAvailableLlmKey,
	updateKeyRateLimit,
} from "./keys";
```

3.2. Интерфейс и deps, было:

```ts
export interface EnhanceDeps {
	getAvailableKey: typeof getAvailableKey;
	deactivateKey: typeof deactivateKey;
	updateKeyRateLimit: typeof updateKeyRateLimit;
	callLlm: typeof callLlm;
	deadlineMs: number;
}

const defaultDeps: EnhanceDeps = {
	getAvailableKey,
	deactivateKey,
	updateKeyRateLimit,
	callLlm,
	deadlineMs: ENHANCE_DEADLINE_MS,
};
```

Стало:

```ts
export interface EnhanceDeps {
	getAvailableLlmKey: typeof getAvailableLlmKey;
	deactivateKey: typeof deactivateKey;
	updateKeyRateLimit: typeof updateKeyRateLimit;
	callLlm: typeof callLlm;
	deadlineMs: number;
}

const defaultDeps: EnhanceDeps = {
	getAvailableLlmKey,
	deactivateKey,
	updateKeyRateLimit,
	callLlm,
	deadlineMs: ENHANCE_DEADLINE_MS,
};
```

3.3. Деструктуризация, было:

```ts
	const {
		getAvailableKey: takeKey,
		deactivateKey: dropKey,
		updateKeyRateLimit: saveLimits,
		callLlm: callModel,
		deadlineMs,
	} = { ...defaultDeps, ...deps };
```

Стало:

```ts
	const {
		getAvailableLlmKey: takeKey,
		deactivateKey: dropKey,
		updateKeyRateLimit: saveLimits,
		callLlm: callModel,
		deadlineMs,
	} = { ...defaultDeps, ...deps };
```

3.4. Выбор ключа, было:

```ts
		let key: Awaited<ReturnType<typeof getAvailableKey>>;
		try {
			key = await takeKey("poolside");
		} catch (error) {
			if (error instanceof AllKeysExhaustedError) break;
			throw error;
		}
```

Стало:

```ts
		let key: Awaited<ReturnType<typeof getAvailableLlmKey>>;
		try {
			key = await takeKey();
		} catch (error) {
			if (error instanceof AllKeysExhaustedError) break;
			throw error;
		}
```

- [ ] **Step 5: Прогнать тесты и typecheck**

Run: `bun test && bun run typecheck`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(enhance): единый LLM-пул и диспетчеризация по провайдеру ключа"
```

---

### Task 5: `admin.ts` — провайдер inception в API

**Files:**
- Modify: `src/api/admin.ts`
- Modify: `src/lib/__tests__/admin-keys.test.ts`

- [ ] **Step 1: Failing-тесты валидации в `src/lib/__tests__/admin-keys.test.ts`**

Добавить в конец describe:

```ts
	test("inception-ключ — любой непустой", () => {
		expect(isValidKeyForProvider("inception", "sk-inception-abc123")).toBe(
			true,
		);
		expect(isValidKeyForProvider("inception", "")).toBe(false);
		expect(isValidKeyForProvider("inception", "   ")).toBe(false);
		expect(isValidKeyForProvider("huggingface", "sk-inception-abc")).toBe(
			false,
		);
		expect(isValidKeyForProvider("poolside", "sk-inception-abc")).toBe(false);
	});
```

- [ ] **Step 2: Запустить, убедиться в отказе**

Run: `bun test src/lib/__tests__/admin-keys.test.ts`
Expected: FAIL — у Poolside `sk-inception-abc` не начинается с `sky_`, у HuggingFace тоже false… точный смысл отказа: тест валиден и должен пройти после правки `isValidKeyForProvider` в Task 3 — он там уже реализован; если Step упал — проверить, что Task 3 выполнен. (Тест фиксирует контракт: inception принимает непустой, другие — нет.)

- [ ] **Step 3: Реализовать в `src/api/admin.ts`**

3.1. Импорты, было:

```ts
import {
	hasConfirmedQuota,
	isKeyQuotaStale,
	isValidKeyForProvider,
	keyPrefixFor,
	updateKeyQuota,
} from "../lib/keys";
```

Стало:

```ts
import { isLlmProvider } from "../lib/llm";
import {
	hasConfirmedQuota,
	isKeyQuotaStale,
	isValidKeyForProvider,
	keyPrefixFor,
	updateKeyQuota,
} from "../lib/keys";
```

3.2. GET `/api/admin/keys` (строка 77), было:

```ts
				if (provider !== "huggingface" && provider !== "poolside") {
```

Стало:

```ts
				if (provider !== "huggingface" && !isLlmProvider(provider)) {
```

3.3. POST `/api/admin/keys` (строки 128–139), было:

```ts
				const { name, key, provider = "huggingface" } = await req.json();
				if (!name || !isValidKeyForProvider(provider, key ?? "")) {
					const prefix = keyPrefixFor(provider);
					return Response.json(
						{
							error: prefix
								? `Нужны name и корректный ${prefix}-ключ`
								: "Неизвестный провайдер",
						},
						{ status: 400 },
					);
				}
```

Стало:

```ts
				const { name, key, provider = "huggingface" } = await req.json();
				if (provider !== "huggingface" && !isLlmProvider(provider)) {
					return Response.json(
						{ error: "Неизвестный провайдер" },
						{ status: 400 },
					);
				}
				if (!name || !isValidKeyForProvider(provider, key ?? "")) {
					const prefix = keyPrefixFor(provider);
					return Response.json(
						{
							error: prefix
								? `Нужны name и корректный ${prefix}-ключ`
								: "Нужны name и ключ",
						},
						{ status: 400 },
					);
				}
```

3.4. «Проверить и включить» (строки 185–208), было:

```ts
				if (keys[0]!.provider === "poolside") {
					try {
						const result = await callLlm({
							provider: "poolside",
							system: "ping",
							user: "ping",
							apiKey: keys[0]!.key,
							timeoutMs: 15_000,
							maxOutputTokens: 8,
						});
						await sql`
              UPDATE api_keys
              SET is_active = TRUE,
                  last_error = NULL,
                  rl_limit = ${result.rateLimit.limit},
                  rl_remaining = ${result.rateLimit.remaining},
                  rl_checked_at = NOW()
              WHERE id = ${id}
            `;
						return Response.json({ success: true, provider: "poolside" });
```

Стало:

```ts
				if (isLlmProvider(keys[0]!.provider)) {
					try {
						const result = await callLlm({
							provider: keys[0]!.provider,
							system: "ping",
							user: "ping",
							apiKey: keys[0]!.key,
							timeoutMs: 15_000,
							maxOutputTokens: 8,
						});
						await sql`
              UPDATE api_keys
              SET is_active = TRUE,
                  last_error = NULL,
                  rl_limit = ${result.rateLimit.limit},
                  rl_remaining = ${result.rateLimit.remaining},
                  rl_checked_at = NOW()
              WHERE id = ${id}
            `;
						return Response.json({
							success: true,
							provider: keys[0]!.provider,
						});
```

- [ ] **Step 4: Прогнать тесты и typecheck**

Run: `bun test && bun run typecheck`
Expected: всё зелёное.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(admin): поддержка inception в ключах LLM"
```

---

### Task 6: `Admin.tsx` — селект провайдера и колонка «Провайдер»

**Files:**
- Modify: `src/components/Admin.tsx`

- [ ] **Step 1: Состояние провайдера**

После строки `const [newLlmKeyValue, setNewLlmKeyValue] = useState("");` добавить:

```tsx
	const [newLlmKeyProvider, setNewLlmKeyProvider] = useState<
		"poolside" | "inception"
	>("poolside");
```

- [ ] **Step 2: Загрузка обоих пулов**

`loadData`, было:

```ts
			const [usersRes, keysRes, llmKeysRes, statsRes] = await Promise.all([
				fetch("/api/admin/users"),
				fetch("/api/admin/keys"),
				fetch("/api/admin/keys?provider=poolside"),
				fetch("/api/admin/stats"),
			]);

			if (usersRes.ok) setUsers(await usersRes.json());
			if (keysRes.ok) setKeys(await keysRes.json());
			if (llmKeysRes.ok) setLlmKeys(await llmKeysRes.json());
			if (statsRes.ok) setStats(await statsRes.json());
			if (!usersRes.ok || !keysRes.ok || !llmKeysRes.ok || !statsRes.ok) {
				setError("Часть данных не загрузилась. Попробуйте обновить.");
			}
```

Стало:

```ts
			const [usersRes, keysRes, poolsideRes, inceptionRes, statsRes] =
				await Promise.all([
					fetch("/api/admin/users"),
					fetch("/api/admin/keys"),
					fetch("/api/admin/keys?provider=poolside"),
					fetch("/api/admin/keys?provider=inception"),
					fetch("/api/admin/stats"),
				]);

			if (usersRes.ok) setUsers(await usersRes.json());
			if (keysRes.ok) setKeys(await keysRes.json());
			const [poolsideList, inceptionList] = await Promise.all([
				poolsideRes.ok ? poolsideRes.json() : [],
				inceptionRes.ok ? inceptionRes.json() : [],
			]);
			setLlmKeys([...poolsideList, ...inceptionList]);
			if (statsRes.ok) setStats(await statsRes.json());
			if (
				!usersRes.ok ||
				!keysRes.ok ||
				!poolsideRes.ok ||
				!inceptionRes.ok ||
				!statsRes.ok
			) {
				setError("Часть данных не загрузилась. Попробуйте обновить.");
			}
```

- [ ] **Step 3: Провайдер в POST**

`addLlmKey`, было:

```ts
				body: JSON.stringify({
					name: newLlmKeyName,
					key: newLlmKeyValue,
					provider: "poolside",
				}),
```

Стало:

```ts
				body: JSON.stringify({
					name: newLlmKeyName,
					key: newLlmKeyValue,
					provider: newLlmKeyProvider,
				}),
```

- [ ] **Step 4: Селект провайдера в форме «Ключи LLM»**

Грид формы, было:

```tsx
				<div className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-[220px_1fr_auto]">
					<div className="space-y-1.5">
						<Label htmlFor="llm-key-name">Название</Label>
```

Стало:

```tsx
				<div className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-[180px_220px_1fr_auto]">
					<div className="space-y-1.5">
						<Label htmlFor="llm-provider">Провайдер</Label>
						<Select
							value={newLlmKeyProvider}
							onValueChange={(value) =>
								setNewLlmKeyProvider(value as "poolside" | "inception")
							}
						>
							<SelectTrigger
								id="llm-provider"
								className="w-full rounded-2xl border-border bg-secondary/60"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent position="popper" side="bottom" align="start">
								<SelectItem value="poolside">Poolside</SelectItem>
								<SelectItem value="inception">Inception</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="llm-key-name">Название</Label>
```

- [ ] **Step 5: Колонка «Провайдер» в таблице «Ключи LLM»**

После `<TableHead>Название</TableHead>` добавить `<TableHead>Провайдер</TableHead>`; после ячейки с названием (`<TableCell className="font-semibold">{k.name}</TableCell>`) добавить:

```tsx
									<TableCell className="text-xs text-muted-foreground">
										{k.provider === "inception" ? "Inception" : "Poolside"}
									</TableCell>
```

и `min-w-[720px]` таблицы → `min-w-[800px]`.

- [ ] **Step 6: Проверка**

Run: `bun run typecheck && bun run build`
Expected: обе команды зелёные.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(admin-ui): выбор провайдера для LLM-ключей"
```

---

### Task 7: Документация (AGENTS.md, README.md)

**Files:**
- Modify: `AGENTS.md` (раздел «Обогащение промпта (LLM, стиль «42»)», раздел «Стиль UI», раздел «Архитектура»)
- Modify: `README.md` (env-таблица, абзац про ключи, список lib)

- [ ] **Step 1: AGENTS.md, раздел «Обогащение промпта» — заменить буллет про LLM**

Было:

```markdown
- LLM — Poolside, OpenAI-совместимый API: `POOLSIDE_BASE_URL` (по умолчанию `https://inference.poolside.ai/v1`), `POOLSIDE_MODEL` (по умолчанию `poolside/laguna-xs-2.1`). Thinking отключён через `providerOptions.poolside.chat_template_kwargs.enable_thinking`. Клиент — `src/lib/poolside.ts` на AI SDK v7 (`ai` + `@ai-sdk/openai-compatible`)
```

Стало:

```markdown
- LLM — два OpenAI-совместимых провайдера в реестре `src/lib/llm.ts` (`LLM_PROVIDERS`), клиент — generic `callLlm({ provider, … })` на AI SDK v7 (`ai` + `@ai-sdk/openai-compatible`):
  - `poolside` — `POOLSIDE_BASE_URL` (по умолчанию `https://inference.poolside.ai/v1`), `POOLSIDE_MODEL` (по умолчанию `poolside/laguna-xs-2.1`), thinking выключен через `providerOptions.poolside.chat_template_kwargs.enable_thinking`;
  - `inception` (Inception Labs) — `INCEPTION_BASE_URL` (по умолчанию `https://api.inceptionlabs.ai/v1`), `INCEPTION_MODEL` (по умолчанию `mercury-2.5`), `reasoning_effort: low` передаётся штатной опцией `providerOptions.inception.reasoningEffort`; rate-limit заголовков нет → `rl_*` = `NULL`; 402 = биллинг/квота → ключ деактивируется (401/402/403/429 = «ключ не работает»)
```

- [ ] **Step 2: AGENTS.md — заменить буллет про ключи LLM**

Было:

```markdown
- Ключи LLM живут в той же таблице `api_keys`, но с `provider = 'poolside'` (префикс `sky_`); у HF-ключей `provider = 'huggingface'`. Ротация по заголовку `x-ratelimit-remaining-requests` и по 429/401/403; при исчерпании всех ключей промпт собирается шаблоном `src/lib/style42-fallback.ts` — генерация не падает
```

Стало:

```markdown
- Ключи LLM живут в той же таблице `api_keys` с `provider = 'poolside'` (префикс `sky_`) или `provider = 'inception'` (формат ключа не фиксирован — достаточно непустой строки). Ротация: `getAvailableLlmKey()` берёт из единого пула обоих провайдеров по заголовку `x-ratelimit-remaining-requests` и по 429/401/402/403; ключи без замеров (`NULL`, как у Inception) сортируются последними. При исчерпании всех ключей промпт собирается шаблоном `src/lib/style42-fallback.ts` — генерация не падает
```

- [ ] **Step 3: AGENTS.md — обновить строку архитектуры**

Было:

```markdown
- `src/lib/` — доменная логика (credits, keys, hf, poolside, enhance, storage, rate-limit)
```

Стало:

```markdown
- `src/lib/` — доменная логика (credits, keys, hf, llm, enhance, storage, rate-limit)
```

- [ ] **Step 4: AGENTS.md — буллет админки «Ключи LLM»**

Было:

```markdown
- Ключи обоих провайдеров показываются одним паттерном: HF — «Ключи генерации» с двумя полосами ZeroGPU («Секунды» и «Прогоны») и кнопкой «Проверить и включить», LLM — «Ключи LLM» с остатком запросов и токенами
```

Стало:

```markdown
- Ключи обоих провайдеров показываются одним паттерном: HF — «Ключи генерации» с двумя полосами ZeroGPU («Секунды» и «Прогоны») и кнопкой «Проверить и включить», LLM — «Ключи LLM» с селектом провайдера при добавлении (Poolside / Inception), колонкой «Провайдер», остатком запросов и токенами
```

- [ ] **Step 5: README.md — env-таблица**

После строк:

```markdown
| `POOLSIDE_BASE_URL` | Необязательно. База OpenAI-совместимого API для обогащения промпта (по умолчанию Poolside) |
| `POOLSIDE_MODEL` | Необязательно. Модель обогащения (по умолчанию `poolside/laguna-xs-2.1`) |
```

Добавить:

```markdown
| `INCEPTION_BASE_URL` | Необязательно. База OpenAI-совместимого API Inception Labs (по умолчанию `https://api.inceptionlabs.ai/v1`) |
| `INCEPTION_MODEL` | Необязательно. Модель обогащения Inception (по умолчанию `mercury-2.5`) |
```

- [ ] **Step 6: README.md — абзац про ключи (строка 44)**

Было:

```markdown
Ключи обоих провайдеров хранятся в таблице `api_keys` (`provider`: `huggingface` — генерация картинок, `poolside` — обогащение промпта) и управляются через админ-панель: добавление, проверка с включением, удаление.
```

Стало:

```markdown
Ключи всех провайдеров хранятся в таблице `api_keys` (`provider`: `huggingface` — генерация картинок, `poolside` и `inception` — обогащение промпта) и управляются через админ-панель: добавление с выбором провайдера, проверка с включением, удаление.
```

- [ ] **Step 7: README.md — список lib (строка 71)**

Было:

```markdown
  lib/             # db, auth, credits, keys, hf, poolside, enhance, storage, rate-limit, migrate
```

Стало:

```markdown
  lib/             # db, auth, credits, keys, hf, llm, enhance, storage, rate-limit, migrate
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "docs: Inception Labs как второй LLM-провайдер"
```

---

### Task 8: Финальная проверка и PR

**Files:** нет изменений кода.

- [ ] **Step 1: Полный набор проверок**

```bash
bun run typecheck
```
Expected: без ошибок.

```bash
bun run lint
```
Expected: без ошибок.

```bash
bunx biome format .
```
Expected: без изменений (или коммит форматера).

```bash
bun test
```
Expected: все тесты зелёные.

```bash
bun run build
```
Expected: сборка в `dist/` успешна.

```bash
vercel build --prod
```
Expected: `Build Completed` (нужен залогиненный `vercel`; локальная проверка NFT-трассировки).

- [ ] **Step 2: Push и PR**

```bash
git push -u origin feat/inception-llm-provider
gh pr create --title "feat(llm): Inception Labs mercury-2.5 — второй LLM-провайдер" --body "Generic LLM-клиент с реестром провайдеров (poolside + inception), единый пул LLM-ключей с ротацией, поддержка в админке и смоук-скрипте. Схема БД не меняется. См. docs/superpowers/plans/2026-09-18-inception-llm-provider.md"
```

Expected: PR создан; дождаться зелёного CI. Мерж — только после явного разрешения владельца.

---

## Self-Review (выполнено при написании)

1. **Покрытие:** единый реестр и generic-вызов (Task 1–2), тип/валидация ключей и общий пул (Task 3), диспетчеризация в enhance + модель в результат (Task 4), admin API (Task 5), UI (Task 6), документация (Task 7), проверка и PR (Task 8). Контракт `/api/generate` и промпты не тронуты — по дизайн-решению.
2. **Плейсхолдеры:** нет TBD/TODO; все шаги с кодом или точной командой.
3. **Типы:** `LlmProviderId`, `isLlmProvider`, `callLlm`, `getAvailableLlmKey`, `LLM_PROVIDERS` — имена согласованы между Task 2–5; guard `isLlmProvider` используется в enhance (Task 2) и admin (Task 5).
