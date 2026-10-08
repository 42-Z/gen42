# Турбо на Vercel Workflow: дизайн

Дата: 2026-10-08. Ветка: `feat/turbo-creative-direction`. Контекст и замеры времени: `2026-10-07-turbo-creative-direction-design.md` (разделы «Куда уходит время запуска» и «Vercel Workflow и Bun»).

## Цель и объём

Запуск Турбо не должен упираться в лимит одного вызова функции (Hobby, 300 с). Агент занимает 40–110 с, рисование у провайдера от 25 до ~295 с, и повлиять на него нельзя. Сейчас оба делят общий бюджет `TURBO_TIMEOUT_MS` = 270 с.

Решение: Турбо выполняется как воркфлоу Vercel Workflow. Агент и рисование становятся отдельными устойчивыми шагами, у каждого свои 300 с, общего потолка на прогон нет.

В объёме только Турбо. Krea 2 и Ideogram 4 укладываются в 300 с и остаются как есть. Прогресс по шагам для пользователя, вебхуки, Postgres World и смена уровня рассуждения агента в объём не входят.

## Архитектура

### 1. Контракт с клиентом

`POST /api/generate` с `engine: "turbo"`: проверяет вход Codex, создаёт строку `running`, списывает 10 кредитов (как сейчас, `startGeneration` и `chargeGeneration`), запускает воркфлоу через `start()` и сразу отвечает `202 { id, engine: "turbo", cost }`. Ошибки до запуска остаются синхронными с прежними текстами: 400, 402, 429. Если `start()` упал после списания, строка закрывается с возвратом (`failGeneration`) и ответ 502.

Страница, получив 202, вызывает существующий `waitForGeneration`: опрос `/api/generations/:id` каждые 2,5 с, переживает обновление страницы через `gen42-pending`. `GET /api/generations/:id`, галерея и история не меняются. В `handleGenerate` добавляется одна ветка на 202. Для остальных движков поведение прежнее.

### 2. Воркфлоу и шаги

`turboWorkflow({ id, userId, prompt })` в `workflows/turbo/index.ts`, шаги в `workflows/turbo/steps.ts`. Шаги тонкие и вызывают существующий код из `src/lib/turbo/`.

1. `prepare` (шаг): дерево библиотеки, инструкция (`buildTurboSystem`), сообщение агенту (`buildAgentMessage`), хеш инструкции. Возвращает строки.
2. Агент (`WorkflowAgent`, раздел 3). Вызовы модели, `listFolder` и `readFile` это шаги. `generateImage` шаг-проверка: проверяет аргументы и пути, ничего не рисует. Берётся первый успешный вызов `generateImage`, остальные в том же ходе игнорируются.
3. `draw` (шаг, `maxRetries = 0`): `toGeneratorQuotes`, запрос в Codex Images по оригиналам из библиотеки, PNG сразу в хранилище. Возвращает ключ и размер, байты по журналу не ходят.
4. `complete` (шаг): `completeGeneration` (промпт агента, пути картинок, токены, длительность по часам воркфлоу, хеш инструкции).
5. При любой ошибке запускается `fail` (шаг): код ошибки, `failGeneration` (возврат одной транзакцией по условию `status = 'running'`), пометка мёртвого входа Codex при `codex_auth_required`; затем ошибка пробрасывается, чтобы прогон записался неуспешным. Рисование и известные отказы шаги возвращают данными (`{ ok: false, code, message, details }`), чтобы код и подробности не терялись при сериализации; прочее классифицирует существующий `classifyAgentError`.

Повторы: чтения и идемпотентные записи в базу со стандартными тремя повторами, рисование без повторов, модель со своими повторами SDK.

### 3. Агент и модель Codex

- `createTurboAgent(...)`: одно определение `WorkflowAgent` (модель `gpt-6-luna`, `reasoning: "high"`, `toolChoice: "required"`, лимит `TURBO_MAX_STEPS`, остановка после успешной проверки `generateImage`), его используют воркфлоу и `eval-turbo.ts`. Вызывается `generate()`, стрима в интерфейс нет.
- Обёртка модели `CodexAgentModel`: класс с протоколом `WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE`, в журнал пишет только `modelId`; при восстановлении создаёт провайдера заново, токены читает из базы (`createCodexAuth`). Нужна потому, что наша модель это класс `CodexLanguageModel` пакета `openai-oauth-ai-provider` без протокола сериализации, а вложенная в него модель `@ai-sdk/openai` при сериализации теряет несериализуемый `fetch`, где живёт авторизация подписки (`serializeModelOptions` в `@ai-sdk/provider-utils`). Создавать через фабрику из отдельного файла (известная ошибка SWC-плагина с `new Class()` внутри шага).
- Описания и схемы `listFolder`, `readFile`, `generateImage` лежат в одном модуле; воркфлоу подставляет им шаги, `eval-turbo.ts` обычные функции.
- Картинки для агента: `readFile` отдаёт копию до 1024 пикселей по длинной стороне (JPEG) встроенным `Bun.Image`; для `draw` берутся оригиналы. Причины: журнал воркфлоу (лимит записи на Hobby 1 ГБ в месяц) и скорость агента (с большими фото 65–116 с, со сжатыми 18–46 с).

### 4. Ошибки, возврат кредитов, время

Три слоя защиты кредитов: ответ POST при сбое `start()`; шаг `fail`; ленивое закрытие зависших `running` (как сейчас), порог `GENERATION_STALE_MS` растёт с 6 до 12 минут.

Бюджеты времени: агент до 180 с на вызовы модели (абсолютный дедлайн `timeout` у агента), рисование до 280 с (запрос к Codex обрывается сам, чтобы платформа не убила функцию на 300 с). Общей границы 270 с больше нет. Клиентский опрос ждёт до 11 минут (`POLL_TIMEOUT_MS`).

Коды ошибок прежние: `codex_auth_required`, `agent_failed`, `agent_no_generation`, `generation_rejected`, `agent_timeout`; пользователь видит одно сообщение «Не удалось создать изображение, кредиты возвращены».

### 5. Сборка, Vercel, разработка

- Папка `workflows/` в корне (единственная, которую сборщик сканирует по умолчанию).
- `workflow build` создаёт `.well-known/workflow/v1/flow.mjs` (в git не идёт); его вызывают `bun dev` и `bun run build`. Webhook-обработчик не нужен.
- Плагин преобразования кода приложения подключён через `preload` в `bunfig.toml` (нужен, чтобы `start()` знал идентификатор воркфлоу). Отличия от примера в документации: `@swc/core` строго `1.15.3`, фильтр плагина исключает `node_modules`.
- Продакшен: обработчик `flow` это отдельная закрытая функция, единственный потребитель очереди (`queue/v2beta`, топик `__wkf_workflow_*`, `maxDuration: max`). Публичная `src/server.ts` только вызывает `start()`. В проекте Vercel включены системные переменные (иначе `VERCEL_DEPLOYMENT_ID` не придёт и SDK выберет Local World).
- Локально: Local World (`.workflow-data/`, в `.gitignore`); `flow` монтируется в `src/server.ts` только вне продакшена.
- Установка пакетов (`workflow`, `@ai-sdk/workflow`, `@swc/core@1.15.3`) только Bun 1.4.0 по абсолютному пути, затем проверка диффа `bun.lock`.

### 6. Тесты

- Юнит-тесты на `bun test`: шаги напрямую через подмену зависимостей (`draw`: отказ, 401, таймаут, кавычки; `complete`; `fail`: возврат ровно один раз, пометка входа); `startTurbo` (возврат при сбое `start()`, 402); обёртка модели (сериализация только `modelId`, восстановление создаёт провайдера); проверка аргументов `generateImage`; классификатор ошибок. Сценарии из нынешних `turbo-agent.test.ts` и `turbo-service.test.ts` переезжают, не пропадают.
- Сквозная проверка: `scripts/smoke-turbo-workflow.ts` на Local World с подставной моделью и поддельным Codex (успех, возврат при сбое, обрыв посреди рисования).
- `eval-turbo.ts` остаётся: работает через общее `createTurboAgent` вне воркфлоу; `--generate` рисует и печатает «агент / рисование».
- Vitest не добавляется (`@workflow/vitest` рассчитан на Vitest, у проекта `bun:test`).

## Источники и статусы

| Утверждение | Статус | Источник |
|---|---|---|
| Workflow-код собирается и работает на Bun 1.4.0 (`workflow build`, `Bun.serve`, `start()`, шаги с Bun API, `sleep`, `node:vm`) | подтверждено опытом | папка опыта в scratchpad сессии, 2026-10-08 |
| Bun-функции Vercel поддерживают те же ключевые возможности, что Node.js; `bunVersion` действует на все функции проекта | подтверждено документацией | vercel.com/docs/functions/runtimes/bun, vercel.com/docs/project-configuration/vercel-json#bunversion |
| `WorkflowAgent`: каждый вызов модели и инструмент с `"use step"` это шаги; для моделей кроме gateway-строки нужна сериализация | подтверждено документацией и кодом | ai-sdk.dev/v7/docs/agents/workflow-agent, `@ai-sdk/workflow` 2.0.65 (`do-stream-step.ts`), `serializeModelOptions` |
| Обработчик `flow` на Vercel это единственный потребитель очереди с `maxDuration: max` | подтверждено документацией | workflow-sdk.dev/docs/how-it-works/framework-integrations |
| Для нестандартного сервера Workflow описывает Build Output API (пример NestJS; цель `workflow build --target vercel-build-output-api`) | подтверждено документацией | workflow-sdk.dev/docs/getting-started/nestjs, `@workflow/builders` |
| Hobby: Workflow 50 000 событий и 1 ГБ записи в месяц, хранение прогона 1 день; Queues (бета) 1 000 000 операций; шаг ограничен лимитом функции | подтверждено документацией | vercel.com/docs/workflows/pricing, vercel.com/docs/queues/pricing |
| Оценка: прогон Турбо ≈ 15 шагов ≈ 45 событий, то есть ~1 000 прогонов в месяц на Hobby по событиям; запись в журнал при сжатых картинках единицы МБ на прогон | расчёт, замерить на первом прогоне | вывод из числа шагов раздела 2 |
| Размещение A (Build Output API): `workflow build --target vercel-build-output-api` пишет `config.json` целиком (остаётся маршрут вебхука, маршруты пресета Bun пропадают), функция `flow` получает `runtime: nodejs22.x`, а код шагов использует `S3Client` из `bun`; нужен ручной вывод и рантайм Bun | подтверждено локально, не выбран | `vercel build` (CLI 63.1.0) и `node_modules/@workflow/builders/dist/vercel-build-output-api.js`, 2026-10-08 |
| Размещение B (`api/workflow-flow.ts` и запись в `functions`): при `framework: bun` сборка делает только функцию `src/server.ts` (`builds.json`: `@vercel/static` и `@vercel/backends`), функция из `api/` не появляется; `api/server.ts` из документации относится к модели без пресета | опровергнуто локально | `vercel build` (CLI 63.1.0), vercel.com/docs/functions/runtimes/bun, 2026-10-08 |
| Триггер очереди в `vercel.json`: `queue/v2beta` не принимает поле `consumer` (имя потребителя Vercel строит сам, в выводе `workflow_7Eapi_Sworkflow-flow_Dts`); значение с `consumer: "default"` из документации Workflow относится к `.vc-config.json` | подтверждено локально | схема в `@vercel/build-utils` (`triggerEventSchemaV2`), вывод `vercel build`, vercel.com/docs/queues/concepts |
| Размещение C (Services): сервисы `site` (`framework: bun`, `buildCommand`, `outputDirectory`, `functions`) и `workflow` (`entrypoint: api/workflow-flow.ts`, `buildCommand: bun run workflow:build`, триггер очереди) собираются, получаются две функции `runtime: bun1.4.x`, `experimentalTriggers` у `workflow`; `crons` и `bunVersion` остаются на верхнем уровне и принимаются. Без `buildCommand` у сервиса сборщик падает в проверке типов на TypeScript 7.0.2 («Cannot read properties of undefined (reading 'readFile')») | подтверждено локально, на Vercel не проверено | `vercel build` (CLI 63.1.0), vercel.com/docs/services, 2026-10-08 |
| Преобразование кода приложения при сборке на Vercel: сборщик пресета Bun (rolldown) не применяет `preload` из `bunfig.toml`; в выводе `workflows/turbo/index.mjs` нет `workflowId`, поэтому `start()` из функции сайта бросит «invalid workflow function» | подтверждено локально, блокер | `.vercel/output/.../workflows/turbo/index.mjs`, `@vercel/backends` (`src/build.ts`: серверный файл из `outputDirectory` используется вместо сборки rolldown, если он найден), workflow-sdk.dev/docs/errors/start-invalid-workflow-function |

## Проверить при реализации (не проверено)

Первой задачей плана идёт проверка размещения обработчика `flow` на preview-деплое, три варианта в порядке документированности: Build Output API (описан в документации Workflow), `api/`-функция, Vercel Services (оба описаны только в документации Vercel). Проверяется: уживается ли вариант с `vercel.json` и `framework: bun`, срабатывает ли триггер очереди, подхватывает ли прод-рантайм `bunfig.toml` (иначе преобразование на сборке), собирает ли `flow.mjs` зависимости (S3, база, Codex), где при Services живут `crons` и `bunVersion`. Для preview нужен пуш ветки, отдельное разрешение владельца.

Итог локальной части проверки (2026-10-08): размещение `flow` возможно через Services (вариант C), но открыт вопрос преобразования кода приложения: сборщик Vercel для пресета Bun его не применяет, а без него `start()` не получает идентификатор воркфлоу. Способы получить преобразованный код в функции сайта (сборка серверного файла проектом с плагином `workflow-plugin.ts` в `outputDirectory`, либо собственный Build Output API) требуют решения владельца и проверки на preview; до решения выполняются только задачи плана, не зависящие от размещения.

Остальное, проверяемое прогонами: видит ли агент картинки из результата `readFile` в `WorkflowAgent`; переносится ли зашифрованное рассуждение между шагами (провайдер ставит `store: false`; если нет, возвращаемся к варианту с циклом агента в одном шаге); что происходит при обрыве функции посреди `draw` (ожидается ошибка шага и возврат кредитов, не повторное рисование).

## Что меняется в файлах

Новые: `workflows/turbo/index.ts`, `workflows/turbo/steps.ts`, `src/lib/turbo/agent-definition.ts` (`createTurboAgent`), `src/lib/turbo/codex-agent-model.ts`, `workflow-plugin.ts`, обработчик `flow` (путь по итогу проверки размещения), `scripts/smoke-turbo-workflow.ts`.

Меняются: `src/api/generate.ts`, `src/components/Generate.tsx` (ветка 202), `src/lib/turbo/service.ts` (становится `startTurbo`), `src/lib/turbo/tools.ts` (общие определения, `generateImage` только проверяет), `src/lib/turbo/agent.ts` (остаются `classifyAgentError`, `buildAgentMessage`, `systemVersionOf`; цикл `ToolLoopAgent` уходит), `src/lib/turbo/runtime.ts`, `src/lib/generations.ts` (`GENERATION_STALE_MS`), `vercel.json`, `bunfig.toml`, `package.json`, `.gitignore`, `scripts/eval-turbo.ts`, `AGENTS.md`, `README.md`.
