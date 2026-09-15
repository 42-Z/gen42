# Замена локальных счётчиков на реальную квоту ZeroGPU

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить фиктивные локальные счётчики `used_today/daily_limit` на реальную квоту ZeroGPU, получаемую через официальный API HuggingFace `GET /api/spaces/zero-gpu/quota`.

**Architecture:** Добавляем функцию `getZeroGPUQuota()` в `hf.ts`, которая ходит в HF API. Миграция БД заменяет колонки `used_today/daily_limit` на `hf_base/hf_current/hf_resets_at/hf_checked_at`. `getAvailableKey()` выбирает ключ с наибольшим реальным остатком. После каждой генерации квота обновляется. Админка показывает.progress bar с реальными секундами.

**Tech Stack:** Bun, postgres.js, React, HF REST API, Tabler icons

---

## Файловая структура

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `migrations/custom-tables.sql` | Modify | Схема БД: новые колонки вместо старых |
| `src/lib/hf.ts` | Modify | Добавить `getZeroGPUQuota()` |
| `src/lib/keys.ts` | Rewrite | Новый `getAvailableKey()`, `updateKeyQuota()`, удалить `resetStaleKeys/incrementKeyUsage` |
| `src/api/generate.ts` | Modify | Обновление квоты после генерации, удаление `incrementKeyUsage` |
| `src/api/admin.ts` | Modify | Новый эндпоинт `/api/admin/quota`, обновлённые SELECT/INSERT |
| `src/server.ts` | Modify | Зарегистрировать роут `/api/admin/quota` |
| `src/components/Admin.tsx` | Rewrite | Progress bar с секундами, кнопка обновить, removes reset button |
| `src/lib/__tests__/keys.test.ts` | Rewrite | Тесты под новую логику |
| `src/lib/__tests__/hf.test.ts` | Modify | Тест для `getZeroGPUQuota()` |

---

## Task 1: Миграция БД

**Files:**
- Modify: `migrations/custom-tables.sql`

- [ ] **Step 1: Заменить схему `api_keys`**

Заменить содержимое блока `CREATE TABLE api_keys` (строки 10-21) на:

```sql
-- Ключи HuggingFace с квотой ZeroGPU
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hf_base INTEGER,
  hf_current REAL,
  hf_resets_at TIMESTAMPTZ,
  hf_checked_at TIMESTAMPTZ,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Применить миграцию**

Run: `bun run db:migrate`
Expected: `✅ Миграции применены`

- [ ] **Step 3: Проверить структуру таблицы**

Run: `bun -e "import { sql } from './src/lib/db'; const r = await sql\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'api_keys' ORDER BY ordinal_position\`; console.table(r); process.exit(0);"`

Expected: Таблица с колонками `id, name, key, is_active, hf_base, hf_current, hf_resets_at, hf_checked_at, created_at`

- [ ] **Step 4: Commit**

```bash
git add migrations/custom-tables.sql
git commit -m "db: replace used_today/daily_limit with hf_base/hf_current/hf_resets_at/hf_checked_at"
```

---

## Task 2: `getZeroGPUQuota()` в hf.ts

**Files:**
- Modify: `src/lib/hf.ts`
- Test: `src/lib/__tests__/hf.test.ts`

- [ ] **Step 1: Добавить интерфейс и функцию в `src/lib/hf.ts`**

После строки 14 (после `interface GenerateResult`) добавить:

```typescript
export interface ZeroGPUQuota {
  base: number;
  current: number;
  resetsAt: string | null;
}

export async function getZeroGPUQuota(apiKey: string): Promise<ZeroGPUQuota | null> {
  try {
    const res = await fetch("https://huggingface.co/api/spaces/zero-gpu/quota", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { base: data.base, current: data.current, resetsAt: data.resetsAt };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Написать тест для `getZeroGPUQuota` в `src/lib/__tests__/hf.test.ts`**

В конец файла добавить:

```typescript
describe("getZeroGPUQuota", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("возвращает quota при успешном ответе", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ base: 300, current: 278.5, resetsAt: "2026-09-15T12:00:00Z", overquotaUsed: 0 }),
    ) as any;
    const { getZeroGPUQuota } = await import("../hf");
    const q = await getZeroGPUQuota("hf_test");
    expect(q).toEqual({ base: 300, current: 278.5, resetsAt: "2026-09-15T12:00:00Z" });
  });

  test("возвращает null при ошибке API", async () => {
    globalThis.fetch = mock(async () => new Response("error", { status: 500 })) as any;
    const { getZeroGPUQuota } = await import("../hf");
    const q = await getZeroGPUQuota("hf_test");
    expect(q).toBeNull();
  });

  test("возвращает null при сетевой ошибке", async () => {
    globalThis.fetch = mock(async () => { throw new Error("network"); }) as any;
    const { getZeroGPUQuota } = await import("../hf");
    const q = await getZeroGPUQuota("hf_test");
    expect(q).toBeNull();
  });
});
```

- [ ] **Step 3: Запустить тесты**

Run: `bun test src/lib/__tests__/hf.test.ts`
Expected: Все тесты PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/hf.ts src/lib/__tests__/hf.test.ts
git commit -m "feat: add getZeroGPUQuota() to fetch real HF quota"
```

---

## Task 3: Переписать `keys.ts`

**Files:**
- Rewrite: `src/lib/keys.ts`
- Rewrite: `src/lib/__tests__/keys.test.ts`

- [ ] **Step 1: Переписать `src/lib/keys.ts`**

Полностью заменить содержимое файла:

```typescript
import { sql } from "./db";

export interface ApiKeyRow {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  hf_base: number | null;
  hf_current: number | null;
  hf_resets_at: Date | null;
  hf_checked_at: Date | null;
  created_at: Date;
}

export class AllKeysExhaustedError extends Error {
  constructor() {
    super("All API keys exhausted");
  }
}

export async function getAvailableKey(): Promise<ApiKeyRow> {
  const keys = await sql`
    SELECT * FROM api_keys
    WHERE is_active = TRUE
      AND (hf_current IS NULL OR hf_current >= 60)
    ORDER BY hf_current DESC NULLS LAST
    LIMIT 1
  `;

  if (keys.length === 0) {
    throw new AllKeysExhaustedError();
  }
  return keys[0];
}

export async function deactivateKey(keyId: string): Promise<void> {
  await sql`
    UPDATE api_keys
    SET is_active = FALSE
    WHERE id = ${keyId}
  `;
}

export async function updateKeyQuota(
  keyId: string,
  quota: { base: number; current: number; resetsAt: string | null },
): Promise<void> {
  await sql`
    UPDATE api_keys
    SET hf_base = ${quota.base},
        hf_current = ${quota.current},
        hf_resets_at = ${quota.resetsAt},
        hf_checked_at = NOW()
    WHERE id = ${keyId}
  `;
}
```

- [ ] **Step 2: Переписать `src/lib/__tests__/keys.test.ts`**

Полностью заменить содержимое файла:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

let responses: Record<string, unknown[]> = {};

const mockSql = mock((strings: TemplateStringsArray, ...values: unknown[]) => {
  const query = strings.join("?");
  for (const [pattern, result] of Object.entries(responses)) {
    if (query.includes(pattern)) return Promise.resolve(result);
  }
  return Promise.resolve([]);
});

mock.module("../db", () => ({ sql: mockSql }));

const {
  getAvailableKey,
  AllKeysExhaustedError,
  updateKeyQuota,
} = await import("../keys");

describe("API Keys", () => {
  beforeEach(() => {
    mockSql.mockClear();
    responses = {};
  });

  test("getAvailableKey возвращает ключ с наибольшим hf_current", async () => {
    responses = { "FROM api_keys": [{
      id: "k1", name: "top1", key: "hf_x", is_active: true,
      hf_base: 300, hf_current: 250, hf_resets_at: null, hf_checked_at: null, created_at: new Date(),
    }] };
    const key = await getAvailableKey();
    expect(key.id).toBe("k1");
  });

  test("getAvailableKey пропускает ключи с hf_current < 60", async () => {
    responses = { "FROM api_keys": [{
      id: "k2", name: "low", key: "hf_y", is_active: true,
      hf_base: 300, hf_current: 30, hf_resets_at: null, hf_checked_at: null, created_at: new Date(),
    }] };
    await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
  });

  test("getAvailableKey допускает ключи с hf_current IS NULL (фоллбэк)", async () => {
    responses = { "FROM api_keys": [{
      id: "k3", name: "unknown", key: "hf_z", is_active: true,
      hf_base: null, hf_current: null, hf_resets_at: null, hf_checked_at: null, created_at: new Date(),
    }] };
    const key = await getAvailableKey();
    expect(key.id).toBe("k3");
  });

  test("getAvailableKey бросает AllKeysExhaustedError без доступных ключей", async () => {
    responses = { "FROM api_keys": [] };
    await expect(getAvailableKey()).rejects.toThrow(AllKeysExhaustedError);
  });

  test("updateKeyQuota записывает данные через SQL", async () => {
    await updateKeyQuota("k1", { base: 300, current: 200, resetsAt: "2026-09-15T12:00:00Z" });
    expect(mockSql).toHaveBeenCalled();
    const call = mockSql.mock.calls[0];
    const strings = call![0] as TemplateStringsArray;
    const query = strings.join("?");
    expect(query).toContain("hf_base");
    expect(query).toContain("hf_current");
    expect(query).toContain("hf_resets_at");
    expect(query).toContain("hf_checked_at");
  });
});
```

- [ ] **Step 3: Запустить тесты**

Run: `bun test src/lib/__tests__/keys.test.ts`
Expected: Все тесты PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/keys.ts src/lib/__tests__/keys.test.ts
git commit -m "feat: rewrite keys.ts to use real HF ZeroGPU quota"
```

---

## Task 4: Обновить `generate.ts`

**Files:**
- Modify: `src/api/generate.ts`

- [ ] **Step 1: Заменить импорт**

Строку 3-8 заменить на:

```typescript
import {
  getAvailableKey,
  deactivateKey,
  updateKeyQuota,
  AllKeysExhaustedError,
} from "../lib/keys";
```

И строку 10 заменить на:

```typescript
import { generateImage, getZeroGPUQuota, KeyExhaustedError } from "../lib/hf";
```

- [ ] **Step 2: Заменить `incrementKeyUsage` на `updateKeyQuota` после генерации**

Строку 85 (`await incrementKeyUsage(currentKey!.id);`) заменить на:

```typescript
        const quota = await getZeroGPUQuota(currentKey!.key);
        if (quota) {
          await updateKeyQuota(currentKey!.id, quota);
        }
```

- [ ] **Step 3: Убрать `incrementKeyUsage` из блока ошибок**

Строки 99-101 заменить на:

```typescript
        if (currentKey) {
          const quota = await getZeroGPUQuota(currentKey.key);
          if (quota) {
            await updateKeyQuota(currentKey.id, quota);
          }
        }
```

- [ ] **Step 4: Commit**

```bash
git add src/api/generate.ts
git commit -m "feat: update HF quota after generation instead of incrementing counter"
```

---

## Task 5: Обновить `admin.ts`

**Files:**
- Modify: `src/api/admin.ts`

- [ ] **Step 1: Добавить импорт `getZeroGPUQuota`**

В начало файла, после строки 3 добавить:

```typescript
import { getZeroGPUQuota } from "../lib/hf";
```

- [ ] **Step 2: Обновить GET `/api/admin/keys`**

Строки 60-65 заменить на:

```typescript
      const keys = await sql`
        SELECT id, name, key, is_active,
               hf_base, hf_current, hf_resets_at, hf_checked_at, created_at
        FROM api_keys
        ORDER BY hf_current DESC NULLS LAST
      `;
```

- [ ] **Step 3: Обновить POST `/api/admin/keys` (добавление ключа)**

Строку 74 (`const { name, key, daily_limit } = await req.json();`) заменить на:

```typescript
      const { name, key } = await req.json();
```

Строки 80-83 (INSERT) заменить на:

```typescript
        const [newKey] = await sql`
          INSERT INTO api_keys (id, name, key)
          VALUES (${crypto.randomUUID()}, ${name}, ${key})
          RETURNING id, name, is_active, hf_base, hf_current, hf_resets_at, hf_checked_at, created_at
        `;
```

- [ ] **Step 4: Заменить POST `/api/admin/keys/:id` (сброс) на запрос квоты с HF**

Строки 104-114 заменить на:

```typescript
    POST: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const { id } = (req as any).params;
      const keys = await sql`SELECT key FROM api_keys WHERE id = ${id}`;
      if (keys.length === 0) {
        return Response.json({ error: "Ключ не найден" }, { status: 404 });
      }

      const quota = await getZeroGPUQuota(keys[0].key);
      if (!quota) {
        return Response.json({ error: "Не удалось получить квоту с HF" }, { status: 502 });
      }

      await updateKeyQuota(id, quota);
      return Response.json({ success: true, quota });
    }),
```

- [ ] **Step 5: Обновить GET `/api/admin/stats`**

Строки 137-141 заменить на:

```typescript
        sql`
          SELECT id, name, is_active, hf_base, hf_current, hf_resets_at
          FROM api_keys
          ORDER BY hf_current DESC NULLS LAST
        `,
```

- [ ] **Step 6: Commit**

```bash
git add src/api/admin.ts
git commit -m "feat: admin endpoints use real HF quota, add quota refresh"
```

---

## Task 6: Зарегистрировать роут `/api/admin/quota` в server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Добавить роут**

После строки 39 (`"/api/admin/stats": adminRoutes["/api/admin/stats"],`) добавить:

```typescript
    "/api/admin/quota": adminRoutes["/api/admin/quota"],
```

Но т.к. у нас нет отдельного роута `/api/admin/quota` — эндпоинт обновления квоты уже встроен в `POST /api/admin/keys/:id`. Этот шаг не нужен, роут `/api/admin/keys/:id` уже зарегистрирован в строке 38.

Этот task отменяется — роут уже есть.

---

## Task 7: Переписать `Admin.tsx`

**Files:**
- Rewrite: `src/components/Admin.tsx`

- [ ] **Step 1: Обновить функцию `resetKey` на `refreshQuota`**

Функцию `resetKey` (строки 100-109) заменить на:

```typescript
  async function refreshQuota(id: string) {
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: "POST" });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to refresh quota:", error);
    }
  }
```

- [ ] **Step 2: Обновить заголовок «Лимит» на «Квота ZeroGPU»**

Строку 273 (`<TableHead>Лимит</TableHead>`) заменить на:

```tsx
                <TableHead>Квота ZeroGPU</TableHead>
```

- [ ] **Step 3: Заменить progress bar**

Строки 286-296 (ячейка с progress bar) заменить на:

```tsx
                  <TableCell>
                    {k.hf_current != null && k.hf_base != null ? (
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={`h-full rounded-full transition-all ${
                              k.hf_current / k.hf_base > 0.5
                                ? "bg-primary"
                                : k.hf_current / k.hf_base > 0.2
                                  ? "bg-yellow-500"
                                  : "bg-destructive"
                            }`}
                            style={{ width: `${Math.min((k.hf_current / k.hf_base) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {Math.round(k.hf_current)}s / {k.hf_base}s
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">не проверено</span>
                    )}
                  </TableCell>
```

- [ ] **Step 4: Добавить информацию о сбросе квоты**

После ячейки статуса (строка 305, после `</TableCell>`) добавить новую ячейку:

```tsx
                  <TableCell className="text-xs text-muted-foreground">
                    {k.hf_resets_at
                      ? `сброс ${new Date(k.hf_resets_at).toLocaleString("ru")}`
                      : k.hf_checked_at
                        ? `проверено ${new Date(k.hf_checked_at).toLocaleString("ru")}`
                        : ""}
                  </TableCell>
```

- [ ] **Step 5: Обновить заголовок таблицы — добавить колонку «Сброс»**

В `<TableHeader>` (строку 275, после `<TableHead>Статус</TableHead>`) добавить:

```tsx
                <TableHead>Сброс</TableHead>
```

- [ ] **Step 6: Заменить кнопку «Сбросить лимит» на «Обновить квоту»**

Строку 307 заменить на:

```tsx
                    <Button variant="ghost" size="icon" title="Обновить квоту с HF" aria-label="Обновить квоту" onClick={() => refreshQuota(k.id)}>
```

- [ ] **Step 7: Убрать `Select` и `SelectContent` компоненты (больше не нужны для сброса)**

Удалить импорт `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` (строки 21-26) — они больше не используются. Все `Select` компоненты уже используются для выбора пользователя в секции кредитов — оставить импорты.

На самом деле `Select` используется в секции кредитов (строка 206), поэтому импорты оставляем.

- [ ] **Step 8: Commit**

```bash
git add src/components/Admin.tsx
git commit -m "feat: admin UI shows real ZeroGPU quota in seconds with refresh button"
```

---

## Task 8: Финальная проверка

**Files:**
- Все изменённые файлы

- [ ] **Step 1: Запустить все тесты**

Run: `bun test`
Expected: Все тесты PASS

- [ ] **Step 2: Запустить dev-сервер и проверить**

Run: `bun dev`
Открыть `http://localhost:3000`, войти как админ, проверить:
- Ключи отображаются с реальной квотой в секундах
- Кнопка «Обновить квоту» работает
- Генерация работает и квота обновляется после неё

- [ ] **Step 3: Проверить что старые колонки удалены**

Run: `bun -e "import { sql } from './src/lib/db'; const r = await sql\`SELECT column_name FROM information_schema.columns WHERE table_name = 'api_keys'\`; console.log(r.map(x => x.column_name)); process.exit(0);"`

Expected: `['id', 'name', 'key', 'is_active', 'hf_base', 'hf_current', 'hf_resets_at', 'hf_checked_at', 'created_at']` — нет `used_today`, `daily_limit`, `last_used_at`, `last_reset_at`
