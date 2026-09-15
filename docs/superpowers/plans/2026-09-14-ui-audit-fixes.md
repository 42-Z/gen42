# UI Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить 12 ошибок вёрстки: неподруженные скругления, дублирующиеся отступы, скачущие стили, проблемы адаптивности.

**Architecture:** Точки входа — UI-компоненты в `src/components/ui/` и страницы в `src/components/`. Все скругления приводятся к единой шкале: `rounded-[22px]` для карточек/контейнеров, `rounded-2xl` для инпутов, `rounded-full` для иконок-кнопок. Отступы — только из Tailwind-шкалы (4/5/6/8/10/12). Адаптивность — через `sm:`/`md:` breakpoint'ы.

**Tech Stack:** React 19, Tailwind CSS v4 (CSS-first), shadcn/ui (new-york), Tabler Icons

---

## Файлы для изменения

| Файл | Что меняется |
|------|-------------|
| `src/components/ui/card.tsx` | `rounded-xl` → `rounded-[22px]`, добавить `border-border` |
| `src/components/ui/select.tsx` | `rounded-md` → `rounded-2xl` в SelectTrigger |
| `src/components/Generate.tsx` | `rounded-[14px]` → `rounded-[22px]` на миниатюрах, `max-h` на Textarea |
| `src/components/Admin.tsx` | Убрать `sm:p-8` из секций, добавить `overflow-hidden` на обёртку DecoScatter, `bg-yellow-500` → `bg-[#ffd54a]` |
| `src/components/App.tsx` | Адаптивный header для мобильных |
| `src/components/Auth.tsx` | Добавить `font-display` к `<h1>` |
| `src/components/ui/textarea.tsx` | Добавить `max-h-60` |

---

### Task 1: UI-компоненты — единая шкала скруглений

**Файлы:**
- Modify: `src/components/ui/card.tsx:9`
- Modify: `src/components/ui/select.tsx:37`

- [ ] **Step 1: Исправить Card — скругление и border**

  `src/components/ui/card.tsx:9` заменить:
  ```diff
  - "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
  + "flex flex-col gap-6 rounded-[22px] border border-border bg-card py-6 text-card-foreground shadow-sm",
  ```

- [ ] **Step 2: Исправить SelectTrigger — скругление**

  `src/components/ui/select.tsx:37` в строке классов SelectTrigger заменить `rounded-md` на `rounded-2xl`:
  ```diff
  - "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm ...
  + "flex w-fit items-center justify-between gap-2 rounded-2xl border border-input bg-transparent px-3 py-2 text-sm ...
  ```

- [ ] **Step 3: Визуальная проверка**

  Запустить `bun dev`, открыть админку — проверить что селект пользователя и таблица ключей имеют одинаковое скругление с инпутами.

---

### Task 2: Галерея и лайтбокс — consistent border-radius

**Файлы:**
- Modify: `src/components/Generate.tsx:231,277,283`

- [ ] **Step 1: Привести миниатюры галереи к `rounded-[22px]`**

  `src/components/Generate.tsx:277` — кнопка-миниатюра:
  ```diff
  - className="group relative block aspect-square overflow-hidden rounded-[14px] border border-border/60 text-left ...
  + className="group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left ...
  ```

  `src/components/Generate.tsx:283` — img внутри миниатюры:
  ```diff
  - className="block h-full w-full rounded-[14px] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
  + className="block h-full w-full rounded-[22px] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
  ```

- [ ] **Step 2: Привести контейнер результата к `rounded-[22px]`**

  `src/components/Generate.tsx:231`:
  ```diff
  - <div className="group relative overflow-hidden rounded-[14px]">
  + <div className="group relative overflow-hidden rounded-[22px]">
  ```

- [ ] **Step 3: Визуальная проверка**

  Сгенерировать картинку, проверить что миниатюра и результат имеют одинаковое скругление. Открыть лайтбокс — `rounded-[22px]` на крупной картинке уже есть (строка 307), он совпадёт.

---

### Task 3: Админка — отступы, overflow, цвет

**Файлы:**
- Modify: `src/components/Admin.tsx:148,188,232,275-283`

- [ ] **Step 1: Убрать дублирующий padding из секций**

  `src/components/Admin.tsx:188`:
  ```diff
  - <section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:140ms] sm:p-8">
  + <section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:140ms]">
  ```

  `src/components/Admin.tsx:232`:
  ```diff
  - <section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:200ms] sm:p-8">
  + <section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:200ms]">
  ```

- [ ] **Step 2: Добавить overflow-hidden на обёртку DecoScatter**

  `src/components/Admin.tsx:148`:
  ```diff
  - <div className="relative mx-auto max-w-5xl">
  + <div className="relative mx-auto max-w-5xl overflow-hidden">
  ```

- [ ] **Step 3: Заменить жёлтый прогресс-бара на палитрный**

  `src/components/Admin.tsx:281`:
  ```diff
  - ? "bg-primary"
  - : k.hf_current / k.hf_base > 0.2
  -   ? "bg-yellow-500"
  -   : "bg-destructive"
  + ? "bg-primary"
  + : k.hf_current / k.hf_base > 0.2
  +   ? "bg-[#ffd54a]"
  +   : "bg-destructive"
  ```

- [ ] **Step 4: Визуальная проверка**

  Открыть админку, проверить что секции не имеют двойного padding. Прокрутить — декоративные элементы не выходят за пределы. Проверить что прогресс-бар того же оттенка жёлтого, что и бейдж кредитов.

---

### Task 4: Адаптивность — header, галерея, таблица

**Файлы:**
- Modify: `src/components/App.tsx:137`
- Modify: `src/components/Generate.tsx:269`
- Modify: `src/components/Admin.tsx:255`

- [ ] **Step 1: Header — предотвратить ломание на мобилке**

  `src/components/App.tsx:137` заменить:
  ```diff
  - <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
  + <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:flex-wrap sm:gap-4 sm:px-6 sm:py-4">
  ```

  Это уменьшит gap и padding на мобилке, предотвращая перенос элементов header'а.

- [ ] **Step 2: Галерея — адаптивная сетка**

  `src/components/Generate.tsx:269`:
  ```diff
  - <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
  + <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
  ```

  На мобилке 1 колонка с нормальными touch-target'ами, на планшетах — 2, на десктопе — 4.

- [ ] **Step 3: Admin-таблица — минимальная ширина**

  `src/components/Admin.tsx:255` — к `overflow-x-auto` добавить внутреннюю обёртку:
  ```diff
  - <div className="mt-8 overflow-x-auto">
  -   <Table>
  + <div className="mt-8 overflow-x-auto">
  +   <Table className="min-w-[640px]">
  ```

  Это задаст предсказуемый горизонтальный скролл на мобилке вместо обрезки колонок.

- [ ] **Step 4: Визуальная проверка**

  Уменьшить окно браузера до 375px — header не должен ломаться. Галерея — 1 колонка. Админ-таблица — горизонтальный скролл.

---

### Task 5: Auth и Textarea — font-display и ограничение роста

**Файлы:**
- Modify: `src/components/Auth.tsx:75`
- Modify: `src/components/ui/textarea.tsx:9`

- [ ] **Step 1: Добавить font-display к заголовку Auth**

  `src/components/Auth.tsx:75`:
  ```diff
  - <h1 className="font-display text-2xl font-bold text-foreground">
  + <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
  ```

  `font-display` уже есть в классе, добавляем `tracking-tight` для консистентности с другими заголовками (`Admin.tsx:122,153`).

- [ ] **Step 2: Ограничить рост Textarea**

  `src/components/ui/textarea.tsx:9` — добавить `max-h-60`:
  ```diff
  - "flex field-sizing-content min-h-16 w-full rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-base text-foreground outline-none",
  + "flex field-sizing-content min-h-16 max-h-60 w-full rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-base text-foreground outline-none",
  ```

  После 240px (max-h-60) textarea остановится и появится скролл.

- [ ] **Step 3: Визуальная проверка**

  На странице входа — заголовок «Вход»/«Регистрация» использует Bricolage Grotesque с `tracking-tight`. На странице генерации — ввести длинный промпт, textarea не должна раздуться больше ~240px.

---

## Порядок выполнения

Задачи независимы, можно делать в любом порядке. Рекомендуемая последовательность:

1. **Task 1** — закрывает корень проблемы (UI-компоненты)
2. **Task 2** — consistency на странице генерации
3. **Task 3** — admin-specific issues
4. **Task 4** — responsiveness
5. **Task 5** — polish

## Self-Review

- **Покрытие спеки:** Все 12 ошибок из ревизии покрыты. #12 (дубль #1) закрывается Task 1.
- **Плейсхолдеры:** Нет — весь код прописан явно.
- **Консистентность типов:** Все классы — Tailwind, все пути файлов — точные, все изменения — в пределах одного файла.
