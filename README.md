# gen42

Генерация изображений по текстовому описанию. Пользователь пишет промпт — приложение тратит один кредит и возвращает готовый кадр, сохраняя его в личной галерее.

**https://gen42.vercel.app**

## Как это работает

- Монолит на Bun: один сервер отдаёт и API, и собранный фронтенд
- React 19 + Tailwind v4, UI-компоненты shadcn/ui, иконки Tabler
- Аутентификация Better Auth (email/password), сессии в Postgres
- База — Neon Postgres, картинки — S3-совместимое хранилище (Bun S3)
- Изображения генерирует Krea-2 Space на HuggingFace через пул API-ключей с дневными лимитами и автоматической ротацией
- Кредиты: у каждого пользователя баланс, одна генерация = один кредит; админ может менять баланс
- Админка: статистика, управление кредитами и ключами

## Запуск

```bash
bun install
cp .env.example .env   # заполнить переменные
bun run db:migrate     # создать таблицы
bun dev                # http://localhost:3000
```

Первый пользователь с email из `ADMIN_EMAIL` становится админом при регистрации.

### Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Neon Postgres (обязателен `sslmode=require`) |
| `BETTER_AUTH_SECRET` | Секрет Better Auth, минимум 32 символа |
| `BETTER_AUTH_URL` | Базовый URL приложения |
| `ADMIN_EMAIL` | Email, который получает права админа |
| `S3_*` | Доступ к хранилищу картинок (ключ, секрет, endpoint, регион, бакет) |

### Импорт HF-ключей

Ключи HuggingFace хранятся в таблице `api_keys`. Импорт из CSV (`name;hf_...`):

```bash
bun scripts/import-keys.ts
```

## Деплой на Vercel

Фреймворк `bun`, билд — `bun run build` (фронтенд собирается в `dist/`), entrypoint функции — `src/server.ts`.

Важный нюанс: трассировщик зависимостей Vercel резолвит пакеты с условием `bun`, а рантайм Bun ищет файлы по условию `node`. Из-за этого из пакетов с разными exports для `node`/`default` (например `@better-auth/telemetry`) в бандл не попадает нужный файл. Лечится явным включением в `vercel.json`:

```json
"functions": {
  "src/server.ts": {
    "includeFiles": "node_modules/{@better-auth/telemetry,better-auth/node_modules/@better-auth/utils,@noble/ciphers,@noble/hashes}/**"
  }
}
```

## Структура

```
src/
  server.ts        # entrypoint: Bun.serve, API-роуты + раздача dist/
  frontend.tsx     # корень React-приложения
  api/             # auth, generate, admin
  lib/             # db, auth, credits, keys, hf, storage, rate-limit, migrate
  components/      # экраны (Auth, Generate, Gallery, Admin) и ui/
build.ts           # сборка фронтенда в dist/
scripts/           # утилиты (импорт ключей)
```
