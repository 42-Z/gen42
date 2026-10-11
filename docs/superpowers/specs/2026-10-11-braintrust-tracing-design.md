# Braintrust: трассировка и эксперименты evals — дизайн

## Цель и объём

Подключить Braintrust как систему трассировки: LLM-вызовы приложения попадают в логи проекта `Gen42`, а прогоны `scripts/eval-*.ts` — в эксперименты. Мотивация: по методологии evals (Anthropic, «Demystifying evals for AI agents») результаты прогонов хранятся в системе трассировки/отчётов, а не в git.

В объёме: трассировка обогащения промптов (Krea/Ideogram), Turbo-агента (включая рисование и HF-генерацию), отправка прогонов eval-скриптов как экспериментов. Вне объёма: трассировка сессий OpenCode (`bt trace enable opencode`) и Braintrust MCP — не выбраны владельцем; скилл Braintrust для агента уже установлен (`bt setup skills --agent opencode`, `.agents/skills/braintrust/`).

## Архитектура

### 1. Инициализация

`src/lib/tracing.ts` — идемпотентная `initTracing()`: `initLogger({ projectName: process.env.BRAINTRUST_PROJECT ?? "Gen42" })` + `ai.registerTelemetry(braintrustAISDKTelemetry())` (штатный способ для AI SDK v7 из документации Braintrust). Без `BRAINTRUST_API_KEY` — тихий no-op: приложение обязано работать без ключа (требование их процесса инструментации). Вызывается при старте `src/server.ts` и в окружении шагов воркфлоу (`src/lib/turbo/workflow-runtime.ts`): шаги Turbo идут отдельными вызовами функций, у каждого свой процесс. Ошибки инициализации и отправки не роняют ничего: лог в консоль, работа продолжается.

### 2. Трассировка приложения

- `src/lib/llm.ts` (`callLlm` → `generateText`) трассируется автоматически через зарегистрированную телеметрию — промпт, ответ, токены, модель.
- Turbo-агент: спаны `WorkflowAgent` через `registerTelemetry` не подтверждены документацией (подтверждены для import hook и `wrapAISDK`), поэтому шаги оборачиваю `traced()` вручную: агентский цикл (`agent`), рисование (`draw`, Codex Images), HF-генерация (`callSpace`). Каждый span — с input/output и длительностью; итог генерации виден целиком независимо от того, заработают ли агентские спаны автоматически.
- Обогащение (`enhance`) оборачиваю parent-span'ом с пользовательским запросом и id генерации — чтобы трасса читалась как одно событие.

### 3. Evals в эксперименты

`scripts/eval-turbo.ts` и `scripts/eval-style42.ts` после прогона отправляют данные в эксперимент проекта `Gen42`: имя эксперимента — с меткой времени, строки — прогоны (запрос → итоговый промпт/путь, время, токены, версия инструкции). JSONL-артефакты остаются как есть. Без ключа — только локальный режим. Точное API (`InitExperiment`/`Eval`) выбираю по их TypeScript API reference на реализации; семантика фиксирована этой спекой.

### 4. Конфигурация и развёртывание

- Env: `BRAINTRUST_API_KEY`, `BRAINTRUST_PROJECT` (сделано: `.env.development`, `.env.example`).
- Vercel (production + preview): `BRAINTRUST_API_KEY` — действие на проде, выполняется с разрешения владельца; на Vercel SDK сам флашит через `waitUntil`, отдельная настройка не нужна.
- Приватность: в трассы попадают пользовательские промпты — проект приватный, решение осознанное; masking добавится, если владелец попросит.

### 5. Тесты и проверка

- Юнит-тесты: `initTracing()` без ключа — no-op; формирование данных эксперимента; неизменность поведения при ошибке отправки.
- Smoke живьём (закрывает «не проверено»): один вызов обогащения и один eval-прогон → трасса и эксперимент появляются в Braintrust; сборка воркфлоу (`bun run workflow:build`) и локальный прогон Turbo без рисования — без ошибок от braintrust в бандле шагов.

## Источники и статусы

| Утверждение | Источник | Статус |
| --- | --- | --- |
| AI SDK v7: `initLogger` + `ai.registerTelemetry(braintrustAISDKTelemetry())` | braintrust.dev/docs/integrations/sdk-integrations/vercel | подтверждено документацией |
| `WorkflowAgent` трассируется автоматически (import hook / `wrapAISDK`) | там же, раздел «Trace agents» | подтверждено документацией |
| Агентские спаны через `registerTelemetry` | их доки молчат (описан только import hook / wrapAISDK) | не проверено → `traced()` вручную |
| Vercel: `waitUntil` без настроек | там же, «Configure for serverless» | подтверждено документацией |
| braintrust SDK внутри esbuild-бандла шагов воркфлоу под Bun | нет упоминаний в их доках | не проверено → smoke |
| Установка скилла агенту: `bt setup skills` | braintrust.dev/docs/reference/cli/setup | подтверждено документацией; сделано |
| Методология evals: результаты в системе трассировки, датасеты в git | anthropic.com/engineering/demystifying-evals-for-ai-agents | подтверждено документацией |

## Проверить при реализации (не проверено)

1. Точный API экспериментов TypeScript SDK (семантика из спеки не меняется).
2. Агентские спаны `WorkflowAgent` через `registerTelemetry` — если пойдут, `traced()` вокруг агентского цикла остаётся для контекста, дублей не будет (parent/child).
3. Поведение braintrust в бандле шагов воркфлоу (smoke: `bun run workflow:build` + локальный прогон).
4. Лимиты бесплатного тарифа Braintrust на объём логов — не изучены.

## Что меняется в файлах

Новое: `src/lib/tracing.ts`, тесты к нему. Меняется: `src/server.ts` (initTracing при старте), `src/lib/turbo/workflow-runtime.ts` (initTracing в окружении шагов), `src/lib/enhance.ts` (parent span), `workflows/turbo/index.ts` (spans агентского цикла), `src/lib/turbo/ops.ts` (span рисования), `src/lib/hf.ts` (`traced()` на callSpace), `scripts/eval-turbo.ts` и `scripts/eval-style42.ts` (отправка эксперимента), `package.json` (braintrust), `.env.example` (сделано), `AGENTS.md`, `README.md`. На проде: env `BRAINTRUST_API_KEY` в Vercel (с разрешения владельца).
