# AGENTS.md

Инструкции для агентов, работающих с этим репозиторием.

## Стек и конвенции

Везде используем Bun вместо Node.js:

- `bun <file>` вместо `node`/`ts-node`
- `bun test` вместо jest/vitest
- `bun install`, `bun run <script>`, `bunx <package>`
- Bun сам загружает `.env` — dotenv не нужен

Разовые скрипты на Python запускать через `uv run`, в том числе inline:

```bash
uv run - <<'EOF'
print("hello")
EOF
```

`--no-project` добавлять только когда в директории есть `pyproject.toml` и проект не нужен. Никаких `python3 -c` напрямую.

API:

- `Bun.serve()` с `routes` — никаких express/fastify
- `postgres` (postgres.js) для Postgres через `src/lib/db.ts` — не смешивать с `Bun.sql`
- `Bun.s3` для хранилища — не тянуть aws-sdk
- `Bun.file` вместо `node:fs` readFile/writeFile

Фронтенд:

- HTML imports: `index.html` в корне импортирует `./src/frontend.tsx` и `./src/index.css`, Bun bundler собирает сам. Vite не использовать
- Сервер отдаёт статику из `dist/` (см. `src/server.ts`)

## Команды

```bash
bun dev              # dev-сервер с hot reload
bun run build        # сборка фронтенда в dist/
bun test             # тесты (bun:test)
bun run db:migrate:dev  # миграции локально (ветка dev через .env.development)
bun run typecheck    # проверка типов
bun run lint         # линтер (biome)
bun run lint:fix     # автфикс линтера
bun run format       # форматер (biome)
```

Миграции на прод (`main`, `migrations/custom-tables.sql` идемпотентны) накатывает GitHub Actions (`.github/workflows/migrate-prod.yml`) по пушу в `main`. Разработчикам продовый DATABASE_URL не выдавать — только `.env.development`

## Архитектура

- `src/server.ts` — единственный entrypoint: API-роуты (`/api/auth/*`, `/api/generate`, `/api/generations`, `/api/me`, `/api/models`, `/api/admin/*`) + раздача `dist/`. Не создавать отдельные entrypoints
- `src/lib/models.ts` — реестр движков генерации `IMAGE_MODELS` (krea / ideogram): адрес Space, стоимость в кредитах, таймаут; `publicImageModels()` отдаёт клиенту только `id/label/cost`
- `src/lib/llm.ts` — единый клиент LLM-провайдеров: реестр `LLM_PROVIDERS` и generic `callLlm({ provider, … })` на AI SDK v7 (`ai` + `@ai-sdk/openai-compatible`)
- `src/api/` — обработчики роутов; `src/lib/` — доменная логика (credits, keys, models, hf, llm, enhance, storage, rate-limit); `src/lib/prompts/` — промпт-инженерия стиля «42»
- Ключи всех провайдеров живут только в таблице `api_keys` (`provider`: `huggingface` | `poolside` | `inception`) и управляются через админку (`/api/admin/keys`: добавление, проверка, удаление; `?provider=` выбирает список). В env и файлах они не хранятся, API отдаёт их маскированными
- Баланс пользователя: генерация списывает стоимость движка из `IMAGE_MODELS` (Krea 2 — 1, Ideogram 4 — 3) — `src/lib/credits.ts` (`deductCredits`/`refundCredits`). Новому пользователю при регистрации даётся 1 стартовый кредит (hook `databaseHooks.user.create.after` в `src/lib/auth.ts`, константа `SIGNUP_BONUS_CREDITS`)
- Первый пользователь с email из `ADMIN_EMAIL` — админ

## Хранилище (S3)

- `src/lib/storage.ts` использует `Bun.s3` (`S3Client`). Env: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`. Bun по умолчанию ходит path-style, что и требуется S3-совместимым провайдерам
- Прод — единый Neon-проект `gen42-storage` (`rapid-water-10723622`, `us-east-2`, ветка `main`): и Postgres (`neondb`), и **Neon Object Storage** (бакет `images`, private, чтение через presigned URL). Старый проект БД `gen42` (`steep-block-68050198`, `us-east-1`) не используется — данные переехали 2026-09-15 (pg_dump/restore, сверены md5 всех 7 таблиц)
- Локальная разработка — ветка `dev` в том же проекте (копия `main`, свой изолированный бакет). `bun dev` подхватывает `.env.development` (dev-DATABASE_URL + dev-S3), продовый `.env` не трогает; `NODE_ENV=production` берёт прод
- S3-креды Neon **branch-scoped** и выдаются так (запускать из `/tmp`: `--file` не принимает абсолютный путь):

  ```bash
  neon env pull --file storage.env --project-id rapid-water-10723622 --branch main -s object-storage
  ```

  Затем разложить `AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_ENDPOINT_URL_S3/AWS_REGION` → `S3_*`. `env pull` выдаёт новую пару ключей; после ротации перезалить их в Vercel и GitHub. Смена кредов вступает в силу только после редеплоя

## Генерация (HuggingFace)

- `src/lib/hf.ts` — общий Gradio-клиент `callSpace()`: `POST {space}/gradio_api/call/v2/{api}` (payload именованными полями, без старого `data: [ {…} ]`, иначе `event: error`), затем опрос `…/call/v2/{api}/{event_id}` с фолбэком на `…/call/{api}/{event_id}` при 404. Ответ: `data[0].url` (картинка), `data[1]` — seed. Движки задаются реестром `IMAGE_MODELS` (`src/lib/models.ts`), `generateImage({ engine, … })` диспатчит по нему
  - **Krea 2** — `krea-krea-2.hf.space`, поля `prompt/negative_prompt/model/steps/guidance/width/height/seed/randomize` (model `Turbo`/`Raw`, guidance 0, steps 8)
  - **Ideogram 4** — `ideogram-ai-ideogram4.hf.space`, поля `prompt/mode/upsampler/width/height/seed/randomize_seed`. Режим фиксирован `Default · 20 steps`, апсемплер `Ideogram (remote)` (Space сам фолбэчит на локальный Qwen); negative prompt и `model` Ideogram не принимает. Таймаут опроса больше (180с из-за 20 шагов)
- Ключ HF передаётся только в заголовке `Authorization`; актуальную схему эндпоинтов смотреть в `GET /gradio_api/info`
- У бесплатного ZeroGPU два суточных лимита на токен: секунды GPU и **прогоны** (`runs`, 8/сутки). `getZeroGPUQuota()` сохраняет оба (`hf_current`/`hf_resets_at` и `hf_runs_remaining`/`hf_runs_limit`/`hf_runs_resets_at`), админка показывает две полосы — «Секунды» и «Прогоны»
- `getAvailableKey('huggingface')` пропускает ключи без доступных секунд (`< 60`) или прогонов (`0`); после сброса (`resets_at` в прошлом) устаревшие счётчики не блокируют ключ. Ротация выбирает следующий ключ **до** вызова, а не после отказа
- Исчерпание ZeroGPU приходит как `event: error` при HTTP 200 (сообщение Space может ссылаться на секунды, хотя причина — прогоны). Такой ответ распознаётся как `KeyExhaustedError` по словам `ZeroGPU`/`quota`: квота ключа тут же обновляется с `last_error`, ключ не выключается — дальше его отфильтрует остаток по `runs`. Прочие `event: error` — обычная ошибка с текстом из payload

## Обогащение промпта (LLM, стиль «42»)

- Каждая генерация сначала проходит через `src/lib/enhance.ts`: пользовательский запрос превращается в плотный англоязычный промпт в стиле «42» и только потом уходит в выбранный движок (Krea 2 или Ideogram 4). Для пользователя это невидимо, контракт `POST /api/generate` не менялся (добавилось поле `engine`)
- LLM — два OpenAI-совместимых провайдера в реестре `src/lib/llm.ts` (`LLM_PROVIDERS`), вызов — generic `callLlm({ provider, … })`:
  - `poolside` — `POOLSIDE_BASE_URL` (по умолчанию `https://inference.poolside.ai/v1`), `POOLSIDE_MODEL` (по умолчанию `poolside/laguna-xs-2.1`), thinking выключен через `providerOptions.poolside.chat_template_kwargs.enable_thinking`
  - `inception` (Inception Labs) — `INCEPTION_BASE_URL` (по умолчанию `https://api.inceptionlabs.ai/v1`), `INCEPTION_MODEL` (по умолчанию `mercury-2.5`); `reasoning_effort: low` передаётся штатной опцией `providerOptions.inception.reasoningEffort`; rate-limit заголовков нет → `rl_*` = `NULL`; 401/402/403/429 = «ключ не работает» (402 у Inception — биллинг/квота)
- Ключи LLM живут в той же таблице `api_keys` с `provider = 'poolside'` (префикс `sky_`) или `provider = 'inception'` (формат ключа не фиксирован — достаточно непустой строки); у HF-ключей `provider = 'huggingface'`. Ротация: `getAvailableLlmKey()` берёт из единого пула обоих провайдеров по заголовку `x-ratelimit-remaining-requests` и по 429/401/402/403; ключи без замеров (`NULL`, как у Inception) сортируются последними. При исчерпании всех ключей промпт собирается шаблоном `src/lib/style42-fallback.ts` — генерация не падает
- Системный промпт стиля — `src/lib/prompts/style42.system.ts` (TS-модуль, а не `.md`: текстовый импорт Bun не понимает NFT-трассировщик Vercel). SHA-хеш содержимого пишется в `generations.style_version` — по нему сравниваются итерации
- Серверные инварианты из промпта продублированы в коде (`src/lib/prompts/style-hints.ts`): явный стиль пользователя («фотореализм», «аниме», «детский рисунок» и т.п.) вытесняет якорь медиума, финальная формула с медиумом гарантируется постобработкой, экшен-детали и названный герой (мопс, кот, опоссум…; политик → Босс) проверяются по мини-глоссарию (потеряли — повтор с `MISSING DETAILS`)
- Замысел важнее канона: обилие 42 и свиты без просьбы — норма, ошибка только в подмене замысла. Место и цвета/свет из запроса (`detectUserSetting`/`detectUserPalette`) убирают якоря `location`/`lighting` из сообщения (строка `USER-DEFINED`). Якоря идут в начале сообщения, запрос пользователя — последним с напоминанием открыть промпт его героем. Если подлежащее первого предложения — свита из канона, о которой не просили (`hijackedOpening`), — повтор. Ответ LLM с мелкими огрехами (потерянная деталь, свита в начале) возвращается как лучший кандидат, шаблонный fallback — только когда LLM не ответила вовсе
- Якорь медиума всегда реалистичный (фото, 3D, кадр из фильма, обложка рэп-альбома); стилизации — только по запросу пользователя
- Лексикон сообщества в системном промпте: Пятёрка/5opka, Magnum/Opus, взвод/рота/батальон (номер отряда, а не количество), братухи, SLAY, агитация — чтобы маленькая LLM не превращала «3 взвод» в трёх волков
- Политика текста: слова и лозунги появляются в кадре только по запросу. Текстовый запрос — кавычки «», “”, "" (`extractQuotedTexts`), слова «надпись/плакат/агитация/афиша/обложка» (`requestsText`) и лозунги капсом (`extractCapsPhrases`, строка `TEXT CANDIDATES`); «под названием X» (`extractNamedTexts`) — точный текст X. Без текстового запроса слоган-якорь не передаётся, а найденные в ответе цитаты маскируются постобработкой (`maskUnrequestedTexts`); точный текст пользователя переносится дословно и проверяется (`EXACT TEXT`). Кириллические имена из запроса, оставленные LLM без кавычек, берутся в кавычки (`quoteUserCyrillic`), а перед генератором «…» заменяются на "…" (`toGeneratorQuotes`) — ёлочки Krea рисует буквально. В блоке «Примеры» промпта цитируется только текст из INPUT примеров — это покрыто тестом-стражем
- Плотность и экшен: промпт требует три слоя кадра, минимумы по существам/технике/роскоши/архитектуре (восьмой якорь `props` — абсурдный реквизит), ≥3 сюрприза и явное действие в первом предложении с усилением в 2–3 местах; реализм материалов и света обязателен, `toy-like`/`flat` запрещены
- В `generations` пишутся `enhanced_prompt`, `llm_key_id`, `llm_model`, `llm_tokens`, `enhance_ms`, `style_version`
- Неуспешные генерации тоже пишутся в `generations`: `status = 'failed'`, `cost = 0` (кредиты возвращены), исходный `prompt`, всё, что успело прийти от LLM, и причина в `error_message` в формате `<код>: <текст ошибки>` (`insufficient_credits`, `all_keys_exhausted`, `key_exhausted (<status>)`, `queue_timeout`, `error`) — `src/lib/generation-error.ts`. Сбой этой записи логируется и не меняет ответ пользователю. Галерея `/api/generations` и `/api/admin/stats` считают только `status = 'completed'`. FK `api_key_id` — `ON DELETE SET NULL`, удаление HF-ключа не блокируется историей
- Итерации стиля: `bun scripts/eval-style42.ts [подстроки…]` (21 промпт → JSONL в `docs/evals/`), визуальный прогон — `bun scripts/eval-images.ts [подстроки…]` (картинки в `docs/evals/images/`, вне git)
- Админка: блок «Ключи LLM» — селект провайдера (Poolside / Inception), добавление (`sky_` для Poolside, непустая строка для Inception), колонка «Провайдер», остаток запросов, токены, кнопка «Проверить и включить» (тестовый вызов) и удаление

## Деплой на Vercel

- Фреймворк `bun`, билд `bun run build`, output `dist/`, функция `src/server.ts`
- `vercel.json` задаёт `maxDuration: 300` для `src/server.ts`: генерация Ideogram 4 ждёт результат до 180с, плюс впереди LLM-обогащение и очередь ZeroGPU; Hobby+Fluid допускает до 300с. Уменьшать лимит нельзя без сокращения таймаутов опроса
- **Критичный фикс в `vercel.json`**: NFT-трассировщик резолвит с условием `bun`, рантайм — с `node`; пакеты с разными exports (`@better-auth/telemetry`, `@better-auth/utils`, `@noble/ciphers`, `@noble/hashes`) требуют явного `includeFiles`. При новых подобных ошибках (`Cannot find package 'X'` в рантайме Vercel) — добавлять пакет в brace-глобу `includeFiles`, а не ставить костыли в код
- Локальная проверка бандла: `vercel build --prod`, затем материализовать файлы из `filePathMap` (`.vercel/output/functions/index.func/.vc-config.json`) в отдельную папку и запускать `bun src/server.mjs` с подложенным `.env`
- **Авто-деплой**: проект подключён к GitHub (`42-Z/gen42`, прод-ветка `main`) — пуш в `main` собирает прод, другие ветки дают preview. Hobby-план не подключает приватные репо организаций, поэтому репозиторий публичный; при возврате приватности авто-деплой переносить на GitHub Actions (`vercel deploy --prod` по токену)
- Ручной выкат: `vercel deploy --prod --yes`. **Изменения env вступают в силу только после нового деплоя**
- Env переменные: не перетирать прод-специфичные значения локальными (например `BETTER_AUTH_URL` = прод-домен). Секреты Vercel помечены sensitive и не вытягиваются обратно (`vercel env pull` отдаёт `[SENSITIVE]`); добавлять/обновлять через `vercel env add NAME <environment> --force`, значение — из stdin. App-секреты дублируются в GitHub Actions secrets (`gh secret set -f <file>`)

## Проверка

- UI проверять в браузере через `agent-browser` на живом прод-домене после деплоя (или на `http://localhost:3000` при `bun dev`): вход → выбор движка → генерация → картинка из S3 → баланс −стоимость движка → галерея/лайтбокс
- Рантайм-ошибки Vercel смотреть через `vercel logs <deployment-url>`

## Процесс изменений (обязательно)

- Перед PR обновлять `AGENTS.md` и `README.md`, если изменились поведение, контракты, схема БД или переменные окружения
- Перед PR прогонять свежие проверки: `bun run typecheck`, `bun run lint`, `bunx biome format .`, `bun test`, `bun run build` (плюс `vercel build --prod` при изменениях серверной части и зависимостей)
- Перед PR делать ревью диффа (субагент-ревьюер): находки blocker/major закрывать до мержа, minor — осознанно принимать или закрывать
- Не заявлять о готовности без свежих свидетельств (verify-before-completion): команда, её вывод, только потом вывод о результате
- **Предсуществующие ошибки и предупреждения исправлять по ходу.** Если линтер, тайпчек или тесты ругаются на код, который ты трогаешь (или рядом), — починить в рамках этой же работы, а не оставлять со словами «это было до меня». Исключение — правка явно вне зоны задачи; тогда вынести отдельно
- **В описании PR не писать про запуск линтера, тайпчека и тестов** — это не интересно ревьюеру. Вместо этого, если были изменения фронтенда, вставить в описание PR скриншот (через скилл `before-and-after`, не ссылкой на временный хостинг)
- Мерж в `main`, миграции прод-базы, ключи и любые действия на проде — только с явного разрешения владельца; `main` защищён, изменения идут через PR с зелёным CI
- Скиллы — часть репозитория: `.agents/skills/**` (содержимое), `.claude/skills/**` (симлинки на них) и `skills-lock.json` коммитятся вместе с изменениями, а не остаются локальными

## Стиль UI

- **Любые фронтенд-изменения — только через скилл shadcn/ui** (`shadcn`, лежит в `.agents/skills/shadcn/`): перед правкой UI-кода загрузить скилл, компоненты добавлять через CLI (`bunx --bun shadcn@latest add <component>`), использовать канонические примитивы и правила скилла (композиция, `size-*`, `data-icon`, семантические токены, `cn()` из `@/lib/utils`, `gap-*` вместо `space-*`). Не писать самописные аналоги shadcn-компонентов
- Язык интерфейса — русский, без технических подробностей (стек, версии, параметры API) в текстах для пользователя
- Контент живёт прямо на странице: никаких карточек-«окошек», в которых умещается весь сайт. Структура — типографика, отступы, тонкие линейки
- Поля ввода — с бордером и скруглением 22px, фон `secondary/60` (см. `src/components/ui/input.tsx`). Не underline
- Иконки — Tabler (`@tabler/icons-react`), не lucide
- UI-компоненты — канонический shadcn/ui (`components.json`, iconLibrary: tabler); `cn` только из `@/lib/utils`
- Декоративная графика — своя SVG: `graphics.tsx` (иконки, логотип) + `graphics-bg.tsx` (30 фоновых элементов) + `DecoScatter.tsx` (рассеивание по странице). Не эмодзи
- Админка: прогресс-бар вместо цифр для отображения лимитов ключей (used/limit)
- Ключи обоих провайдеров показываются одним паттерном: HF — «Ключи генерации» с двумя полосами ZeroGPU («Секунды» и «Прогоны») и кнопкой «Проверить и включить», LLM — «Ключи LLM» с селектом провайдера при добавлении (Poolside / Inception), колонкой «Провайдер», остатком запросов и токенами
- «Проверить и включить» у HF-ключа обновляет квоту и включает его только при остатке и секунд (≥60), и прогонов (>0); иначе возвращает 409 с деталями — ключ ждёт сброса
- Генерация: выбор движка (Krea 2 / Ideogram 4) — чип модели в нижней строке поля промпта (слева), по клику — поповер со списком (иконка, имя, цена, галочка у активного); кнопка генерации — справа в том же поле, с бейджем цены выбранной модели (1 или 3 кредита); без примеров промптов
- Дизайн-система: тёмная pop-палитра — индиго `#6c5cff` + фуксия `#ff5ca8`, градиент `--pop-gradient`, карточки `--color-card` с бордером `--color-border`. Шрифты Bricolage Grotesque (display) + Inter Tight (sans). Декоративные элементы фона с drift/pulse анимациями (`prefers-reduced-motion: reduce`). Палитра и утилити-классы в `src/index.css`

## Безопасность

- Секреты (`.env` с токенами HF) не коммитить — они в `.gitignore`. Токены HF хранятся только в БД
- Не логировать ключи и не отдавать их через API целиком без необходимости; в админке ключи маскировать
- App-секреты синхронизированы в Vercel (production + preview) и GitHub Actions secrets; при ротации обновлять оба места
