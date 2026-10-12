# Дизайн-система «Раздув»: раскатка на реальные экраны (План 2 из 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести принятую основу «Раздув» (План 1: `src/lib/sheet/*`, `src/sheet.generated.css`, прототип) на все реальные экраны gen42 — вход, главную, галерею, лайтбокс, админку — так, чтобы любой элемент был окном в единый лист и отзывался импульсом, а видимого текста не прибавилось ни на одном экране.

**Architecture:** Стили листа — один файл `src/sheet.css` (слой `components`, чтобы утилиты Tailwind его перекрывали) поверх сгенерированных токенов. Окно в лист = элемент с `data-sheet` и дочерним `<i class="sheet-layer">`; примитивы shadcn (`button`, `tabs`, `input`, `textarea`, `input-group`, `slider`) получают это внутри себя, поэтому экраны меняются минимально. Динамика — только Web Animations из `src/lib/sheet/impulses.ts`; новые хуки (`useFlip`, `fieldFx`) и компоненты (`Sheet`, `Balance`, `ResultFrame`) лежат в `src/components/sheet/`. Проверка — статические тесты (текст, покрытие импульсами, CSS) и браузерный прогон `bun run ui:check` на собранном фронтенде с подставленным API.

**Tech Stack:** Bun (`bun test`, `Bun.build` + `bun-plugin-tailwind`, `Bun.Transpiler`), React 19, Tailwind v4, shadcn/ui (radix), Tabler, Web Animations API, Playwright (`playwright-core`).

**Spec:** `docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md` (разделы 3, 5, 8, 9 и «Уточнения при планировании»). План 1: `docs/superpowers/plans/2026-10-11-design-system-razdyv-foundation.md`.

## Global Constraints

- Bun вместо Node; одноразовые Python-скрипты только `uv run`; в `src/lib/**` нельзя `import … from "bun"`.
- Все правки UI — через скилл `shadcn` (канонические примитивы, `cn` из `@/lib/utils`, `gap-*` вместо `space-*`, `size-*`, иконки Tabler); самописных аналогов shadcn-компонентов не писать.
- **Ни одного нового видимого слова** (замечание владельца): ни слов, ни чисел, ни подписей, ни повторов существующего там, где его нет. Текст только убывает. Исключение: `aria-label`/`aria-valuetext` на русском у значков без текста — их можно и нужно добавлять. Тест-страж (Task 1) падает на любой новой строке.
- Фон: L ≤ 0,018; хребет (несёт белый текст) 0,178 ≤ L ≤ 0,1833; спектр без текста; цвета и яркости берутся из `src/sheet.generated.css`, своих градиентов у элементов нет.
- Анимировать только `transform`, `translate`, `scale`, `rotate`, `opacity`; нет `filter`, `backdrop-filter`, `mix-blend-mode`, теней и `@property`; везде 2D `translate(x,y)` (не `translate3d`); постоянного `requestAnimationFrame` нет; без событий ≤ 1 активная анимация (дрейф фона); `prefers-reduced-motion` отключает движение.
- Бюджет (из замеров прототипа): обработчик события ≤ 4 мс при замедлении ×4 (медиана из 5), слоёв композитора в покое ≤ 7, при ожидании ≤ 11.
- Рамки AGENTS.md: русский язык интерфейса без технических подробностей; без карточек-окошек (структура — типографика, отступы, тонкие линейки); поля с рамкой и скруглением 22 px; иконки Tabler, без эмодзи; поведение обновления страницы во время генерации (`localStorage`: `gen42-pending`, `gen42-result`, `gen42-mode`, `gen42-reasoning`) и контракты API не меняются.
- Каждый коммит: `git commit -m "<по-русски>" -m "$TRAILER"`, где `export TRAILER=$'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_013hZ8T6WPS3CEH12uHr6s3b'`. Перед коммитом: `bun run lint:fix && bun run lint && bun run typecheck && bun test`.
- Работа на ветке `claude/github-issue-17-w7b2eq`; в `main` не мержить; `captures/` в коммит не класть. PR открывается только после приёмки владельцем (стандартный шаг AGENTS.md), скриншоты до/после — через скилл `before-and-after`.

## Решения этого плана (отмечены, чтобы владелец мог их оспорить)

1. Шапка перестаёт быть `sticky`: на ней был `backdrop-blur` (запрещён), а залипание ломает выравнивание окон по листу. Шапка уходит со страницей при прокрутке.
2. Спиннеров нет (`PopSpinner` удаляется): загрузка — лист внутри элемента течёт быстрее (`data-loading`).
3. `QuotaBar` перестаёт менять цвет по порогам (жёлтый, красный): длина заливки спектра — единственный носитель значения; золота в системе нет.
4. Строки таблиц админки получают вход волной и скользящее наведение не сейчас: это отдельная задача после приёмки (в плане — только вход секций).
5. Логотип «gen42» без золотой искры.

## Структура файлов

**Создаются:** `src/sheet.css`; `src/lib/ui-text.ts`; `src/components/sheet/{Sheet,SheetLayer,Balance,ResultFrame,use-flip,use-field-fx}.tsx|ts`; `scripts/ui-text.ts`; `scripts/ui-check.ts`; тесты `src/lib/__tests__/{ui-text,ui-impulse-coverage,ui-css}.test.ts` и `ui-text.baseline.json`.

**Меняются:** `src/index.css`, `src/lib/sheet/impulses.ts`, `src/components/ui/{button,tabs,input,textarea,input-group,slider,dropdown-menu,select,badge,card,table}.tsx`, `src/components/{App,Auth,Generate,Admin,CodexAccess,ModelPicker,QuotaBar,graphics}.tsx`, `package.json`, `AGENTS.md`, `README.md`.

**Удаляются:** `src/components/{DecoScatter,PopWait,PopWaitArt,graphics-bg}.tsx`, из `graphics.tsx` — всё кроме `PopLogo`.

---

### Task 1: Эталон видимого текста и тест-страж «ни одного нового слова»

**Files:**
- Create: `src/lib/ui-text.ts`, `scripts/ui-text.ts`, `src/lib/__tests__/ui-text.test.ts`, `src/lib/__tests__/ui-text.baseline.json`
- Modify: `package.json` (скрипт `ui:text`)

**Interfaces:**
- Produces: `visibleStrings(source: string): string[]` — все русские строки, которые выводит компонент (текст JSX, строки в выражениях, шаблоны, `placeholder`, `title`), без `aria-*`; `collectUiText(dir: string): Promise<Record<string, string[]>>`.

Эталон снимается **до любой правки UI** — это единственная причина, по которой задача первая.

- [ ] **Step 1: Написать тест**

```ts
// src/lib/__tests__/ui-text.test.ts
import { describe, expect, test } from "bun:test";
import path from "node:path";
import { collectUiText, visibleStrings } from "../ui-text";

const COMPONENTS = path.join(import.meta.dir, "../../components");
const baseline: Record<string, string[]> = await Bun.file(
	path.join(import.meta.dir, "ui-text.baseline.json"),
).json();

describe("извлечение видимого текста", () => {
	test("берёт текст JSX, строки выражений и шаблоны, пропускает aria-*", () => {
		const src = `
export function X({ ok }: { ok: boolean }) {
	return (
		<div aria-label="Скрытая подпись" title="Подсказка">
			Привет, мир
			{ok ? "Да" : \`Нет \${1}\`}
			<input placeholder="Введите" aria-valuetext="Высокое" />
			<span>abc</span>
		</div>
	);
}`;
		expect(visibleStrings(src).sort()).toEqual(
			["Привет, мир", "Да", `Нет \${1}`, "Введите", "Подсказка"].sort(),
		);
	});
});

describe("ни одного нового слова", () => {
	test("в компонентах нет русских строк, которых не было в эталоне", async () => {
		const known = new Set(Object.values(baseline).flat());
		const now = await collectUiText(COMPONENTS);
		const added = Object.entries(now).flatMap(([file, strings]) =>
			strings.filter((s) => !known.has(s)).map((s) => `${file}: ${s}`),
		);
		expect(added).toEqual([]);
	});
});
```

- [ ] **Step 2: Реализация**

```ts
// src/lib/ui-text.ts
import { readdir } from "node:fs/promises";
import path from "node:path";

const transpiler = new Bun.Transpiler({
	loader: "tsx",
	tsconfig: JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }),
});

const CYRILLIC = /[А-Яа-яЁё]/;
/** Скрытые подписи для скринридера не считаются видимым текстом */
const ARIA = /"aria-[a-z-]+":\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")/g;
const LITERAL = /`((?:[^`\\]|\\.)*)`|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

/** Все русские строки, которые компонент может вывести на экран */
export function visibleStrings(source: string): string[] {
	const js = transpiler.transformSync(source).replace(ARIA, "");
	const found = new Set<string>();
	for (const m of js.matchAll(LITERAL)) {
		const text = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\s+/g, " ").trim();
		if (text && CYRILLIC.test(text)) found.add(text);
	}
	return [...found];
}

export async function collectUiText(dir: string): Promise<Record<string, string[]>> {
	const out: Record<string, string[]> = {};
	for (const name of (await readdir(dir, { recursive: true })).sort()) {
		if (!name.endsWith(".tsx")) continue;
		out[name] = visibleStrings(await Bun.file(path.join(dir, name)).text()).sort();
	}
	return out;
}
```

```ts
// scripts/ui-text.ts
import path from "node:path";
import { collectUiText } from "../src/lib/ui-text";

/** `bun scripts/ui-text.ts --write` снимает эталон видимого текста (делается один раз, до правок UI) */
const dir = path.resolve("src/components");
const text = await collectUiText(dir);
const target = path.resolve("src/lib/__tests__/ui-text.baseline.json");
if (process.argv.includes("--write")) {
	await Bun.write(target, `${JSON.stringify(text, null, "\t")}\n`);
	console.log(`эталон записан: ${Object.values(text).flat().length} строк в ${Object.keys(text).length} файлах`);
} else {
	console.log(JSON.stringify(text, null, 2));
}
```

В `package.json` → `scripts`: `"ui:text": "bun scripts/ui-text.ts"`.

- [ ] **Step 3: Снять эталон до правок и проверить**

```bash
git status --short src/components   # должно быть пусто
bun scripts/ui-text.ts --write
bun test src/lib/__tests__/ui-text.test.ts
```
Expected: «эталон записан: N строк…», оба теста PASS. Открыть `ui-text.baseline.json`, убедиться, что в нём «Промпт», «Недавние», «Быстрее», «Дольше, но продуманнее», «Сгенерировать за» (из `aria-label` последняя не попала бы, если бы шаблон был простым aria — она в тернарнике, поэтому есть).

- [ ] **Step 4: Коммит**

```bash
bun run lint:fix && bun run lint
git add src/lib/ui-text.ts scripts/ui-text.ts src/lib/__tests__/ui-text.test.ts src/lib/__tests__/ui-text.baseline.json package.json
git commit -m "Раздув: эталон видимого текста и тест-страж «ни одного нового слова»" -m "$TRAILER"
```

---

### Task 2: Стили листа, фон и среда исполнения в приложении

**Files:**
- Create: `src/sheet.css`, `src/components/sheet/Sheet.tsx`, `src/components/sheet/SheetLayer.tsx`
- Modify: `src/index.css` (подключения), `src/lib/sheet/impulses.ts` (фон-слой), `src/components/App.tsx` (фон и рантайм)

**Interfaces:**
- Produces: `<Sheet />` (фон, абсолютный на весь корень), `useSheetRuntime(): void` (запускает `startImpulses()`), `<SheetLayer />` (`<i class="sheet-layer" aria-hidden>`); классы `.sheet`, `.sheet-layer`, `[data-sheet="dark|ridge|spectrum|ring"]`, `.frame-flow`, `.logo`, `.caret-tail`, `.animate-pop-in` (пружинный вход).

Задача **аддитивна**: старые классы (`pop-*`, `drift-*`) пока остаются, чтобы приложение собиралось после каждого коммита; их удаляет Task 8.

- [ ] **Step 1: Стили листа** (перенос из `scripts/sheet-proto/proto.css`, в слое `components`)

```css
/* src/sheet.css
   Лист «Раздув». Токены — src/sheet.generated.css (bun run sheet:css).
   Правила в слое components: утилиты Tailwind (absolute, fixed…) должны их перекрывать. */
@layer components {
	/* Фон: тёмная полоса листа, один слой, дрейф ±40 px с периодом 90 с */
	.sheet {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		background: var(--sheet-dark);
		background-size: var(--sheet-tile) var(--sheet-tile);
	}

	.sheet > i {
		position: absolute;
		inset: -64px;
		background: var(--sheet-dark);
		background-size: var(--sheet-tile) var(--sheet-tile);
		background-position: 64px 64px;
		animation: sheet-drift 90s ease-in-out infinite alternate;
	}

	@keyframes sheet-drift {
		from {
			transform: translate(-40px, -40px);
		}
		to {
			transform: translate(40px, 40px);
		}
	}

	/* Окно в лист: дочерний слой с текстурой, выровненной по странице (--wx/--wy) */
	[data-sheet] {
		position: relative;
		overflow: hidden;
		isolation: isolate;
	}

	.sheet-layer {
		position: absolute;
		inset: -48px;
		z-index: -1;
		pointer-events: none;
		background-image: var(--sheet-ridge);
		background-size: var(--sheet-tile) var(--sheet-tile);
		background-position: calc(48px - var(--wx, 0px)) calc(48px - var(--wy, 0px));
		transition: translate var(--spring-light-ms) var(--spring-light);
	}

	[data-sheet="dark"] > .sheet-layer {
		background-image: var(--sheet-dark);
	}

	[data-sheet="spectrum"] > .sheet-layer {
		background-image: var(--sheet-spectrum);
	}

	/* наведение: лист в окне подтягивается к курсору */
	[data-sheet][data-impulse]:hover > .sheet-layer {
		translate: 10% 0;
	}

	/* загрузка: лист внутри течёт быстрее, спиннера нет */
	[data-loading="true"] > .sheet-layer {
		animation: sheet-flow 1.4s ease-in-out infinite alternate;
	}

	@keyframes sheet-flow {
		from {
			transform: translate(-8%, 0);
		}
		to {
			transform: translate(8%, 0);
		}
	}

	/* кольцо спектра по периметру: фокус поля, наведение на миниатюру */
	[data-sheet="ring"]::after {
		content: "";
		position: absolute;
		inset: 0;
		padding: 1px;
		border-radius: inherit;
		background-image: var(--sheet-spectrum);
		background-size: var(--sheet-tile) var(--sheet-tile);
		background-position: calc(0px - var(--wx, 0px)) calc(0px - var(--wy, 0px));
		-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
		-webkit-mask-composite: xor;
		mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--spring-medium-ms) var(--spring-medium);
	}

	[data-sheet="ring"]:focus-within::after,
	[data-sheet="ring"][data-impulse]:hover::after {
		opacity: 1;
	}

	/* рамка ожидания: поток спектра поверх картинки, сдёргивается занавесом */
	.frame-flow {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		opacity: 0;
		pointer-events: none;
		-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 64px), transparent);
		mask-image: linear-gradient(to right, #000 calc(100% - 64px), transparent);
		transition: opacity var(--spring-heavy-ms) var(--spring-heavy);
	}

	.frame-flow[data-on="true"] > .sheet-layer {
		animation: frame-drift 6s ease-in-out infinite alternate;
	}

	@keyframes frame-drift {
		from {
			transform: translate(-8%, 0);
		}
		to {
			transform: translate(8%, 0);
		}
	}

	/* «gen42»: слово залито листом */
	.logo {
		background-image: var(--sheet-spectrum);
		background-size: var(--sheet-tile) var(--sheet-tile);
		background-position: -20px -22px;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	/* хвост каретки: полоса спектра с мягкой маской, без плашки */
	.caret-tail {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 80;
		width: 48px;
		height: 3px;
		border-radius: 2px;
		background-image: var(--sheet-spectrum);
		background-size: var(--sheet-tile) var(--sheet-tile);
		-webkit-mask-image: linear-gradient(to left, #000, transparent);
		mask-image: linear-gradient(to left, #000, transparent);
		opacity: 0;
		pointer-events: none;
	}

	.caret-tail[data-dir="back"] {
		-webkit-mask-image: linear-gradient(to right, #000, transparent);
		mask-image: linear-gradient(to right, #000, transparent);
	}

	/* вход блока: пружина средней массы, только transform и opacity */
	.animate-pop-in {
		animation: sheet-enter var(--spring-medium-ms) var(--spring-medium) both;
	}

	@keyframes sheet-enter {
		from {
			opacity: 0;
			transform: translate(0, 10px);
		}
		to {
			opacity: 1;
			transform: translate(0, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet > i,
		.animate-pop-in,
		[data-loading="true"] > .sheet-layer,
		.frame-flow[data-on="true"] > .sheet-layer {
			animation: none;
		}

		.sheet-layer,
		.frame-flow,
		[data-sheet="ring"]::after {
			transition: none;
		}

		[data-sheet][data-impulse]:hover > .sheet-layer {
			translate: none;
		}
	}
}
```

Если у `src/lib/sheet/css.ts` в выводе нет `--spring-*`, брать их оттуда: они есть (`--spring-light/medium/heavy` и `-ms`).

- [ ] **Step 2: Подключить в `src/index.css`** — сразу после `@import "tailwindcss";` добавить

```css
@import "./sheet.generated.css";
@import "./sheet.css";
```

- [ ] **Step 3: Компоненты**

```tsx
// src/components/sheet/Sheet.tsx
import { useEffect } from "react";
import { startImpulses } from "@/lib/sheet/impulses";

/** Фон: тёмная полоса листа; абсолютный слой на весь корень экрана (прокручивается со страницей) */
export function Sheet() {
	return (
		<div data-slot="sheet" aria-hidden="true" className="sheet">
			<i />
		</div>
	);
}

/** Слушатели импульсов и реестр окон: один раз на приложение */
export function useSheetRuntime(): void {
	useEffect(() => startImpulses(), []);
}
```

```tsx
// src/components/sheet/SheetLayer.tsx
/** Слой текстуры листа внутри окна (`data-sheet`) */
export function SheetLayer() {
	return <i className="sheet-layer" aria-hidden="true" />;
}
```

- [ ] **Step 4: Слой фона в `impulses.ts` не должен устаревать** при перемонтировании `<Sheet />` (экраны загрузки, входа и главный — разные деревья). В `nudgeBackground` заменить

```ts
	backdrop ??= document.querySelector<HTMLElement>('[data-slot="sheet"] > i');
	const layer = backdrop;
```
на
```ts
	if (!backdrop?.isConnected) backdrop = document.querySelector<HTMLElement>('[data-slot="sheet"] > i');
	const layer = backdrop;
```

- [ ] **Step 5: `App.tsx`** — три корня (загрузка, вход, главный): заменить `pop-noise relative` + `<MeshBackground />` + `<DecoScatter />` на `relative isolate` + `<Sheet />`; в начало `App()` добавить `useSheetRuntime();`. Импорты: убрать `DecoScatter`, `MeshBackground`; добавить `import { Sheet, useSheetRuntime } from "./sheet/Sheet";`. У экрана входа (`Auth.tsx`) корень делается так же в Task 7. Остальное в `App` пока не трогать.

- [ ] **Step 6: Проверка**

```bash
bun run typecheck && bun run lint && bun test
bun run build.ts 2>&1 | tail -3
```
Expected: всё зелёное, сборка фронтенда проходит.

- [ ] **Step 7: Коммит**

```bash
git add src/sheet.css src/index.css src/components/sheet src/lib/sheet/impulses.ts src/components/App.tsx
git commit -m "Раздув: стили листа, фон и рантайм импульсов в приложении" -m "$TRAILER"
```

---

### Task 3: Браузерный прогон реального приложения (`bun run ui:check`)

**Files:**
- Create: `scripts/ui-check.ts`
- Modify: `package.json` (скрипт `ui:check`)

**Interfaces:**
- Produces: `bun run ui:check` — собирает фронтенд (`Bun.build` + `bun-plugin-tailwind`) в `captures/ui-check/site`, поднимает статический сервер, в Chromium подставляет API (`page.route('**/api/**')`), проходит сценарий, пишет скриншоты в `captures/ui-check/shots` и видео `captures/ui-check/demo.webm`, печатает таблицу бюджета и завершается кодом 1 при нарушении.

Скрипт нужен **до** правок экранов: каждая следующая задача прогоняет его и смотрит скриншоты.

- [ ] **Step 1: Реализация**

```ts
// scripts/ui-check.ts
import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import tailwind from "bun-plugin-tailwind";
import { type Browser, chromium, type Page } from "playwright-core";

/**
 * Прогон реального приложения без сервера и базы: фронтенд собирается как в
 * `build.ts`, API подставляется. Сценарий: вход → главная → печать → вкладки →
 * слайдер → генерация → занавес → лайтбокс → админка. Бюджет — как у прототипа.
 */
const OUT = process.env.UI_OUT ?? "captures/ui-check";
const SITE = path.join(OUT, "site");
const SHOTS = path.join(OUT, "shots");
const ROOT = path.resolve(SITE);
const COST_BUDGET_MS = 4;
const IDLE_LAYERS = 7;
const WAIT_LAYERS = 11;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const built = await Bun.build({
	entrypoints: ["index.html"],
	outdir: SITE,
	plugins: [tailwind],
	target: "browser",
	define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!built.success) {
	for (const log of built.logs) console.error(log);
	process.exit(1);
}

const server = Bun.serve({
	port: 0,
	async fetch(req) {
		const url = new URL(req.url);
		const full = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
		if (!full.startsWith(ROOT)) return new Response("not found", { status: 404 });
		const file = Bun.file(full);
		return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
	},
});

const ART =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='a' cx='30%' cy='30%'><stop offset='0' stop-color='#fde047'/><stop offset='1' stop-color='#1f2a44'/></radialGradient></defs><rect width='100' height='100' fill='url(#a)'/></svg>`,
	);
const REC = { id: "g1", status: "completed", image_url: ART, thumb_url: ART, prompt: "кот в короне", seed: 7, engine: "krea", cost: 1, duration: 5 };

/** Подставной API: ровно то, что читают экраны */
async function mockApi(page: Page, opts: { signedIn: boolean; waitMs?: number }) {
	await page.route("**/api/**", async (route) => {
		const url = new URL(route.request().url());
		const p = url.pathname;
		const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
		if (p === "/api/auth/get-session") return json(opts.signedIn ? { user: { id: "u1", email: "a@b.c", name: "A" } } : {});
		if (p === "/api/auth/sign-in/email") return json({ user: { id: "u1", email: "a@b.c" } });
		if (p === "/api/me") return json({ balance: 42, is_admin: true });
		if (p === "/api/models")
			return json([
				{ id: "krea", label: "Krea 2", cost: 1 },
				{ id: "ideogram", label: "Ideogram 4", cost: 3 },
				{ id: "turbo", label: "Турбо", cost: 10 },
			]);
		if (p === "/api/generations") return json(state.history);
		if (p === "/api/generations/active") return json({ error: "none" }, 404);
		if (p === "/api/generate") {
			await Bun.sleep(opts.waitMs ?? 2500);
			state.history = [REC];
			return json(REC);
		}
		if (p === "/api/admin/stats") return json({ users: 3, generations: 12, credits: 90 });
		if (p.startsWith("/api/admin/")) return json([]);
		return json({});
	});
}
const state: { history: unknown[] } = { history: [] };

const rows: Array<{ name: string; value: string; ok: boolean }> = [];
function check(name: string, value: number, ok: boolean, unit = ""): void {
	rows.push({ name, value: `${Math.round(value * 100) / 100}${unit}`, ok });
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const animations = (page: Page) => page.evaluate(() => document.getAnimations().length);
const rafCount = (page: Page) => page.evaluate(() => (window as unknown as { __raf: number }).__raf);

async function findChromium(): Promise<string> {
	for (const p of [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].filter(Boolean) as string[]) {
		if (await Bun.file(p).exists()) return p;
	}
	throw new Error("Chromium не найден: задайте CHROMIUM_PATH");
}

async function open(browser: Browser, o: { signedIn: boolean; video?: boolean; reduced?: boolean; hash?: string }) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 960 },
		reducedMotion: o.reduced ? "reduce" : "no-preference",
		...(o.video ? { recordVideo: { dir: path.join(OUT, "video"), size: { width: 1280, height: 960 } } } : {}),
	});
	const page = await context.newPage();
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
	await page.addInitScript(() => {
		const w = window as unknown as { __raf: number };
		w.__raf = 0;
		const original = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (cb: FrameRequestCallback) => {
			w.__raf++;
			return original(cb);
		};
	});
	await mockApi(page, { signedIn: o.signedIn });
	await page.goto(`http://localhost:${server.port}/${o.hash ?? ""}`);
	return { context, page };
}

const browser = await chromium.launch({ executablePath: await findChromium(), args: ["--no-sandbox"] });
try {
	// ── вход ────────────────────────────────────────────────────────────
	const auth = await open(browser, { signedIn: false });
	await auth.page.waitForSelector("form");
	await pause(auth.page, 900);
	await shot(auth.page, "01-auth");
	await auth.page.fill("#email", "a@b.c");
	await auth.page.fill("#password", "12345678");
	await pause(auth.page, 400);
	await shot(auth.page, "02-auth-filled");
	await auth.context.close();

	// ── главная, основной сценарий с видео ──────────────────────────────
	const { context, page } = await open(browser, { signedIn: true, video: true });
	const cdp = await context.newCDPSession(page);
	let layers = 0;
	cdp.on("LayerTree.layerTreeDidChange", (e: { layers?: unknown[] }) => {
		layers = e.layers?.length ?? layers;
	});
	await cdp.send("LayerTree.enable");
	await page.waitForSelector("#prompt");
	await pause(page, 1800);
	check("простой: активных анимаций (дрейф фона)", await animations(page), (await animations(page)) <= 1);
	const raf0 = await rafCount(page);
	await pause(page, 2000);
	check("простой: вызовов requestAnimationFrame за 2 с", (await rafCount(page)) - raf0, (await rafCount(page)) === raf0);
	check("простой: слоёв композитора", layers, layers <= IDLE_LAYERS);
	await shot(page, "03-main-idle");

	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
	const samples: number[] = [];
	for (let i = 0; i < 5; i++) {
		samples.push(
			await page.evaluate(() => {
				const el = document.querySelector("[data-slot=button][data-impulse]") ?? document.querySelector("button")!;
				const t0 = performance.now();
				el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }));
				const dt = performance.now() - t0;
				el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, isPrimary: true }));
				return dt;
			}),
		);
		await pause(page, 1300);
	}
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
	const cost = [...samples].sort((a, b) => a - b)[2]!;
	check("реакция на событие при замедлении ×4 (медиана из 5)", cost, cost <= COST_BUDGET_MS, " мс");
	await pause(page, 600);

	await page.click("#prompt");
	await page.keyboard.type("кот в короне едет на тракторе", { delay: 55 });
	await shot(page, "04-typing");
	for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
	await shot(page, "05-erasing");
	await pause(page, 900);

	await page.getByRole("tab", { name: "Турбо" }).click();
	await pause(page, 170);
	await shot(page, "06-tab-mid");
	await pause(page, 900);

	const slider = page.getByRole("slider");
	await slider.focus();
	for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
	await pause(page, 180);
	await shot(page, "07-slider-max");
	await pause(page, 900);
	await page.keyboard.press("Home");
	await pause(page, 700);

	await page.getByRole("tab", { name: "Изображение" }).click();
	await pause(page, 900);
	await page.getByRole("button", { name: /Сгенерировать/ }).click();
	await pause(page, 400);
	await shot(page, "08-frame-grows");
	await pause(page, 1500);
	check("ожидание: слоёв композитора", layers, layers <= WAIT_LAYERS);
	await shot(page, "09-waiting");
	await pause(page, 1200);
	await shot(page, "10-curtain");
	await pause(page, 1800);
	await shot(page, "11-done");

	await page.locator("section[aria-label=Недавние] button").first().click();
	await pause(page, 700);
	await shot(page, "12-lightbox");
	await page.keyboard.press("Escape");
	await pause(page, 400);

	const raf1 = await rafCount(page);
	await pause(page, 1000);
	check("после всего: вызовов requestAnimationFrame за 1 с", (await rafCount(page)) - raf1, (await rafCount(page)) === raf1);

	await page.goto(`http://localhost:${server.port}/#/admin`);
	await pause(page, 1400);
	await shot(page, "13-admin");

	const videoPath = await page.video()?.path();
	await context.close();
	if (videoPath) renameSync(videoPath, path.join(OUT, "demo.webm"));

	// ── reduced-motion ──────────────────────────────────────────────────
	const rm = await open(browser, { signedIn: true, reduced: true });
	await rm.page.waitForSelector("#prompt");
	await pause(rm.page, 900);
	check("reduced-motion: анимаций в покое", await animations(rm.page), (await animations(rm.page)) === 0);
	await rm.context.close();
} finally {
	await browser.close();
	server.stop(true);
	rmSync(path.join(OUT, "video"), { recursive: true, force: true });
}

for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.value}`);
console.log(`скриншоты: ${SHOTS}; видео: ${path.join(OUT, "demo.webm")}`);
if (rows.some((r) => !r.ok)) process.exit(1);
console.log("бюджет выдержан");
```

В `package.json` → `scripts`: `"ui:check": "bun scripts/ui-check.ts"`.

- [ ] **Step 2: Прогнать на текущем приложении** (старый вид, до правок экранов) и убедиться, что сам прогон работает

```bash
bun run typecheck && bun run lint:fix && bun run lint
bun run ui:check 2>&1 | tail -14
```
Expected: сценарий доходит до конца; скриншоты есть. Строки бюджета на старом экране могут быть `✗` (дрейф и декор старые) — это нормально, цель задачи — работающий прогон. Если падает шаг сценария (селектор, API-заглушка), исправить скрипт: он — часть плана. Просмотреть `01-auth`, `03-main-idle`, `13-admin` инструментом `Read`.

- [ ] **Step 3: Коммит**

```bash
git add scripts/ui-check.ts package.json
git commit -m "Раздув: браузерный прогон реального приложения с подставным API и замерами" -m "$TRAILER"
```

---

### Task 4: Примитивы shadcn — окна, импульсы, вкладки, слайдер

**Files:**
- Create: `src/components/sheet/use-flip.ts`, `src/components/sheet/use-field-fx.ts`
- Modify: `src/components/ui/{button,tabs,input,textarea,input-group,slider,dropdown-menu,select,badge,card}.tsx`

**Interfaces:**
- Consumes: `impulse`, `remeasure`, `springLinear`, `SPRINGS`, `caretOf`, `showTail`, `isEraseInput`, `<SheetLayer />`.
- Produces: `useFlip(ref, dep, { mass, origin })`; `fieldFx(el): () => void` и `useFieldFx<T>(external?)` (ref-колбэк); `Button` с пропом `weight?: number` (вес импульса); `TabsList` с подвижным индикатором; `Slider` с резинкой ручки и заливки.

Перед правкой загрузить скилл `shadcn` (правила проекта: канонические примитивы, композиция, `cn`).

- [ ] **Step 1: `use-flip.ts`**

```ts
// src/components/sheet/use-flip.ts
import { type RefObject, useLayoutEffect, useRef } from "react";
import { type Mass, SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";

interface Box {
	left: number;
	width: number;
}

/**
 * Элемент переехал или изменил длину (DOM уже новый): анимация «из старого
 * положения в новое» только через transform (FLIP) пружиной своей массы. Для
 * `origin: "left"` (заливка) масштабируется длина, для `"center"` (ручка) —
 * сдвиг с растяжением. Раскладка читается один раз в layout-эффекте, не в
 * обработчике события.
 */
export function useFlip(
	ref: RefObject<HTMLElement | null>,
	dep: unknown,
	options: { mass: Mass; origin: "left" | "center" },
): void {
	const prev = useRef<Box | null>(null);
	const { mass, origin } = options;
	// biome-ignore lint/correctness/useExhaustiveDependencies: перезапуск только по смене значения
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const now: Box = { left: r.left, width: r.width };
		const was = prev.current;
		prev.current = now;
		remeasure(el);
		if (!was || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const dx = origin === "left" ? was.left - now.left : was.left + was.width / 2 - (now.left + now.width / 2);
		const sx = now.width > 1 ? was.width / now.width : 1;
		if (Math.abs(dx) < 0.5 && Math.abs(sx - 1) < 0.01) return;
		el.style.transformOrigin = origin === "left" ? "0 50%" : "50% 50%";
		const stretch = origin === "center" ? 1 + Math.min(0.15, Math.abs(dx) / 120) : 1;
		const anim = el.animate(
			[
				{ transform: `translate(${dx}px,0) scaleX(${sx * stretch})` },
				{ transform: "translate(0,0) scaleX(1)" },
			],
			{ duration: SPRINGS[mass].move, easing: springLinear(mass) },
		);
		anim.onfinish = () => remeasure(el);
	}, [dep]);
}
```

- [ ] **Step 2: `use-field-fx.ts`**

```ts
// src/components/sheet/use-field-fx.ts
import type { Ref, RefCallback } from "react";
import { caretOf } from "@/lib/sheet/caret";
import { impulse } from "@/lib/sheet/impulses";
import { isEraseInput, showTail } from "@/lib/sheet/tail";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Поле отвечает на ввод: каждая буква — лёгкий импульс вперёд (стирание — назад)
 * не чаще раза в 140 мс, за кареткой тянется хвост листа; фокус — слабый импульс.
 */
export function fieldFx(el: Field): () => void {
	let last = 0;
	const onInput = (e: Event) => {
		const erase = isEraseInput((e as InputEvent).inputType);
		const point = caretOf(el);
		if (point) showTail(point, erase ? -1 : 1);
		const now = performance.now();
		if (now - last > 140) {
			last = now;
			impulse({ source: el, sign: erase ? -1 : 1, weight: 0.15, mass: "light" });
		}
	};
	const onFocus = () => impulse({ source: el, sign: 1, weight: 0.1, mass: "light" });
	el.addEventListener("input", onInput);
	el.addEventListener("focus", onFocus);
	return () => {
		el.removeEventListener("input", onInput);
		el.removeEventListener("focus", onFocus);
	};
}

/** Ref-колбэк для `input`/`textarea`; внешний ref пользователя сохраняется */
export function useFieldFx<T extends Field>(external?: Ref<T>): RefCallback<T> {
	return (el) => {
		const stop = el ? fieldFx(el) : undefined;
		let back: (() => void) | void;
		if (typeof external === "function") back = external(el);
		else if (external) (external as { current: T | null }).current = el;
		return () => {
			stop?.();
			if (typeof back === "function") back();
			else if (typeof external === "function") external(null);
			else if (external) (external as { current: T | null }).current = null;
		};
	};
}
```

Перед использованием проверить `caretOf` в `src/lib/sheet/caret.ts`: он должен возвращать `CaretPoint | null` и не бросать на `type="email"` (у него `selectionStart === null`). Если сигнатура другая — привести `fieldFx` к ней и дописать тест в `sheet-dom.test.ts` на `type="email"`.

- [ ] **Step 3: `Button`** — окна и импульс

В `src/components/ui/button.tsx`: у `variant` убрать тени и `hover:brightness`, привести к окнам:

```tsx
import { SheetLayer } from "@/components/sheet/SheetLayer";
// …
variant: {
	default:
		"text-white disabled:bg-secondary",
	destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
	outline: "border border-input text-muted-foreground hover:text-foreground",
	secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
	ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
	link: "text-primary underline-offset-4 hover:underline",
},
```

Компонент:

```tsx
const WINDOW: Partial<Record<NonNullable<VariantProps<typeof buttonVariants>["variant"]>, "ridge" | "dark">> = {
	default: "ridge",
	outline: "dark",
};

function Button({ className, variant = "default", size = "default", asChild = false, weight, children, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; /** Вес импульса по цене действия, 0..1 */ weight?: number }) {
	const Comp = asChild ? Slot.Root : "button";
	const sheet = !asChild ? WINDOW[variant ?? "default"] : undefined;
	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			data-impulse="tap"
			data-weight={weight ?? (variant === "default" ? 0.5 : 0.25)}
			{...(sheet ? { "data-sheet": sheet } : {})}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		>
			{sheet ? <SheetLayer /> : null}
			{children}
		</Comp>
	);
}
```

Из базовых классов `buttonVariants` убрать `active:scale-[0.98]` и `transition-all` (нажатие делает импульс; оставить `transition-colors`).

Если `asChild` со Slot получает несколько детей (слой + child), Slot упадёт: поэтому при `asChild` слой не добавляется (`sheet` пуст) и `children` — один элемент.

- [ ] **Step 4: `Tabs`** — подвижный индикатор-окно хребта

В `tabs.tsx` заменить `TabsList` и `TabsTrigger`:

```tsx
import { useEffect, useRef } from "react";
import { SheetLayer } from "@/components/sheet/SheetLayer";
import { SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";

function TabsList({ className, variant = "default", children, ...props }: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
	const listRef = useRef<HTMLDivElement>(null);
	const indRef = useRef<HTMLElement>(null);
	const at = useRef<{ x: number; w: number } | null>(null);

	useEffect(() => {
		const list = listRef.current;
		const ind = indRef.current;
		if (!list || !ind) return;
		const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
		function place(animate: boolean) {
			const tab = list?.querySelector<HTMLElement>('[data-state="active"]');
			if (!tab || !ind) return;
			const x = tab.offsetLeft;
			const w = tab.offsetWidth;
			const was = at.current;
			at.current = { x, w };
			ind.style.width = `${w}px`;
			ind.style.transform = `translate(${x}px,0)`;
			remeasure(ind);
			if (!animate || !was || reduced() || (was.x === x && was.w === w)) return;
			// резинка: индикатор растягивается на обе вкладки и сжимается к новой
			const span = (Math.abs(x - was.x) + Math.max(w, was.w)) / w;
			ind.animate(
				[
					{ transform: `translate(${was.x}px,0) scaleX(${was.w / w})` },
					{ transform: `translate(${Math.min(x, was.x)}px,0) scaleX(${span})`, offset: 0.45 },
					{ transform: `translate(${x}px,0) scaleX(1)` },
				],
				{ duration: SPRINGS.medium.move + 280, easing: springLinear("medium") },
			).onfinish = () => remeasure(ind);
		}
		place(false);
		const mo = new MutationObserver(() => place(true));
		mo.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
		const onResize = () => place(false);
		window.addEventListener("resize", onResize);
		return () => {
			mo.disconnect();
			window.removeEventListener("resize", onResize);
		};
	}, []);

	return (
		<TabsPrimitive.List
			ref={listRef}
			data-slot="tabs-list"
			data-variant={variant}
			className={cn(tabsListVariants({ variant }), "relative", className)}
			{...props}
		>
			{variant === "default" && (
				<i
					ref={indRef}
					data-sheet="ridge"
					aria-hidden="true"
					className="pointer-events-none absolute top-[3px] bottom-[3px] left-0 rounded-full"
					style={{ transformOrigin: "0 50%" }}
				>
					<SheetLayer />
				</i>
			)}
			{children}
		</TabsPrimitive.List>
	);
}
```

`tabsListVariants` default: `"bg-muted"` → `"border border-border bg-secondary/60"`. В `TabsTrigger`: убрать классы `data-[state=active]:bg-[image:var(--pop-gradient)]` и `…shadow-sm`; добавить `z-10`, `data-impulse="tap"`, `data-weight="0.4"` (до `{...props}`, чтобы экран мог переопределить), активный текст `data-[state=active]:text-white`; убрать `transition-all` → `transition-colors`.

- [ ] **Step 5: `Input`, `Textarea`, `InputGroup`** — отклик на ввод и кольцо

`input.tsx` и `textarea.tsx`:

```tsx
import { useFieldFx } from "@/components/sheet/use-field-fx";
function Input({ className, type, ref, ...props }: React.ComponentProps<"input">) {
	const fx = useFieldFx<HTMLInputElement>(ref);
	return <input ref={fx} type={type} data-slot="input" data-impulse="field" className={cn(/* прежние классы */, className)} {...props} />;
}
```
(так же `Textarea` с `HTMLTextAreaElement`). `useFieldFx` не хук с состоянием (возвращает новую функцию на каждый рендер — React 19 вызовет прежний cleanup и новый ref; это допустимо, подписки пересоздаются дёшево). Если на деле вызывает лишние импульсы, обернуть в `useCallback` с зависимостью `[external]`.

`input-group.tsx`, корень `InputGroup`: добавить `data-sheet="ring"`; убрать `shadow-xs`, фокус-кольцо `ring-[3px]` (его заменяет кольцо спектра) оставить только `border-ring` на фокусе.

- [ ] **Step 6: `Slider`** — резинка ручки и заливки, окна

`slider.tsx`: дорожка — тёмное окно, заливка — спектр, ручка — хребет. Внутри `Slider`:

```tsx
import { useRef } from "react";
import { SheetLayer } from "@/components/sheet/SheetLayer";
import { useFlip } from "@/components/sheet/use-flip";
import { impulse } from "@/lib/sheet/impulses";
import type { Mass } from "@/lib/sheet/springs";
// …
const thumbRef = useRef<HTMLSpanElement>(null);
const rangeRef = useRef<HTMLSpanElement>(null);
const level = _values[0] ?? min;
const last = (_values.length ? 1 : 0) && max - min || 1;
const index = (level - min) / (max - min || 1);
const mass: Mass = index <= 0 ? "light" : index >= 1 ? "heavy" : "medium";
useFlip(thumbRef, level, { mass, origin: "center" });
useFlip(rangeRef, level, { mass, origin: "left" });
const prevLevel = useRef(level);
useLayoutEffect(() => {
	if (prevLevel.current === level) return;
	impulse({ source: thumbRef.current ?? document.body, sign: level > prevLevel.current ? 1 : -1, weight: 0.2 + 0.4 * index, mass });
	prevLevel.current = level;
}, [level, index, mass]);
```
(убрать неиспользуемую `last`; `useLayoutEffect` импортировать из React). Разметка: `Track` — `data-sheet="dark"` + `<SheetLayer />` + `border border-border`, высота `h-2`; `Range` — `ref={rangeRef}`, `data-sheet="spectrum"` + `<SheetLayer />`, без `bg-primary`; `Thumb` — `ref={thumbRef}`, `data-sheet="ridge"` + `<SheetLayer />`, форма капсулы `h-[30px] w-[46px] rounded-full`, без `bg-white`, `shadow-sm`, `border-primary`, `ring-*`. Класс корня сохраняет `data-[disabled]:opacity-50`; на время генерации (`disabled`) слой замирает: `[data-disabled] .sheet-layer { animation: none }` не нужен — у ползунка нет бесконечных анимаций.

Radix-ползунок кладёт ручку во внешний `span` с `transform: var(--radix-slider-thumb-transform)`; этот `span` не трогаем, анимируется внутренний элемент ручки (`SliderPrimitive.Thumb` + `ref`), у которого собственного `transform` нет.

- [ ] **Step 7: Меню, выпадающие списки, значки, карточка — чистка**

`dropdown-menu.tsx`, `select.tsx`: убрать `shadow-*`, `backdrop-blur`; поверхность `bg-popover border border-border`; вход оставить на `data-[state=open]:animate-in`‑классах shadcn только если они — `transform/opacity` (проверить; иначе заменить на `.animate-pop-in`). `badge.tsx`: убрать `shadow`/`ring`. `card.tsx`: оставить файл (используется ли — проверить `grep -rn "ui/card"`; если нет — удалить, он противоречит «без карточек»).

- [ ] **Step 8: Проверка**

```bash
bun run typecheck && bun run lint:fix && bun run lint && bun test
bun run ui:check 2>&1 | tail -14
```
Expected: проходит; просмотреть `03-main-idle`, `06-tab-mid`, `07-slider-max`, `04-typing`: вкладки с подвижным окном, слайдер со спектральной заливкой, хвост за кареткой. Тест текста (`ui-text`) зелёный — новых слов нет.

- [ ] **Step 9: Коммит**

```bash
git add src/components/ui src/components/sheet
git commit -m "Раздув: примитивы shadcn стали окнами в лист с импульсами, резинкой вкладок и слайдера" -m "$TRAILER"
```

---

### Task 5: Баланс, рамка ожидания и логотип

**Files:**
- Create: `src/components/sheet/Balance.tsx`, `src/components/sheet/ResultFrame.tsx`
- Modify: `src/components/graphics.tsx` (`PopLogo`), `src/components/App.tsx` (шапка, меню)

**Interfaces:**
- Produces: `<Balance value={number} />` — плашка баланса (монета + число, смена числа прокруткой, импульс по знаку и размеру изменения); `<ResultFrame loading image className />` — рамка пропорций будущей картинки: ожидание ступенями, «занавес» при готовности; `PopLogo` — «gen42», залитое листом.

- [ ] **Step 1: `Balance.tsx`**

```tsx
// src/components/sheet/Balance.tsx
import { IconCoins } from "@tabler/icons-react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { impulse } from "@/lib/sheet/impulses";
import { springLinear } from "@/lib/sheet/springs";

/** Плашка баланса: смена числа — старое уходит, новое приходит с другой стороны, плашка отвечает импульсом */
export function Balance({ value }: { value: number }) {
	const pill = useRef<HTMLDivElement>(null);
	const box = useRef<HTMLSpanElement>(null);
	const cur = useRef<HTMLSpanElement>(null);
	const prev = useRef(value);

	useLayoutEffect(() => {
		const from = prev.current;
		prev.current = value;
		if (from === value || !pill.current || !box.current || !cur.current) return;
		const grew = value > from;
		impulse({ source: pill.current, sign: grew ? 1 : -1, weight: Math.min(1, Math.abs(value - from) / 42), mass: "light" });
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const dir = grew ? 1 : -1;
		const ghost = document.createElement("span");
		ghost.className = "absolute top-0 left-0";
		ghost.textContent = String(from);
		box.current.appendChild(ghost);
		ghost
			.animate(
				[
					{ transform: "translate(0,0)", opacity: 1 },
					{ transform: `translate(0,${-110 * dir}%)`, opacity: 0 },
				],
				{ duration: 360, easing: springLinear("light") },
			)
			.finished.then(() => ghost.remove(), () => ghost.remove());
		cur.current.animate(
			[
				{ transform: `translate(0,${110 * dir}%)`, opacity: 0 },
				{ transform: "translate(0,0)", opacity: 1 },
			],
			{ duration: 360, easing: "cubic-bezier(.3,.9,.3,1)" },
		);
	}, [value]);

	return (
		<div
			ref={pill}
			role="status"
			aria-label={`Баланс: ${value}`}
			className={cn("flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-sm tabular-nums", value > 0 ? "text-foreground" : "text-destructive")}
		>
			<IconCoins className="size-4 text-muted-foreground" strokeWidth={1.75} />
			<span ref={box} className="relative inline-block overflow-hidden">
				<span ref={cur} className="block">
					{value}
				</span>
			</span>
		</div>
	);
}
```

- [ ] **Step 2: `ResultFrame.tsx`**

```tsx
// src/components/sheet/ResultFrame.tsx
import { useEffect, useRef } from "react";
import { impulse } from "@/lib/sheet/impulses";
import { SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";
import { cn } from "@/lib/utils";
import { SheetLayer } from "./SheetLayer";

interface ResultFrameProps {
	loading: boolean;
	image: { url: string; alt: string } | null;
	className?: string;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Рамка будущей картинки. Ожидание — две ступени яркости потока спектра (запрос
 * отправлен → принят), затем дыхание; без слов и цифр. Готово — занавес
 * сдёргивается влево, картинка проявляется, волна уходит по странице («выдох»).
 */
export function ResultFrame({ loading, image, className }: ResultFrameProps) {
	const frame = useRef<HTMLDivElement>(null);
	const flow = useRef<HTMLElement>(null);
	const pic = useRef<HTMLImageElement>(null);
	const was = useRef(false);
	const breath = useRef<Animation | null>(null);
	const timer = useRef<number | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: реагируем на смену `loading`
	useEffect(() => {
		const fl = flow.current;
		const fr = frame.current;
		if (!fl || !fr) return;
		const clearTimer = () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = null;
		};
		if (loading) {
			was.current = true;
			remeasure(fr);
			fl.dataset.on = "true";
			fl.style.opacity = "0.25";
			timer.current = window.setTimeout(() => {
				fl.style.opacity = "0.4";
				impulse({ source: fr, sign: 1, weight: 0.3, mass: "heavy" });
				if (!reduced()) {
					breath.current = fl.animate([{ opacity: 0.4 }, { opacity: 0.55 }], {
						duration: 2000,
						direction: "alternate",
						iterations: Number.POSITIVE_INFINITY,
						easing: "ease-in-out",
					});
				}
			}, 800);
			return clearTimer;
		}
		clearTimer();
		breath.current?.cancel();
		breath.current = null;
		const finish = () => {
			fl.style.opacity = "0";
			fl.dataset.on = "false";
		};
		if (!was.current) {
			finish();
			return;
		}
		was.current = false;
		if (!image) {
			finish();
			return;
		}
		if (reduced()) {
			finish();
			impulse({ source: fr, sign: 1, weight: 1, mass: "heavy" });
			return;
		}
		pic.current?.animate([{ transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 700, easing: springLinear("heavy") });
		const curtain = fl.animate([{ transform: "translate(0,0)" }, { transform: "translate(-102%,0)" }], {
			duration: SPRINGS.heavy.move + 150,
			easing: springLinear("heavy"),
			fill: "forwards",
		});
		curtain.finished.then(
			() => {
				finish();
				curtain.cancel();
				impulse({ source: fr, sign: 1, weight: 1, mass: "heavy" });
			},
			() => finish(),
		);
		return clearTimer;
	}, [loading]);

	return (
		<div
			ref={frame}
			data-sheet="dark"
			role={image ? undefined : "img"}
			aria-label={image ? undefined : "Пустой холст"}
			className={cn("relative aspect-square w-full overflow-hidden rounded-[22px] border border-border", className)}
		>
			<SheetLayer />
			{image && <img ref={pic} src={image.url} alt={image.alt} className="absolute inset-0 block size-full object-cover" />}
			<i ref={flow} data-sheet="spectrum" aria-hidden="true" className="frame-flow">
				<SheetLayer />
			</i>
		</div>
	);
}
```

Строка «Пустой холст» и «Собираем кадр» уже есть в эталоне. Для готового изображения без `loading` (восстановление после обновления страницы) занавеса нет: `was.current` ложен — рамка сразу открыта.

- [ ] **Step 3: Логотип и шапка**

`graphics.tsx`: оставить только

```tsx
import { cn } from "@/lib/utils";

/** «gen42»: слово залито листом */
export function PopLogo({ className }: { className?: string }) {
	return <span className={cn("logo font-display text-2xl font-extrabold tracking-tight", className)}>gen42</span>;
}
```
(остальные экспорты `graphics.tsx` удалит Task 8 — пока оставить, чтобы не ломать импорты экранов; в этой задаче меняется только `PopLogo`). У `Auth.tsx` класс логотипа `[&_span]:text-5xl` продолжает работать (`PopLogo` — один `span`).

`App.tsx`: шапка — `<header className="border-b border-border/60">` (без `sticky`, `backdrop-blur`, `z-50`); блок баланса заменить на `<Balance value={balance} />` (оставить ветку скелета при `balance === null`, но скелет без `animate-pulse`: `h-8 w-16 rounded-full bg-secondary/60`); меню аккаунта: кнопка → `<Button variant="outline" size="icon" aria-label="Аккаунт" …>`, панель меню: `className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-60 rounded-[22px] border border-border bg-popover p-2"`; пункты меню получают `data-impulse="tap" data-weight="0.2"`. Импорт `IconCoins` в `App.tsx` убрать, если стал лишним.

- [ ] **Step 4: Проверка и коммит**

```bash
bun run typecheck && bun run lint:fix && bun run lint && bun test
bun run ui:check 2>&1 | tail -14
git add src/components
git commit -m "Раздув: баланс с прокруткой числа, рамка ожидания с занавесом, логотип из листа" -m "$TRAILER"
```
Expected: сборка и тесты зелёные; на `03-main-idle` логотип залит листом, шапка статична.

---

### Task 6: Экран генерации, галерея и лайтбокс

**Files:**
- Modify: `src/components/Generate.tsx`

**Interfaces:**
- Consumes: `ResultFrame`, `Button` (`weight`), `Tabs`, `Slider`, `InputGroup*`, `impulse`.

Логика загрузки, опроса, `localStorage` и вызовов API **не меняется**; правится только разметка и подключения. Слова: «Промпт» уходит в `aria-label`, «Недавние» остаётся только как `sr-only`-заголовок и `aria-label`, пара «Быстрее / Дольше, но продуманнее» и текст уровня справа от слайдера убираются (текст только убывает).

- [ ] **Step 1: Импорты** — убрать `EmptyCanvasArt`, `PopSpinner`, `SparkStar`, `StickerBurst`, `PopWait`, `Label`, `IconBrain`? (оставить: заголовок «Рассуждение» с иконкой — в эталоне есть), `IconSparkles` оставить; добавить `IconHistory`, `ResultFrame`, `impulse`, `useRef` уже есть.

- [ ] **Step 2: Форма**

Заменить блок от `<div className="flex flex-col gap-2">` (поле промпта) до конца блока `activeMode === "turbo"` на:

```tsx
<div className="flex flex-col gap-2">
	<InputGroup>
		<InputGroupTextarea
			id="prompt"
			aria-label="Промпт"
			value={prompt}
			onChange={(e) => setPrompt(e.target.value)}
			rows={4}
			maxLength={1000}
			className="min-h-36 text-lg leading-relaxed"
		/>
		<InputGroupAddon align="block-end" className={cn(activeMode === "image" ? "justify-between" : "justify-end")}>
			{activeMode === "image" && (
				<ModelPicker models={models} value={engine} onChange={setEngine} disabled={loading} />
			)}
			<span className="relative">
				<Button
					type="button"
					size="icon-lg"
					weight={Math.min(1, cost / 10)}
					data-loading={loading ? "true" : undefined}
					onClick={handleGenerate}
					disabled={loading || !prompt.trim() || outOfCredits}
					aria-label={outOfCredits ? "Нет кредитов для генерации" : `Сгенерировать за ${cost}`}
				>
					<IconSparkles data-icon="inline-start" />
				</Button>
				<span
					aria-hidden="true"
					className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground"
				>
					<IconCoins className="size-3" strokeWidth={2.5} />
					{cost}
				</span>
			</span>
		</InputGroupAddon>
	</InputGroup>
</div>

{activeMode === "turbo" && (
	<div className="animate-pop-in mt-6 flex flex-col gap-3">
		<div className="flex items-center gap-2">
			<IconBrain className="size-5 text-primary" />
			<span className="font-display text-lg font-bold text-foreground">Рассуждение</span>
		</div>
		<Slider
			min={0}
			max={TURBO_REASONING_LEVELS.length - 1}
			step={1}
			value={[TURBO_REASONING_LEVELS.indexOf(reasoning)]}
			onValueChange={changeReasoning}
			disabled={loading}
			aria-label="Уровень рассуждения"
			aria-valuetext={REASONING_LABELS[reasoning]}
		/>
	</div>
)}
```

`ModelPicker` получает кнопку-`outline` с окном (через примитив `Button`); при необходимости поправить ему классы (убрать `bg-card/70`).

Табы (`<Tabs>`): `className="mb-8 items-center"` оставить; у `TabsTrigger value="turbo"` добавить `data-weight="0.6"`.

- [ ] **Step 3: Ожидание, результат, пустой холст** — заменить блоки `{loading && …}`, `{!loading && !result && history.length === 0 && …}` и `{result && …}` на

```tsx
{(loading || result || history.length === 0) && (
	<div className="animate-pop-in mt-10">
		<ResultFrame
			loading={loading}
			image={result ? { url: result.image_url, alt: resultPrompt || prompt || "Сгенерированное изображение" } : null}
		/>
		{result && !loading && (
			<div className="mt-4 flex items-center justify-end gap-2">
				{result.seed !== null && result.seed !== undefined && (
					<Button type="button" variant="outline" size="sm" onClick={copySeed} title="Скопировать seed" aria-label={`Скопировать seed ${result.seed}`} className="tabular-nums">
						{seedCopied ? <IconCheck className="size-3.5 text-primary" /> : <IconCopy className="size-3.5" />}
						{result.seed}
					</Button>
				)}
				<Button variant="outline" size="sm" onClick={() => downloadImage(result.image_url, result.seed)}>
					<IconDownload className="size-4" />
					Скачать
				</Button>
			</div>
		)}
	</div>
)}
```

Эффект ошибки (после `useEffect` модели): ошибка — импульс назад:

```tsx
useEffect(() => {
	if (!error) return;
	const source = document.getElementById("prompt");
	if (source) impulse({ source, sign: -1, weight: 0.3, mass: "medium" });
}, [error]);
```

- [ ] **Step 4: Галерея и лайтбокс** — заголовок «Недавние»:

```tsx
<section className="mt-12" aria-label="Недавние">
	<div className="flex items-center gap-2 text-muted-foreground">
		<IconHistory className="size-5" />
		<h2 className="sr-only">Недавние</h2>
	</div>
	<div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
		{history.map((img, idx) => (
			<button
				key={img.id}
				type="button"
				data-sheet="ring"
				data-impulse="tap"
				data-weight="0.3"
				onClick={() => setSelected(idx)}
				title={img.prompt}
				aria-label={`Открыть изображение: ${img.prompt}`}
				className="group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left outline-none transition-[scale] duration-300 hover:scale-[1.02]"
			>
				<img src={img.thumb_url ?? img.image_url} alt="" loading="lazy" decoding="async" className="block size-full rounded-[22px] object-cover" />
			</button>
		))}
	</div>
</section>
```
Лайтбокс: `bg-background/90 backdrop-blur-md` → `bg-background/95`; круглые кнопки навигации и закрытия заменить на `<Button variant="outline" size="icon" … data-sheet выходит из Button>` с теми же `aria-label` и `onClick` (положение `absolute …` в `className`); `Скачать`/`Закрыть` уже `Button`. Входит `animate-pop-in` (теперь пружинный).

Если `transition-[scale]` + `hover:scale` противоречит правилу «transition только transform/opacity»: `scale` — допустимое свойство из списка (проверка `ui-css` в Task 8 разрешает `scale`).

- [ ] **Step 5: Проверка и коммит**

```bash
bun run typecheck && bun run lint:fix && bun run lint && bun test
bun run ui:check 2>&1 | tail -16
```
Expected: бюджет ✓; в `ui:check` просмотреть `03-main-idle`, `07-slider-max`, `08-frame-grows`, `09-waiting`, `10-curtain`, `11-done`, `12-lightbox`. Если шаг сценария не находит `getByRole("button", { name: /Сгенерировать/ })` — `aria-label` кнопки: «Сгенерировать за N», регулярка верна.

```bash
git add src/components/Generate.tsx
git commit -m "Раздув: экран генерации — рамка с занавесом, галерея-окна, лайтбокс без размытия" -m "$TRAILER"
```

---

### Task 7: Вход, регистрация, админка

**Files:**
- Modify: `src/components/Auth.tsx`, `src/components/Admin.tsx`, `src/components/CodexAccess.tsx`, `src/components/QuotaBar.tsx`, `src/components/App.tsx` (экран загрузки и ожидание роли)

- [ ] **Step 1: `Auth.tsx`**

- Корень: `<div className="relative isolate min-h-screen w-full overflow-hidden"><Sheet />`; убрать `DecoScatter`, `SparkStar`, `StickerSpiral`, `StickerRing`, `MeshBackground`, `PopSpinner`.
- Форма без карточки: `<div className="animate-pop-in w-full border-t border-border pt-8 [animation-delay:120ms]">` вместо `pop-card w-full p-8 …`.
- Каждое корректное поле вносит импульс в кнопку отправки: у `Input` на `onInput` — `if (e.currentTarget.validity.valid) impulse({ source: submitRef.current!, sign: 1, weight: 0.33, mass: "medium" })` (кнопка с `ref`).
- Кнопка отправки: `data-loading={loading ? "true" : undefined}`, без `PopSpinner`: при загрузке содержимое остаётся «Продолжить» + стрелка, кнопка `disabled`.
- Успех: перед `onLogin(data.user)` форма уходит влево — `formRef.current?.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(-24px,0)", opacity: 0 }], { duration: 260, easing: springLinear("medium"), fill: "forwards" }).finished` (дождаться, затем `onLogin`; при `reduced` без ожидания).
- Ошибка: `impulse({ source: submitRef.current, sign: -1, weight: 0.4 })` и дрожь формы ±6 px, затухающая: `formRef.current?.animate([{transform:"translate(0,0)"},{transform:"translate(-6px,0)"},{transform:"translate(5px,0)"},{transform:"translate(-3px,0)"},{transform:"translate(0,0)"}], { duration: 420, easing: "ease-out" })`.

- [ ] **Step 2: `App.tsx` — экран загрузки и ожидание роли**: центрированный тёмный капсульный индикатор без текста вместо спиннера:

```tsx
<div className="relative isolate flex min-h-screen w-full items-center justify-center">
	<Sheet />
	<div role="status" aria-label="Загрузка" data-sheet="ridge" data-loading="true" className="h-3 w-28 rounded-full">
		<i className="sheet-layer" aria-hidden="true" />
	</div>
</div>
```
Тот же капсульный индикатор (меньше: `h-2.5 w-20`) заменяет `PopSpinner` у ожидания роли (`aria-label="Загрузка"` сохраняется).

- [ ] **Step 3: `QuotaBar.tsx`** — длина заливки спектра, без цвета по порогам

```tsx
import { SheetLayer } from "@/components/sheet/SheetLayer";
import { cn } from "@/lib/utils";

/** Полоса остатка лимита: дорожка — тёмное окно, заливка — спектр до значения (scaleX) */
export function QuotaBar({ remaining, total, title, className }: { remaining: number; total: number; title: string; className?: string }) {
	const ratio = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
	return (
		<div data-sheet="dark" className={cn("h-2 rounded-full border border-border", className ?? "w-40")} title={title}>
			<SheetLayer />
			<div
				data-sheet="spectrum"
				className="h-full origin-left rounded-full transition-[transform] duration-500 ease-out"
				style={{ transform: `scaleX(${ratio})` }}
			>
				<SheetLayer />
			</div>
		</div>
	);
}
```
(длительность — из пружины: заменить `duration-500 ease-out` на `style` с `transitionTimingFunction: "var(--spring-medium)"`, `transitionDuration: "var(--spring-medium-ms)"`).

- [ ] **Step 4: `Admin.tsx`, `CodexAccess.tsx`** — убрать `DecoScatter`, `SparkStar` (в заголовке), заменить `PopSkeleton` на `<div className="h-32 rounded-[22px] border border-border bg-secondary/60" />` (без анимации), все секции: `pop-card mt-6 p-6` → `mt-6 border-t border-border pt-6`; `animate-pop-in` остаются (пружинный вход). Тексты и логика не меняются.

- [ ] **Step 5: Проверка и коммит**

```bash
bun run typecheck && bun run lint:fix && bun run lint && bun test
bun run ui:check 2>&1 | tail -16
git add src/components
git commit -m "Раздув: вход, админка и полосы квот на листе, без карточек и спиннеров" -m "$TRAILER"
```
Expected: бюджет ✓; просмотреть `01-auth`, `02-auth-filled`, `13-admin`.

---

### Task 8: Удаление старого оформления и тест-стражи

**Files:**
- Delete: `src/components/{DecoScatter,PopWait,PopWaitArt,graphics-bg}.tsx`
- Modify: `src/components/graphics.tsx` (оставить `PopLogo`), `src/index.css` (убрать старое), `src/components/ui/card.tsx` (удалить, если не используется)
- Create: `src/lib/__tests__/ui-impulse-coverage.test.ts`, `src/lib/__tests__/ui-css.test.ts`

- [ ] **Step 1: Удалить и проверить, что ссылок не осталось**

```bash
git rm src/components/DecoScatter.tsx src/components/PopWait.tsx src/components/PopWaitArt.tsx src/components/graphics-bg.tsx
grep -rn "DecoScatter\|PopWait\|graphics-bg\|MeshBackground\|PopSpinner\|PopSkeleton\|StickerBurst\|StickerSpiral\|StickerRing\|EmptyCanvasArt\|SparkStar\|pop-noise\|pop-card\|pop-gradient\|pop-mesh\|pop-lift\|pop-skeleton\|animate-float-slow\|animate-drift\|animate-pulse-deco\|animate-spin-slow\|animate-pop-spin" src
```
Expected: пусто, кроме `index.css` (его чистим далее). `graphics.tsx` свести к `PopLogo`.

- [ ] **Step 2: `src/index.css`** — удалить блоки `.pop-gradient-bg`, `.pop-gradient-text`, `.pop-mesh`, `.pop-noise::after` (содержит `feTurbulence`), `.pop-card`, `.pop-lift`, `.pop-skeleton`, все `@keyframes` кроме нужных (`pop-in` — удалить, его заменяет `sheet-enter` из `sheet.css`; `pop-shimmer`, `pop-spin`, `float-slow`, `drift-*`, `pulse-deco`, `spin-slow` — удалить), классы `animate-*` и `pop-wait-stroke`, из `prefers-reduced-motion` остаются только правила, ссылающиеся на существующие классы (блок можно удалить целиком: `sheet.css` содержит свои). Токен `--pop-gradient` и `--pop-sun` удалить, если на них нет ссылок (`grep -rn "pop-gradient\|pop-sun" src`); `--pop-indigo`, `--pop-fuchsia` оставить, пока используются (`::selection`).

- [ ] **Step 3: Тест CSS** (весь `src/**/*.css` подчиняется правилам системы)

```ts
// src/lib/__tests__/ui-css.test.ts
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import { ALLOWED_ANIMATED, animatedProperties, bannedTokens } from "../sheet/css-lint";

const SRC = path.join(import.meta.dir, "../..");
const files = [...new Glob("**/*.css").scanSync({ cwd: SRC })].filter((f) => !f.endsWith("sheet.generated.css"));

describe("CSS приложения", () => {
	test("найдены файлы", () => {
		expect(files).toContain("index.css");
		expect(files).toContain("sheet.css");
	});

	for (const file of files) {
		const css = Bun.file(path.join(SRC, file)).text();
		test(`${file}: анимируются только transform, translate, scale, rotate, opacity`, async () => {
			const bad = [...animatedProperties(await css)].filter((p) => !ALLOWED_ANIMATED.has(p));
			expect(bad).toEqual([]);
		});
		test(`${file}: нет filter, backdrop-filter, mix-blend-mode, @property, теней`, async () => {
			const text = await css;
			expect(bannedTokens(text)).toEqual([]);
			expect(text).not.toMatch(/(box|text)-shadow|drop-shadow|feTurbulence/);
		});
	}
});
```

- [ ] **Step 4: Тест покрытия импульсами** — в компонентах нет «голых» нажимаемых элементов

```ts
// src/lib/__tests__/ui-impulse-coverage.test.ts
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

const COMPONENTS = path.join(import.meta.dir, "../../components");
const transpiler = new Bun.Transpiler({ loader: "tsx", tsconfig: JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }) });
const NATIVE = ["button", "a"];

/** Тела props у вызовов jsx("button", {…}) в транспилированном коде */
function propsOf(js: string, tag: string): string[] {
	const out: string[] = [];
	const re = new RegExp(`jsxDEV?s?\\("${tag}",\\s*\\{`, "g");
	for (const m of js.matchAll(re)) {
		let depth = 1;
		let i = (m.index ?? 0) + m[0].length;
		const start = i;
		for (; i < js.length && depth > 0; i++) {
			if (js[i] === "{") depth++;
			else if (js[i] === "}") depth--;
		}
		out.push(js.slice(start, i - 1));
	}
	return out;
}

describe("покрытие импульсами", () => {
	test("у каждого нативного button/a экранов есть data-impulse", async () => {
		const bare: string[] = [];
		for (const name of await readdir(COMPONENTS, { recursive: true })) {
			if (!name.endsWith(".tsx") || name.startsWith("ui/")) continue; // примитивы shadcn проверяются ниже
			const js = transpiler.transformSync(await Bun.file(path.join(COMPONENTS, name)).text());
			for (const tag of NATIVE) {
				for (const props of propsOf(js, tag)) {
					if (/href:|onClick|type:\s*"button"|role:/.test(props) && !props.includes("data-impulse")) bare.push(`${name}: <${tag}>`);
				}
			}
		}
		expect(bare).toEqual([]);
	});

	test("примитивы shadcn с нажатием несут data-impulse", async () => {
		const required = ["button.tsx", "tabs.tsx", "input.tsx", "textarea.tsx"];
		for (const f of required) {
			const src = await Bun.file(path.join(COMPONENTS, "ui", f)).text();
			expect(src).toContain("data-impulse");
		}
	});
});
```
Если тест находит голый элемент — добавить ему `data-impulse="tap" data-weight="0.2"` (или заменить на `Button`), а не ослаблять тест.

- [ ] **Step 5: Проверка и коммит**

```bash
bun run typecheck && bun run lint:fix && bun run lint && bun test
bun run build.ts 2>&1 | tail -3
bun run ui:check 2>&1 | tail -16
git add -A src
git commit -m "Раздув: удалено старое оформление, добавлены стражи CSS и покрытия импульсами" -m "$TRAILER"
```

---

### Task 9: Документы, финальная проверка и приёмка

**Files:**
- Modify: `AGENTS.md` («Стиль UI»), `README.md`, `docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md` (уточнения по итогам раскатки)

- [ ] **Step 1: `AGENTS.md`** — в разделе «Стиль UI» заменить пункты про декоративную графику, ожидание, слайдер и дизайн-систему:

- «Декоративная графика — своя SVG: `graphics.tsx` … `PopWaitArt.tsx`» → «Оформление — система «Раздув» (`docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md`): весь интерфейс — один непрерывный лист (`src/sheet.generated.css`, генерируется `bun run sheet:css` из `src/lib/sheet/*`), каждый элемент — окно в него (`data-sheet` + дочерний `.sheet-layer`), действие — импульс (`src/lib/sheet/impulses.ts`, `data-impulse`, `data-weight`). Отдельных декоративных объектов (наклейки, звёзды, россыпи, блёстки, частицы) нет; новый элемент выводится четырьмя вопросами из спецификации.»
- пункт про ожидание: «ожидание для всех движков — рамка пропорций картинки (`ResultFrame`): поток спектра в две ступени яркости, дыхание, без единой буквы и цифры; по готовности «занавес» сдёргивается; `localStorage` `gen42-pending`/`gen42-result` как прежде».
- пункт про слайдер: «слайдер «Рассуждение»: заголовок и слайдер, без подписей уровней; уровень читается по положению и массе ручки (пружина), текстовое значение только в `aria-valuetext`».
- «Дизайн-система: тёмная pop-палитра…» → описание палитры листа: фон L ≤ 0,018 (индиго → фиолетовый), хребет (кнопки, активная вкладка) 0,178–0,1833, спектр без текста; цвета нигде не задаются вручную.
- новое правило: «Видимого текста не добавлять никогда: тест `ui-text.test.ts` сверяет строки с эталоном `ui-text.baseline.json`; эталон меняется только в сторону уменьшения (`bun run ui:text -- --write`) и только по решению владельца».
- команды: `bun run sheet:css`, `bun run sheet:proto`, `bun run ui:check`, `bun run ui:text`.
- «Проверка»: UI проверять `bun run ui:check` (подставной API) и на живом домене.

`README.md`: убрать упоминания блёсток/декора, добавить абзац про систему и команды.

- [ ] **Step 2: Итоговая проверка**

```bash
bun run lint && bun run typecheck && bun test
bun run build 2>&1 | tail -5
bun run ui:check 2>&1 | tail -16
```
Expected: всё зелёное; `ui:check` — «бюджет выдержан». Просмотреть все 13 скриншотов `captures/ui-check/shots/` инструментом `Read`; сверить со спецификацией разделы 3 и 5; проверить глазами: фон одного семейства оттенков, нет радужной плёнки, активная кнопка заметна, текста не прибавилось.

- [ ] **Step 3: Коммит документов**

```bash
git add AGENTS.md README.md docs
git commit -m "Раздув: документация системы и правило «ни одного нового слова»" -m "$TRAILER"
git push -u origin claude/github-issue-17-w7b2eq
```

- [ ] **Step 4: Показать владельцу** — отправить `captures/ui-check/demo.webm` и ключевые скриншоты (`03-main-idle`, `04-typing`, `07-slider-max`, `10-curtain`, `12-lightbox`, `01-auth`, `13-admin`) через `SendUserFile`, приложить таблицу бюджета. **Дальше (PR) не идти, пока владелец не ответит.** После «принято»: открыть PR на `main` (стандартный шаг AGENTS.md; шаблон PR из репозитория; скриншоты до/после — скиллом `before-and-after`; в описании без запуска линтера и тестов), следить за CI до зелёного, мерж только с разрешения владельца.

---

## Self-Review

**Покрытие спецификации.** Раздел 3 (меньше текста): «Промпт», «Недавние», подписи слайдера — Task 6; значения баланса и цены — Tasks 5–6; админка — Task 7; тест текста — Task 1. Раздел 5: фон (Task 2), кнопка/поле/печать/вкладки/слайдер/меню (Task 4), ожидание/готовая картинка/галерея/лайтбокс (Tasks 5–6), вход (Task 7), баланс (Task 5), пустые состояния (Task 5–6 `ResultFrame` в пустом виде). Раздел 8: тесты 7, 12, 13 (Tasks 1, 8), замеры 9–11 (`ui:check`), токены 1–6 покрыты Планом 1. Не покрыто сознательно (см. «Решения»): вход строк таблицы волной, скользящее наведение в таблицах, вспышка «42» на пике (нужен знак «42» в логотипе, которого в приложении нет), восстановление ступени ожидания после обновления (у сервера нет стадий).

**Плейсхолдеры.** Нет «TODO/позже»; места, где реальный код зависит от текущих файлов (`caretOf` для `email`, использование `Card`, `transition-[scale]`) снабжены командой проверки и действием на оба исхода.

**Согласованность имён.** `useFlip(ref, dep, { mass, origin })`, `fieldFx`, `useFieldFx`, `Balance`, `ResultFrame`, `Sheet`, `useSheetRuntime`, `SheetLayer`, `Button.weight`, `data-impulse`, `data-weight`, `data-sheet`, `data-loading`, `.frame-flow`, `.sheet-layer` используются одинаково во всех задачах.
