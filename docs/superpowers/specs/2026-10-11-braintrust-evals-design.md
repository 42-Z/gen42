# Evaluation на официальном формате Braintrust — дизайн

## Цель и объём

Перестроить систему проверок: никаких самописных eval-скриптов и локальных JSONL — только официальный формат Braintrust (SDK `Eval()`, датасеты проекта, custom-скореры), запуск через `bt eval`. Трассировка и evaluation целиком живут в Braintrust; работа без `BRAINTRUST_API_KEY` не предусмотрена.

Старые отчёты `docs/evals/*.jsonl` остаются на диске как архив (на них ссылаются прошлые спеки) и добавлены в `.gitignore` (сделано).

## Что уходит

- `scripts/eval-style42.ts` и `scripts/eval-turbo.ts` — заменяются eval-файлами; после переноса логики удаляются.
- Запись JSONL в `docs/evals/` — отменяется.
- `logEvalRun()` в `src/lib/tracing.ts` и его тесты — отменяются: эксперименты создаёт сам `Eval()`.
- Контракт «no-op без ключа» — отменяется: `initTracing()` без `BRAINTRUST_API_KEY` завершает процесс понятной ошибкой (сервер, шаги воркфлоу, eval-файлы).

## Новая архитектура

### 1. Eval-файлы

Официальный формат: `Eval("Gen42", { data, task, scores, experiment, metadata, maxConcurrency })` из `braintrust`, файлы `evals/*.eval.ts`, запуск `bt eval evals/` (CLI сам читает `.env`, транспилирует TS и печатает сводку со ссылкой на эксперимент).

- `evals/style42.eval.ts`: data — датасет `style42-prompts`; task — `enhancePrompt(input.prompt)` (с трассировкой через `traceSpan`), output — итоговый промпт; metadata — `style_version`, `duration_ms`, токены, fallback.
- `evals/turbo.eval.ts`: data — датасет `turbo-prompts`; task — прогон агента `createTurboAgent`/`runTurboAgent` без рисования (как раньше `eval-turbo.ts` без `--generate`), output — итоговый промпт; metadata — модель, `reasoning`, токены, время, `randomPicks`, пути входных изображений. Настройка замеров (модель/уровень рассуждения) — через env `TURBO_EVAL_MODEL`/`TURBO_EVAL_REASONING`, как раньше.

### 2. Датасеты

Запросы и промпты — в датасетах проекта `Gen42` (официальный best practice, выбран владельцем): `style42-prompts` (текущие `PROMPTS` из `scripts/eval-style42.ts`) и `turbo-prompts` (набор запросов из `scripts/eval-turbo.ts`). Создание и наполнение — через `bt datasets` (SDK/CLI), не руками в UI; данные датасетов — источник правды для прогонов, сравнимых между экспериментами.

### 3. Скореры (custom-код, официальный тип)

Инлайн-скореры в eval-файлах, каждый возвращает 0..1:

- `contract` — `validateEnhancedPrompt` (контракт стиля) — для style42;
- `has-42` — наличие «42» в промпте;
- `hero-first` — названный герой из запроса в первом предложении (`missingDetails` из `src/lib/prompts/style-hints.ts`);
- `no-unrequested-text` — отсутствие непрошеного текста (`maskUnrequestedTexts`/`requestsText` — проверка цитат);
- `length-band` — длина промпта в рабочем диапазоне (200–300 слов для style42; 550–800 для turbo).

Логика скореров переиспользует существующие проверки из `src/lib/prompts/` — новые правила не изобретаются.

### 4. Контракт ключа и трассировка

- `initTracing()` без `BRAINTRUST_API_KEY` — понятная ошибка, процесс завершается (сервер, шаги воркфлоу, eval-файлы). `traceSpan` остаётся обёрткой `traced()` с прокидыванием ошибок работы; тихих no-op-веток нет.
- Ошибки отправки в Braintrust не роняют генерацию (лог + продолжение) — это защита от сетевых сбоев, а не режим работы без ключа.

### 5. Запуск и CI

- Локально: `bt eval evals/` (или по файлу). Если CLI несовместим с Bun — официальный фолбэк из их доков: прямой запуск файла (`node_modules/.bin/bun evals/style42.eval.ts`), `Eval()` создаёт эксперимент сам.
- В CI (по желанию, следующим шагом): `bt eval evals/ --no-input` с `BRAINTRUST_API_KEY` из secrets — их официальный сценарий Run in CI/CD.

## Источники и статусы

| Утверждение | Источник | Статус |
| --- | --- | --- |
| Официальный формат: `Eval(project, { data, task, scores, ... })` + `bt eval` | braintrust.dev/docs/evaluate/run-in-code | подтверждено документацией |
| Датасеты — источник данных evals | braintrust.dev/docs/evaluate/run-evaluations, annotate/datasets | подтверждено документацией; выбрано владельцем |
| Custom-код — официальный тип скорера | braintrust.dev/docs/evaluate/write-scorers | подтверждено документацией; выбрано владельцем |
| Каждый прогон — неизменяемый эксперимент, сравнимый с другими | braintrust.dev/docs/evaluate/run-evaluations | подтверждено документацией |
| `bt eval` совместим с Bun-проектом | их доки перечисляют runner'ы tsx/vite-node/ts-node | не проверено → проверить на реализации, фолбэк — прямой запуск файла |
| Создание датасетов через `bt datasets` | CLI-справка скилла braintrust («Manage datasets») | не проверено → проверить на реализации |

## Проверить при реализации (не проверено)

1. Запуск `bt eval` в Bun-проекте (runner); при несовместимости — прямой запуск eval-файлов Bun'ом.
2. Создание и наполнение датасетов через `bt datasets` (или SDK `initDataset` с push) — каким способом окажется штатным.
3. Что `Eval()` корректно ловит ошибки task (упавший прогон не должен валить весь эксперимент — их доки описывают error в результате прогона).

## Что меняется в файлах

Новое: `evals/style42.eval.ts`, `evals/turbo.eval.ts`. Удаляется: `scripts/eval-style42.ts`, `scripts/eval-turbo.ts`, `logEvalRun`/`EvalRunRecord`/`evalExperimentName` в `src/lib/tracing.ts` (+ их тесты). Меняется: `src/lib/tracing.ts` (контракт ключа — fail fast), тесты `src/lib/__tests__/tracing.test.ts`, `src/server.ts` и `src/lib/turbo/workflow-runtime.ts` (без изменений вызова — контракт меняется внутри `initTracing`), `AGENTS.md`, `README.md`, `.env.example` (ключ обязателен), `package.json` (скрипты запуска evals: `eval:style42`, `eval:turbo` → `bt eval`). Датасеты `style42-prompts` и `turbo-prompts` создаются в проекте `Gen42`.
