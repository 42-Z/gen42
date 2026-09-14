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
bun run db:migrate   # миграции
```

## Архитектура

- `src/server.ts` — единственный entrypoint: API-роуты (`/api/auth/*`, `/api/generate`, `/api/generations`, `/api/me`, `/api/admin/*`) + раздача `dist/`. Не создавать отдельные entrypoints
- `src/api/` — обработчики роутов; `src/lib/` — доменная логика (credits, keys, hf, storage, rate-limit)
- Ключи HuggingFace живут только в таблице `api_keys` и управляются через админку (`/api/admin/keys`: добавление, сброс лимита, удаление). В env и файлах они не хранятся, API отдаёт их маскированными
- Баланс пользователя: одна генерация списывает один кредит — `src/lib/credits.ts`
- Первый пользователь с email из `ADMIN_EMAIL` — админ

## Хранилище (S3)

- `src/lib/storage.ts` использует `Bun.s3` (`S3Client`). Env: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`. Bun по умолчанию ходит path-style, что и требуется S3-совместимым провайдерам
- Прод-хранилище — **Neon Object Storage**: отдельный Neon-проект `gen42-storage` (`us-east-2`), бакет `images` (private), чтение через presigned URL. Проект БД `gen42` в `us-east-1`, а объектное хранилище Neon доступно только в `us-east-2`, поэтому они разные
- S3-креды Neon **branch-scoped** и выдаются так (запускать из `/tmp`: `--file` не принимает абсолютный путь):

  ```bash
  neon env pull --file storage.env --project-id rapid-water-10723622 --branch main -s object-storage
  ```

  Затем разложить `AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_ENDPOINT_URL_S3/AWS_REGION` → `S3_*`. `env pull` выдаёт новую пару ключей; после ротации перезалить их в Vercel и GitHub. Смена кредов вступает в силу только после редеплоя

## Генерация (HuggingFace)

- `src/lib/hf.ts` ходит в Gradio Space `krea-krea-2.hf.space` через **именованный** эндпоинт `POST /gradio_api/call/v2/generate` и опрос `…/call/v2/generate/{event_id}`. Старый `/call/generate` с `data: [ {…} ]` падает в `event: error` — не возвращать. Ответ: `data[0].url` (картинка), `data[1]` — seed
- Ключ HF передаётся только в заголовке `Authorization`; актуальную схему эндпоинтов смотреть в `GET /gradio_api/info`

## Деплой на Vercel

- Фреймворк `bun`, билд `bun run build`, output `dist/`, функция `src/server.ts`
- **Критичный фикс в `vercel.json`**: NFT-трассировщик резолвит с условием `bun`, рантайм — с `node`; пакеты с разными exports (`@better-auth/telemetry`, `@better-auth/utils`, `@noble/ciphers`, `@noble/hashes`) требуют явного `includeFiles`. При новых подобных ошибках (`Cannot find package 'X'` в рантайме Vercel) — добавлять пакет в brace-глобу `includeFiles`, а не ставить костыли в код
- Локальная проверка бандла: `vercel build --prod`, затем материализовать файлы из `filePathMap` (`.vercel/output/functions/index.func/.vc-config.json`) в отдельную папку и запускать `bun src/server.mjs` с подложенным `.env`
- **Авто-деплой**: проект подключён к GitHub (`42-Z/gen42`, прод-ветка `main`) — пуш в `main` собирает прод, другие ветки дают preview. Hobby-план не подключает приватные репо организаций, поэтому репозиторий публичный; при возврате приватности авто-деплой переносить на GitHub Actions (`vercel deploy --prod` по токену)
- Ручной выкат: `vercel deploy --prod --yes`. **Изменения env вступают в силу только после нового деплоя**
- Env переменные: не перетирать прод-специфичные значения локальными (например `BETTER_AUTH_URL` = прод-домен). Секреты Vercel помечены sensitive и не вытягиваются обратно (`vercel env pull` отдаёт `[SENSITIVE]`); добавлять/обновлять через `vercel env add NAME <environment> --force`, значение — из stdin. App-секреты дублируются в GitHub Actions secrets (`gh secret set -f <file>`)

## Проверка

- UI проверять в браузере через `agent-browser` на живом прод-домене после деплоя (или на `http://localhost:3000` при `bun dev`): вход → генерация → картинка из S3 → баланс −1 → галерея/лайтбокс
- Рантайм-ошибки Vercel смотреть через `vercel logs <deployment-url>`

## Стиль UI

- Язык интерфейса — русский, без технических подробностей (стек, версии, параметры API) в текстах для пользователя
- Контент живёт прямо на странице: никаких карточек-«окошек», в которых умещается весь сайт. Структура — типографика, отступы, тонкие линейки
- Поля ввода — с бордером и скруглением 22px, фон `secondary/60` (см. `src/components/ui/input.tsx`). Не underline
- Иконки — Tabler (`@tabler/icons-react`), не lucide
- UI-компоненты — канонический shadcn/ui (`components.json`, iconLibrary: tabler); `cn` только из `@/lib/utils`
- Декоративная графика — своя SVG: `graphics.tsx` (иконки, логотип) + `graphics-bg.tsx` (30 фоновых элементов) + `DecoScatter.tsx` (рассеивание по странице). Не эмодзи
- Админка: прогресс-бар вместо цифр для отображения лимитов ключей (used/limit)
- Генерация: без примеров промптов, бейдж «1» на кнопке (стоимость генерации)
- Дизайн-система: тёмная pop-палитра — индиго `#6c5cff` + фуксия `#ff5ca8`, градиент `--pop-gradient`, карточки `--color-card` с бордером `--color-border`. Шрифты Bricolage Grotesque (display) + Inter Tight (sans). Декоративные элементы фона с drift/pulse анимациями (`prefers-reduced-motion: reduce`). Палитра и утилити-классы в `src/index.css`

## Безопасность

- Секреты (`.env` с токенами HF) не коммитить — они в `.gitignore`. Токены HF хранятся только в БД
- Не логировать ключи и не отдавать их через API целиком без необходимости; в админке ключи маскировать
- App-секреты синхронизированы в Vercel (production + preview) и GitHub Actions secrets; при ротации обновлять оба места
