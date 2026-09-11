# AGENTS.md

Инструкции для агентов, работающих с этим репозиторием.

## Стек и конвенции

Везде используем Bun вместо Node.js:

- `bun <file>` вместо `node`/`ts-node`
- `bun test` вместо jest/vitest
- `bun install`, `bun run <script>`, `bunx <package>`
- Bun сам загружает `.env` — dotenv не нужен

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
- Ключи HuggingFace живут в таблице `api_keys`, пул с дневными лимитами и ротацией — `src/lib/keys.ts`. Импорт новых: `bun scripts/import-keys.ts` (CSV `name;hf_...`)
- Баланс пользователя: одна генерация списывает один кредит — `src/lib/credits.ts`
- Первый пользователь с email из `ADMIN_EMAIL` — админ

## Деплой на Vercel

- Фреймворк `bun`, билд `bun run build`, output `dist/`, функция `src/server.ts`
- **Критичный фикс в `vercel.json`**: NFT-трассировщик резолвит с условием `bun`, рантайм — с `node`; пакеты с разными exports (`@better-auth/telemetry`, `@better-auth/utils`, `@noble/ciphers`, `@noble/hashes`) требуют явного `includeFiles`. При новых подобных ошибках (`Cannot find package 'X'` в рантайме Vercel) — добавлять пакет в brace-глобу `includeFiles`, а не ставить костыли в код
- Локальная проверка бандла: `vercel build --prod`, затем материализовать файлы из `filePathMap` (`.vercel/output/functions/index.func/.vc-config.json`) в отдельную папку и запускать `bun src/server.mjs` с подложенным `.env`

## Стиль UI

- Язык интерфейса — русский, без технических подробностей (стек, версии, параметры API) в текстах для пользователя
- Контент живёт прямо на странице: никаких карточек-«окошек», в которых умещается весь сайт. Структура — типографика, отступы, тонкие линейки
- Поля ввода — прозрачные, только нижняя граница (см. `src/components/ui/input.tsx`)
- Иконки — Tabler (`@tabler/icons-react`), не lucide
- UI-компоненты — канонический shadcn/ui (`components.json`, iconLibrary: tabler); `cn` только из `@/lib/utils`
- Декоративная графика — своя SVG (`src/components/graphics.tsx`), не эмодзи
- Дизайн-система: тёмная фотолаборатория — тёплый чернильный фон, янтарный акцент, зерно плёнки, шрифты Unbounded (display) + Inter Tight. Палитра и утилити-классы в `src/index.css`

## Безопасность

- Секреты (`.env`, `keys.csv` с HF-токенами) не коммитить — они в `.gitignore`. Токены HF хранятся только в БД
- Не логировать ключи и не отдавать их через API целиком без необходимости
