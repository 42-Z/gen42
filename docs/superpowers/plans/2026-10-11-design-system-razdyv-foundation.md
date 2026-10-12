# Дизайн-система «Раздув»: основа и живой прототип (План 1 из 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить ядро дизайн-системы «Раздув» (палитра листа, пружины, волна импульса, окна листа, хвост каретки) и автономный живой прототип с видео и замерами, который владелец принимает до переноса системы на реальные экраны.

**Architecture:** Чистые модули `src/lib/sheet/` (палитра в линейном RGB, пружины в `linear()`, планировщик волны) тестируются `bun test`; CSS-токены генерируются из них скриптом, чтобы числа не расходились. DOM-слой ставит на элементы `data-sheet` (окно в лист: слой с текстурой листа, выровненный по координатам страницы) и `data-impulse` (источник импульса), а анимирует только `transform`/`translate`/`scale`/`opacity` через Web Animations без постоянного цикла. Прототип собирает всё на одной странице и доказывает идею во времени.

**Tech Stack:** Bun (`bun test`, HTML-сборка `Bun.build`), TypeScript, CSS (`linear-gradient`, `linear()`, individual transforms), Web Animations API, Playwright (`playwright-core`, только для замеров и видео).

**Spec:** `docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md`

**Что дальше:** после приёмки прототипа владельцем пишется План 2: перенос системы в `src/index.css`, примитивы shadcn, экраны (вход, главная, админка), удаление старого декора, текстовая диета, тест-стражи покрытия, обновление `AGENTS.md` и `README.md`.

## Global Constraints

- Bun вместо Node: `bun test`, `bun run <script>`, `bunx`. Одноразовые Python-скрипты — только `uv run`.
- Форматирование — biome (табы). Перед каждым коммитом: `bun run lint:fix`, затем `bun run lint` и `bun run typecheck` без замечаний.
- Каждый коммит: `git commit -m "<сообщение по-русски>" -m "$TRAILER"`, где в сессии один раз задано
  `export TRAILER=$'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_013hZ8T6WPS3CEH12uHr6s3b'`.
- Работа на ветке `claude/github-issue-17-w7b2eq`, в `main` не мержить; артефакты прогонов (`captures/`) в коммит не класть (каталог в `.gitignore`).
- Фон: относительная яркость **L ≤ 0,018** в любой точке; хребет (всё, что несёт белый текст) **0,178 ≤ L ≤ 0,1833**, белый текст на нём ≥ 4,5:1, хребет к фону ≥ 3,3:1; спектр 0,178 ≤ L ≤ 0,32 и только без текста.
- Опорные цвета листа: S0 `#6c5cff`, S1 `#8a57e8`, S2 `#a252cd`, S3 `#b54cad`, S4 `#c74682`, S5 `#ff5ca8` (только спектр). Текст `#f2efff`, вторичный `#a79fcb`, ошибка `#ff6b81`. Золота, жёлтого, персика нет.
- Анимировать можно только `transform`, `translate`, `scale`, `opacity`. Запрещены `filter`, `backdrop-filter`, `mix-blend-mode`, анимация теней, `width/height/left/top`, `background-position`, `clip-path`, `@property`-градиенты (в `@keyframes` и `transition`).
- Движение: перелёт пружин ≤ 4%, задержка волны ≤ 280 мс (1 мс на 2,5 px), затухание ÷ (1 + d/400 px), нарастание ≤ 120 мс, спад 600–1200 мс; три массы пружин (лёгкая, средняя, тяжёлая) в CSS `linear()`.
- Постоянного `requestAnimationFrame` нет; без событий активных анимаций не больше одной (дрейф фона, период 90 с, амплитуда ±40 px); при `prefers-reduced-motion: reduce` пружины, волна, дрейф отключены (остаётся `opacity` ≤ 150 мс).
- Слоёв композитора в покое ≤ 6, во время ожидания ≤ 10; обработка события ≤ 1 мс при замедлении процессора ×4.
- Нового текста по сравнению с текущим приложением не добавляется нигде (названия моделей, подписи и подсказки уходят в `aria-label`). Текст в прототипе только там, где его нельзя заменить знаком (логотип «gen42», «Изображение», «Турбо», «Рассуждение»); цена — монета и число без слова «кредитов»; у значков без текста есть `aria-label` на русском.
- Нельзя `import … from "bun"` в `src/lib/**`.

---

## Структура файлов

**Создаются:**

| Файл | Ответственность |
|---|---|
| `src/lib/sheet/palette.ts` | Опорные цвета, `ridge/spectrum/dark(p)` в линейном RGB, яркость и контраст, палиндромная фаза листа |
| `src/lib/sheet/springs.ts` | Три массы пружин, отклик ступени, строка CSS `linear()`, перелёт |
| `src/lib/sheet/wave.ts` | Планировщик волны: задержка и амплитуда по расстоянию, вес по цене |
| `src/lib/sheet/css.ts` | Градиент листа для роли, сборка `src/sheet.generated.css` |
| `src/lib/sheet/windows.ts` | Реестр окон `data-sheet`: измерение положения на странице, наблюдатели |
| `src/lib/sheet/impulses.ts` | Импульс (Web Animations), глобальные слушатели `data-impulse`, нажатие и отпускание |
| `src/lib/sheet/caret.ts` | Положение каретки в `textarea`/`input` |
| `src/lib/sheet/tail.ts` | Хвост листа за кареткой |
| `scripts/gen-sheet-css.ts` | Запись `src/sheet.generated.css` |
| `src/sheet.generated.css` | Токены листа и пружин (генерируется, коммитится) |
| `scripts/sheet-proto/index.html`, `proto.css`, `proto.ts` | Автономная демонстрационная страница |
| `scripts/sheet-proto.ts` | Сборка, сервер, сценарий с видео, замеры, скриншоты |
| `src/lib/__tests__/sheet-*.test.ts` | Тесты модулей и CSS |

**Меняются:** `package.json` (скрипты и dev-зависимость `playwright-core`).

---

### Task 1: Палитра листа

**Files:**
- Create: `src/lib/sheet/palette.ts`
- Test: `src/lib/__tests__/sheet-palette.test.ts`

**Interfaces:**
- Produces: `type RGB = readonly [number, number, number]`; `BASE: RGB` (`#0d0b1e`); `STOPS` (`S0..S5`); `TEXT`, `TEXT_2`, `ERROR: RGB`; `toLinear(c: number): number`; `fromLinear(v: number): number`; `relLuminance(rgb: RGB): number`; `contrast(l1: number, l2: number): number`; `mix(a: RGB, b: RGB, t: number): RGB` (в линейном RGB); `ridge(p: number): RGB`, `spectrum(p: number): RGB`, `dark(p: number): RGB`, `DARK_MIX = 0.075`; `type Role = "dark" | "ridge" | "spectrum"`; `color(role: Role, p: number): RGB`; `round(rgb: RGB): RGB`; `rgbString(rgb: RGB): string` (`rgb(r g b)` с округлением); `phase(t: number): number` (палиндром с периодом 0,5: `phase(0)=0`, `phase(0.25)=1`).

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/sheet-palette.test.ts
import { describe, expect, test } from "bun:test";
import {
	BASE,
	color,
	contrast,
	DARK_MIX,
	dark,
	ERROR,
	mix,
	phase,
	relLuminance,
	ridge,
	round,
	rgbString,
	spectrum,
	STOPS,
	TEXT,
	TEXT_2,
} from "../sheet/palette";

const DENSE = Array.from({ length: 101 }, (_, i) => i / 100);
const SPARSE = Array.from({ length: 17 }, (_, i) => i / 16);
const lum = (rgb: readonly [number, number, number]) => relLuminance(round(rgb));

describe("опорные цвета", () => {
	test("яркости опор: хребет около 0,18, фуксия 0,317", () => {
		const expected = { S0: 0.1806, S1: 0.1805, S2: 0.1812, S3: 0.1801, S4: 0.1813, S5: 0.3174 };
		for (const [key, value] of Object.entries(expected)) {
			expect(relLuminance(STOPS[key as keyof typeof STOPS])).toBeCloseTo(value, 3);
		}
	});

	test("белый на фуксии не проходит 4,5:1 (поэтому она только без текста)", () => {
		expect(contrast(1, relLuminance(STOPS.S5))).toBeLessThan(3);
	});
});

describe("роли яркости", () => {
	test("хребет: 0,178 ≤ L ≤ 0,1833 и белый текст ≥ 4,5:1 в каждой точке", () => {
		for (const p of DENSE) {
			const l = lum(ridge(p));
			expect(l).toBeGreaterThanOrEqual(0.178);
			expect(l).toBeLessThanOrEqual(0.1833);
			expect(contrast(1, l)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("фон: L ≤ 0,018 в каждой точке", () => {
		for (const p of DENSE) expect(lum(dark(p))).toBeLessThanOrEqual(0.018);
	});

	test("хребет к фону ≥ 3,3:1 в любой паре точек", () => {
		for (const p of SPARSE) {
			for (const q of SPARSE) {
				expect(contrast(lum(ridge(p)), lum(dark(q)))).toBeGreaterThanOrEqual(3.3);
			}
		}
	});

	test("самый тёмный цвет кнопки отличается от самого светлого места фона не менее чем в 3 раза", () => {
		let maxDark = 0;
		for (const p of DENSE) maxDark = Math.max(maxDark, lum(dark(p)));
		expect(contrast(relLuminance(STOPS.S0), maxDark)).toBeGreaterThanOrEqual(3);
	});

	test("спектр: 0,178 ≤ L ≤ 0,32", () => {
		for (const p of DENSE) {
			const l = lum(spectrum(p));
			expect(l).toBeGreaterThanOrEqual(0.178);
			expect(l).toBeLessThanOrEqual(0.32);
		}
	});

	test("фон — смесь хребта с базой в линейном RGB", () => {
		expect(DARK_MIX).toBe(0.075);
		expect(dark(0)).toEqual(mix(BASE, ridge(0), DARK_MIX));
		expect(color("ridge", 0.3)).toEqual(ridge(0.3));
		expect(color("spectrum", 1)).toEqual(spectrum(1));
		expect(color("dark", 0.5)).toEqual(dark(0.5));
	});
});

describe("текст", () => {
	const bgL = 0.018;
	test("основной ≥ 12:1, вторичный и ошибка ≥ 4,5:1 к самому светлому фону", () => {
		expect(contrast(relLuminance(TEXT), bgL)).toBeGreaterThanOrEqual(12);
		expect(contrast(relLuminance(TEXT_2), bgL)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(relLuminance(ERROR), bgL)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("фаза листа", () => {
	test("палиндром с периодом 0,5", () => {
		expect(phase(0)).toBe(0);
		expect(phase(0.25)).toBe(1);
		expect(phase(0.5)).toBe(0);
		expect(phase(0.75)).toBe(1);
		expect(phase(1)).toBe(0);
		for (const t of [0.05, 0.13, 0.31, 0.44]) {
			expect(phase(t + 0.5)).toBeCloseTo(phase(t), 10);
		}
	});
});

describe("rgbString", () => {
	test("округляет в целые", () => {
		expect(rgbString([108.4, 91.6, 255])).toBe("rgb(108 92 255)");
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/sheet-palette.test.ts`
Expected: FAIL (`Cannot find module '../sheet/palette'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/sheet/palette.ts
/**
 * Палитра листа. Цвет есть положение: `p` ∈ [0, 1] по пути индиго → фуксия.
 * Яркость назначает роль, а не положение: опоры хребта подобраны на одной
 * относительной яркости (≈ 0,18), интерполяция идёт в линейном RGB, где яркость
 * линейна, поэтому между опорами она не плывёт.
 */
export type RGB = readonly [number, number, number];

export const BASE: RGB = [13, 11, 30]; // #0d0b1e

export const STOPS = {
	S0: [108, 92, 255], // #6c5cff
	S1: [138, 87, 232], // #8a57e8
	S2: [162, 82, 205], // #a252cd
	S3: [181, 76, 173], // #b54cad
	S4: [199, 70, 130], // #c74682
	S5: [255, 92, 168], // #ff5ca8, только спектр (без текста)
} as const satisfies Record<string, RGB>;

export const TEXT: RGB = [242, 239, 255]; // #f2efff
export const TEXT_2: RGB = [167, 159, 203]; // #a79fcb
export const ERROR: RGB = [255, 107, 129]; // #ff6b81

const RIDGE_STOPS: readonly RGB[] = [STOPS.S0, STOPS.S1, STOPS.S2, STOPS.S3, STOPS.S4];
const SPECTRUM_STOPS: readonly RGB[] = [...RIDGE_STOPS, STOPS.S5];

export function toLinear(c: number): number {
	const v = c / 255;
	return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function fromLinear(v: number): number {
	const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
	return c * 255;
}

/** Относительная яркость по WCAG */
export function relLuminance(rgb: RGB): number {
	return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

/** Контраст двух яркостей по WCAG */
export function contrast(l1: number, l2: number): number {
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Смешивание в линейном RGB: t = 0 — `a`, t = 1 — `b` */
export function mix(a: RGB, b: RGB, t: number): RGB {
	const channel = (i: 0 | 1 | 2) => fromLinear(toLinear(a[i]) * (1 - t) + toLinear(b[i]) * t);
	return [channel(0), channel(1), channel(2)];
}

function along(stops: readonly RGB[], p: number): RGB {
	const x = Math.min(1, Math.max(0, p)) * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(x));
	return mix(stops[i]!, stops[i + 1]!, x - i);
}

/** Хребет: всё, что несёт белый текст (L ≈ 0,18) */
export const ridge = (p: number): RGB => along(RIDGE_STOPS, p);

/** Спектр: хребет с продолжением до фуксии, только заливки без текста (L до 0,32) */
export const spectrum = (p: number): RGB => along(SPECTRUM_STOPS, p);

/** Доля хребта в фоне: L фона = 0,925 · L(базы) + 0,075 · L(хребта) ≈ 0,0174 */
export const DARK_MIX = 0.075;

/**
 * Фон держится одного семейства оттенков (индиго → орхидея): малина и фуксия в
 * него не заходят, иначе по диагонали экрана фон плывёт от синего к бордовому и
 * читается радужной плёнкой. Малина живёт только в окнах и акцентах.
 */
const DARK_STOPS: readonly RGB[] = [STOPS.S0, STOPS.S1, STOPS.S2];

/** Тёмная полоса: фон */
export const dark = (p: number): RGB => mix(BASE, along(DARK_STOPS, p), DARK_MIX);

export type Role = "dark" | "ridge" | "spectrum";

export function color(role: Role, p: number): RGB {
	return role === "dark" ? dark(p) : role === "ridge" ? ridge(p) : spectrum(p);
}

export function round(rgb: RGB): RGB {
	return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
}

export function rgbString(rgb: RGB): string {
	const r = round(rgb);
	return `rgb(${r[0]} ${r[1]} ${r[2]})`;
}

/**
 * Фаза листа вдоль диагонали, t ∈ [0, 1] на плитку. Палиндром с периодом 0,5:
 * две полные волны на плитку, поэтому плитки стыкуются без шва по обеим осям.
 */
export function phase(t: number): number {
	const f = (((t * 2) % 1) + 1) % 1;
	return f < 0.5 ? f * 2 : 2 - f * 2;
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/sheet-palette.test.ts`
Expected: PASS (все тесты)

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/sheet/palette.ts src/lib/__tests__/sheet-palette.test.ts
git commit -m "Раздув: палитра листа в линейном RGB с проверкой яркости и контраста" -m "$TRAILER"
```

---

### Task 2: Пружины

**Files:**
- Create: `src/lib/sheet/springs.ts`
- Test: `src/lib/__tests__/sheet-springs.test.ts`

**Interfaces:**
- Produces: `type Mass = "light" | "medium" | "heavy"`; `interface SpringSpec { zeta: number; move: number; release: number }`; `SPRINGS: Record<Mass, SpringSpec>`; `ATTACK_MS = 120`; `stepResponse(zeta: number, tau: number): number` (отклик ступени, `tau` ∈ [0, 1] — доля времени установления); `springLinear(mass: Mass, n?: number): string` (CSS `linear(0, …, 1)`, по умолчанию 24 точки); `springOvershoot(mass: Mass): number` (максимум отклика минус 1, не меньше 0).

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/sheet-springs.test.ts
import { describe, expect, test } from "bun:test";
import { ATTACK_MS, SPRINGS, springLinear, springOvershoot, stepResponse } from "../sheet/springs";

describe("пружины", () => {
	test("нарастание ≤ 120 мс, спад 600–1200 мс, движение растёт с массой", () => {
		expect(ATTACK_MS).toBeLessThanOrEqual(120);
		for (const mass of ["light", "medium", "heavy"] as const) {
			expect(SPRINGS[mass].release).toBeGreaterThanOrEqual(600);
			expect(SPRINGS[mass].release).toBeLessThanOrEqual(1200);
		}
		expect(SPRINGS.light.move).toBeLessThan(SPRINGS.medium.move);
		expect(SPRINGS.medium.move).toBeLessThan(SPRINGS.heavy.move);
	});

	test("перелёт ≤ 4%: лёгкая без перелёта, средняя около 3%", () => {
		expect(springOvershoot("light")).toBe(0);
		expect(springOvershoot("medium")).toBeGreaterThan(0.02);
		expect(springOvershoot("medium")).toBeLessThanOrEqual(0.04);
		expect(springOvershoot("heavy")).toBeLessThanOrEqual(0.04);
	});

	test("отклик ступени: 0 в начале, 1 в конце, монотонен у лёгкой", () => {
		for (const zeta of [1, 0.9, 0.75]) {
			expect(stepResponse(zeta, 0)).toBe(0);
			expect(stepResponse(zeta, 1)).toBe(1);
		}
		let prev = 0;
		for (let i = 1; i <= 50; i++) {
			const v = stepResponse(1, i / 50);
			expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
			prev = v;
		}
	});

	test("springLinear: строка linear() из 24 значений от 0 до 1", () => {
		for (const mass of ["light", "medium", "heavy"] as const) {
			const s = springLinear(mass);
			expect(s.startsWith("linear(0, ")).toBe(true);
			expect(s.endsWith(", 1)")).toBe(true);
			const values = s.slice(7, -1).split(",").map(Number);
			expect(values).toHaveLength(24);
			expect(values.every(Number.isFinite)).toBe(true);
		}
		expect(springLinear("medium", 8).slice(7, -1).split(",")).toHaveLength(8);
	});

	test("средняя пружина действительно перелетает единицу в строке linear()", () => {
		const values = springLinear("medium", 48).slice(7, -1).split(",").map(Number);
		expect(Math.max(...values)).toBeGreaterThan(1);
		expect(Math.max(...values)).toBeLessThanOrEqual(1.04);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/sheet-springs.test.ts`
Expected: FAIL (`Cannot find module '../sheet/springs'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/sheet/springs.ts
/**
 * Три массы пружин, один закон: отклик ступени демпфированного осциллятора,
 * нормированный на время установления. Перелёт зависит только от коэффициента
 * демпфирования ζ: лёгкая и тяжёлая почти не перелетают, средняя ≈ 3%.
 * Те же значения уходят в CSS `linear()` и в Web Animations.
 */
export type Mass = "light" | "medium" | "heavy";

export interface SpringSpec {
	/** Коэффициент демпфирования */
	zeta: number;
	/** Длительность движения к цели, мс */
	move: number;
	/** Длительность спада импульса, мс */
	release: number;
}

export const SPRINGS: Record<Mass, SpringSpec> = {
	light: { zeta: 1, move: 180, release: 600 },
	medium: { zeta: 0.75, move: 280, release: 800 },
	heavy: { zeta: 0.9, move: 500, release: 1100 },
};

/** Нарастание импульса, мс (не больше 120) */
export const ATTACK_MS = 120;

/** ζ·ω·T = 6: за время T отклик устанавливается до ≈ 98% */
const K = 6;

/** Отклик ступени: tau — доля времени установления (0..1), результат 0..1 с перелётом */
export function stepResponse(zeta: number, tau: number): number {
	if (tau <= 0) return 0;
	if (tau >= 1) return 1;
	const w = (K / zeta) * tau;
	if (zeta >= 1) return 1 - Math.exp(-w) * (1 + w);
	const s = Math.sqrt(1 - zeta * zeta);
	const wd = w * s;
	return 1 - Math.exp(-zeta * w) * (Math.cos(wd) + (zeta / s) * Math.sin(wd));
}

const fmt = (v: number): string => String(Number(v.toFixed(3)));

/** Строка CSS `linear(0, …, 1)`: кривая пружины, n точек по равным долям времени */
export function springLinear(mass: Mass, n = 24): string {
	const { zeta } = SPRINGS[mass];
	const values: string[] = [];
	for (let i = 0; i < n; i++) values.push(fmt(stepResponse(zeta, i / (n - 1))));
	return `linear(${values.join(", ")})`;
}

/** Перелёт: максимум отклика минус 1 (не меньше нуля) */
export function springOvershoot(mass: Mass): number {
	const { zeta } = SPRINGS[mass];
	let max = 0;
	for (let i = 0; i <= 2000; i++) max = Math.max(max, stepResponse(zeta, i / 2000));
	return Math.max(0, max - 1);
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/sheet-springs.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/sheet/springs.ts src/lib/__tests__/sheet-springs.test.ts
git commit -m "Раздув: три массы пружин и кривые linear() с проверкой перелёта" -m "$TRAILER"
```

---

### Task 3: Планировщик волны

**Files:**
- Create: `src/lib/sheet/wave.ts`
- Test: `src/lib/__tests__/sheet-wave.test.ts`

**Interfaces:**
- Produces: `WAVE_MAX_MS = 280`; `BASE_SHIFT = 0.18`; `MAX_SHIFT = 0.28`; `WAVE_LIMIT = 24`; `waveDelay(d: number): number` (мс); `waveGain(d: number): number`; `weightForCost(cost: number): number`; `interface Target { id: number; x: number; y: number; w: number; h: number; isSource: boolean }`; `interface WavePlan { id: number; delay: number; amp: number; gain: number }`; `planWave(src: { x: number; y: number }, targets: Target[], o: { weight: number; sign: 1 | -1; viewport: { w: number; h: number }; limit?: number }): WavePlan[]`.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/sheet-wave.test.ts
import { describe, expect, test } from "bun:test";
import {
	BASE_SHIFT,
	MAX_SHIFT,
	planWave,
	type Target,
	WAVE_MAX_MS,
	waveDelay,
	waveGain,
	weightForCost,
} from "../sheet/wave";

const t = (id: number, x: number, y: number, isSource = false): Target => ({ id, x, y, w: 100, h: 40, isSource });
const VIEW = { w: 1280, h: 800 };

describe("волна", () => {
	test("задержка 1 мс на 2,5 px с потолком 280 мс", () => {
		expect(waveDelay(0)).toBe(0);
		expect(waveDelay(250)).toBeCloseTo(100, 5);
		expect(waveDelay(10_000)).toBe(WAVE_MAX_MS);
	});

	test("затухание ÷ (1 + d/400)", () => {
		expect(waveGain(0)).toBe(1);
		expect(waveGain(400)).toBeCloseTo(0.5, 5);
		expect(waveGain(1200)).toBeCloseTo(0.25, 5);
	});

	test("вес по цене: Krea 1 < Ideogram 3 < Турбо 10 = 1", () => {
		expect(weightForCost(1)).toBeCloseTo(0.37, 5);
		expect(weightForCost(3)).toBeCloseTo(0.51, 5);
		expect(weightForCost(10)).toBe(1);
		expect(weightForCost(99)).toBe(1);
		expect(weightForCost(-5)).toBeCloseTo(0.3, 5);
	});
});

describe("planWave", () => {
	test("источник отвечает первым и сильнее всех, дальние позже и слабее", () => {
		const plan = planWave(
			{ x: 100, y: 100 },
			[t(1, 600, 100), t(2, 100, 100, true), t(3, 1000, 600)],
			{ weight: 1, sign: 1, viewport: VIEW },
		);
		expect(plan.map((p) => p.id)).toEqual([2, 1, 3]);
		expect(plan[0]!.delay).toBe(0);
		expect(plan[0]!.amp).toBeCloseTo(BASE_SHIFT, 5);
		expect(plan[1]!.delay).toBeGreaterThan(plan[0]!.delay);
		expect(plan[2]!.delay).toBeGreaterThanOrEqual(plan[1]!.delay);
		expect(Math.abs(plan[1]!.amp)).toBeLessThan(Math.abs(plan[0]!.amp));
		expect(Math.abs(plan[2]!.amp)).toBeLessThan(Math.abs(plan[1]!.amp));
		for (const p of plan) expect(p.delay).toBeLessThanOrEqual(WAVE_MAX_MS);
	});

	test("знак назад меняет направление, вес масштабирует амплитуду", () => {
		const back = planWave({ x: 0, y: 0 }, [t(1, 0, 0, true)], { weight: 0.5, sign: -1, viewport: VIEW });
		expect(back[0]!.amp).toBeCloseTo(-0.5 * BASE_SHIFT, 5);
	});

	test("амплитуда не выше потолка", () => {
		const plan = planWave({ x: 0, y: 0 }, [t(1, 0, 0, true)], { weight: 100, sign: 1, viewport: VIEW });
		expect(plan[0]!.amp).toBe(MAX_SHIFT);
	});

	test("окна за пределами экрана не участвуют", () => {
		const plan = planWave(
			{ x: 0, y: 0 },
			[t(1, 50, 50, true), t(2, 5000, 50), t(3, 50, -5000)],
			{ weight: 1, sign: 1, viewport: VIEW },
		);
		expect(plan.map((p) => p.id)).toEqual([1]);
	});

	test("лимит ближайших окон", () => {
		const targets = Array.from({ length: 40 }, (_, i) => t(i, 100 + i * 10, 100));
		const plan = planWave({ x: 100, y: 100 }, targets, { weight: 1, sign: 1, viewport: VIEW, limit: 5 });
		expect(plan).toHaveLength(5);
		expect(plan.map((p) => p.id)).toEqual([0, 1, 2, 3, 4]);
		expect(planWave({ x: 100, y: 100 }, targets, { weight: 1, sign: 1, viewport: VIEW })).toHaveLength(24);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/sheet-wave.test.ts`
Expected: FAIL (`Cannot find module '../sheet/wave'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/sheet/wave.ts
/**
 * Планировщик волны. Импульс доходит до окон с задержкой по расстоянию и
 * слабеет с ним; источник отвечает первым. Чистая функция: измерения окон и
 * сами анимации делает DOM-слой.
 */
export const WAVE_MAX_MS = 280;
/** 1 мс на 2,5 px */
const MS_PER_PX = 0.4;
/** Затухание ÷ (1 + d / 400 px) */
const FALLOFF_PX = 400;
/** Сдвиг листа у источника при весе 1, доля ширины окна */
export const BASE_SHIFT = 0.18;
export const MAX_SHIFT = 0.28;
/** Не больше стольких ближайших окон за один импульс */
export const WAVE_LIMIT = 24;
/** Окна дальше этого поля от экрана не анимируются, px */
const OFFSCREEN_MARGIN = 200;

export const waveDelay = (d: number): number => Math.min(WAVE_MAX_MS, d * MS_PER_PX);
export const waveGain = (d: number): number => 1 / (1 + d / FALLOFF_PX);

/** Вес импульса по цене действия: 0,3 + 0,7 · min(цена, 10) / 10 */
export function weightForCost(cost: number): number {
	return 0.3 + (0.7 * Math.min(Math.max(cost, 0), 10)) / 10;
}

export interface Target {
	id: number;
	/** Центр окна в координатах экрана, px */
	x: number;
	y: number;
	w: number;
	h: number;
	isSource: boolean;
}

export interface WavePlan {
	id: number;
	/** Задержка начала, мс */
	delay: number;
	/** Сдвиг листа, доля ширины окна со знаком */
	amp: number;
	gain: number;
}

export function planWave(
	src: { x: number; y: number },
	targets: Target[],
	o: { weight: number; sign: 1 | -1; viewport: { w: number; h: number }; limit?: number },
): WavePlan[] {
	const visible = targets.filter(
		(t) =>
			t.x + t.w / 2 > -OFFSCREEN_MARGIN &&
			t.x - t.w / 2 < o.viewport.w + OFFSCREEN_MARGIN &&
			t.y + t.h / 2 > -OFFSCREEN_MARGIN &&
			t.y - t.h / 2 < o.viewport.h + OFFSCREEN_MARGIN,
	);
	const measured = visible
		.map((t) => ({ t, d: t.isSource ? 0 : Math.hypot(t.x - src.x, t.y - src.y) }))
		.sort((a, b) => a.d - b.d);
	return measured.slice(0, o.limit ?? WAVE_LIMIT).map(({ t, d }) => {
		const gain = waveGain(d);
		const raw = o.sign * o.weight * BASE_SHIFT * gain;
		return { id: t.id, delay: waveDelay(d), amp: Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, raw)), gain };
	});
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/sheet-wave.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/sheet/wave.ts src/lib/__tests__/sheet-wave.test.ts
git commit -m "Раздув: планировщик волны импульса с задержкой и затуханием по расстоянию" -m "$TRAILER"
```

---

### Task 4: CSS-токены листа и проверка анимируемых свойств

**Files:**
- Create: `src/lib/sheet/css.ts`
- Create: `src/lib/sheet/css-lint.ts`
- Create: `scripts/gen-sheet-css.ts`
- Create: `src/sheet.generated.css` (генерируется)
- Modify: `package.json` (скрипт `sheet:css`)
- Test: `src/lib/__tests__/sheet-css.test.ts`

**Interfaces:**
- Consumes: `color`, `phase`, `rgbString`, `STOPS`, `TEXT`, `TEXT_2`, `ERROR`, `Role` (Task 1); `SPRINGS`, `springLinear`, `Mass` (Task 2); `WAVE_MAX_MS` (Task 3).
- Produces:
  - `css.ts`: `TILE_PX = 1600`; `STOPS_PER_TILE = 64`; `gradient(role: Role): string` (`linear-gradient(135deg, …)` на 65 остановок, две палиндромные волны на плитку); `buildSheetCss(): string`.
  - `css-lint.ts`: `ALLOWED_ANIMATED: Set<string>` (`transform`, `translate`, `scale`, `rotate`, `opacity`); `animatedProperties(css: string): Set<string>` (свойства из `@keyframes` и `transition`); `bannedTokens(css: string): string[]` (найденные `filter`, `backdrop-filter`, `mix-blend-mode`, `@property`).
  - CSS-переменные `:root`: `--sheet-tile`, `--sheet-dark`, `--sheet-ridge`, `--sheet-spectrum`, `--edge`, `--text`, `--text-2`, `--error`, `--wave-max`, `--spring-{light,medium,heavy}`, `--spring-{…}-ms`, `--release-{…}-ms`.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/sheet-css.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSheetCss, gradient, STOPS_PER_TILE, TILE_PX } from "../sheet/css";
import { ALLOWED_ANIMATED, animatedProperties, bannedTokens } from "../sheet/css-lint";

const stopsOf = (g: string): string[] =>
	g.slice("linear-gradient(135deg, ".length, -1).split(", ").map((s) => s.replace(/ [\d.]+%$/, ""));

describe("градиент листа", () => {
	test("65 остановок, плитка стыкуется без шва: конец равен началу, период 0,5", () => {
		for (const role of ["dark", "ridge", "spectrum"] as const) {
			const g = gradient(role);
			expect(g.startsWith("linear-gradient(135deg, ")).toBe(true);
			const stops = stopsOf(g);
			expect(stops).toHaveLength(STOPS_PER_TILE + 1);
			expect(stops[0]).toBe(stops[STOPS_PER_TILE]);
			for (let i = 0; i <= STOPS_PER_TILE / 2; i++) {
				expect(stops[i]).toBe(stops[i + STOPS_PER_TILE / 2]);
			}
		}
		expect(TILE_PX).toBe(1600);
	});

	test("первая остановка — опора S0 для хребта, база-смесь для фона", () => {
		expect(stopsOf(gradient("ridge"))[0]).toBe("rgb(108 92 255)");
		expect(stopsOf(gradient("dark"))[0]).not.toBe("rgb(108 92 255)");
	});
});

describe("сгенерированный CSS", () => {
	test("файл совпадает с генератором (токены не расходятся с модулями)", () => {
		const file = readFileSync(path.join(import.meta.dir, "../../sheet.generated.css"), "utf8");
		expect(file).toBe(buildSheetCss());
	});

	test("содержит все токены", () => {
		const css = buildSheetCss();
		for (const name of [
			"--sheet-tile: 1600px",
			"--sheet-dark: linear-gradient(135deg,",
			"--sheet-ridge: linear-gradient(135deg,",
			"--sheet-spectrum: linear-gradient(135deg,",
			"--edge: rgb(108 92 255)",
			"--text: rgb(242 239 255)",
			"--text-2: rgb(167 159 203)",
			"--error: rgb(255 107 129)",
			"--wave-max: 280ms",
			"--spring-light: linear(",
			"--spring-medium: linear(",
			"--spring-heavy: linear(",
			"--spring-light-ms: 180ms",
			"--spring-medium-ms: 280ms",
			"--spring-heavy-ms: 500ms",
			"--release-heavy-ms: 1100ms",
		]) {
			expect(css).toContain(name);
		}
	});

	test("в сгенерированном CSS нет анимаций и запрещённых свойств", () => {
		const css = buildSheetCss();
		expect(animatedProperties(css).size).toBe(0);
		expect(bannedTokens(css)).toEqual([]);
	});
});

describe("css-lint", () => {
	test("находит свойства в @keyframes и transition", () => {
		const css = `
			@keyframes a { from { transform: none; opacity: 0 } to { translate: 4px 0; background-position: 1px 1px } }
			.x { transition: transform .2s ease, box-shadow .3s; }
			.y { transition-property: scale, width; transition-duration: 1s; }
			.z { transition: all .1s; }
		`;
		const props = animatedProperties(css);
		for (const p of ["transform", "opacity", "translate", "background-position", "box-shadow", "scale", "width", "all"]) {
			expect(props.has(p)).toBe(true);
		}
		expect(props.has("transition-duration")).toBe(false);
	});

	test("разрешённые свойства и запрещённые токены", () => {
		expect([...ALLOWED_ANIMATED].sort()).toEqual(["opacity", "rotate", "scale", "transform", "translate"]);
		expect(bannedTokens(".a{filter:blur(2px)} .b{backdrop-filter:none} .c{mix-blend-mode:screen} @property --x{}").sort()).toEqual([
			"@property",
			"backdrop-filter",
			"filter",
			"mix-blend-mode",
		]);
		expect(bannedTokens(".a{-webkit-backdrop-filter:none}")).toEqual(["backdrop-filter"]);
		expect(bannedTokens(".a{transform:none}")).toEqual([]);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/sheet-css.test.ts`
Expected: FAIL (`Cannot find module '../sheet/css'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/sheet/css.ts
import { color, ERROR, phase, type Role, rgbString, STOPS, TEXT, TEXT_2 } from "./palette";
import { type Mass, SPRINGS, springLinear } from "./springs";
import { WAVE_MAX_MS } from "./wave";

/**
 * Лист как CSS. Плитка 1600×1600 px, градиент идёт по диагонали 135° (угол
 * угол-в-угол квадрата) и содержит две палиндромные волны: цвет в точке зависит
 * только от (x + y) с периодом в сторону плитки, поэтому плитки стыкуются без
 * шва по обеим осям, а окна выравниваются со страницей смещением фона.
 */
export const TILE_PX = 1600;
export const STOPS_PER_TILE = 64;

export function gradient(role: Role): string {
	const parts: string[] = [];
	for (let i = 0; i <= STOPS_PER_TILE; i++) {
		const t = i / STOPS_PER_TILE;
		const percent = Math.round(t * 10000) / 100;
		parts.push(`${rgbString(color(role, phase(t)))} ${percent}%`);
	}
	return `linear-gradient(135deg, ${parts.join(", ")})`;
}

const MASSES: Mass[] = ["light", "medium", "heavy"];

export function buildSheetCss(): string {
	const lines = [
		"/* Сгенерировано scripts/gen-sheet-css.ts из src/lib/sheet/*. Не править вручную: bun run sheet:css */",
		":root {",
		`  --sheet-tile: ${TILE_PX}px;`,
		`  --sheet-dark: ${gradient("dark")};`,
		`  --sheet-ridge: ${gradient("ridge")};`,
		`  --sheet-spectrum: ${gradient("spectrum")};`,
		`  --edge: ${rgbString(STOPS.S0)};`,
		`  --text: ${rgbString(TEXT)};`,
		`  --text-2: ${rgbString(TEXT_2)};`,
		`  --error: ${rgbString(ERROR)};`,
		`  --wave-max: ${WAVE_MAX_MS}ms;`,
	];
	for (const mass of MASSES) {
		lines.push(`  --spring-${mass}: ${springLinear(mass)};`);
		lines.push(`  --spring-${mass}-ms: ${SPRINGS[mass].move}ms;`);
		lines.push(`  --release-${mass}-ms: ${SPRINGS[mass].release}ms;`);
	}
	lines.push("}", "");
	return lines.join("\n");
}
```

```ts
// src/lib/sheet/css-lint.ts
/**
 * Проверка CSS по правилам системы: анимировать можно только transform,
 * translate, scale, rotate и opacity; запрещены filter, backdrop-filter,
 * mix-blend-mode и @property. Разбор простой (регулярные выражения), его
 * достаточно для CSS проекта.
 */
export const ALLOWED_ANIMATED = new Set(["transform", "translate", "scale", "rotate", "opacity"]);

export function animatedProperties(css: string): Set<string> {
	const out = new Set<string>();
	const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const block of source.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
		for (const frame of block[1]!.matchAll(/\{([^{}]*)\}/g)) {
			for (const decl of frame[1]!.matchAll(/([a-z-]+)\s*:/g)) out.add(decl[1]!);
		}
	}
	for (const m of source.matchAll(/(?<![\w-])transition(?:-property)?\s*:\s*([^;{}]+)/g)) {
		for (const part of m[1]!.split(",")) {
			const name = part.trim().split(/\s+/)[0] ?? "";
			if (/^[a-z-]+$/.test(name) && name !== "none") out.add(name);
		}
	}
	return out;
}

export function bannedTokens(css: string): string[] {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const found: string[] = [];
	if (/(?<![\w-])filter\s*:/.test(source)) found.push("filter");
	if (/backdrop-filter\s*:/.test(source)) found.push("backdrop-filter");
	if (/mix-blend-mode\s*:/.test(source)) found.push("mix-blend-mode");
	if (/@property\b/.test(source)) found.push("@property");
	return found;
}
```

```ts
// scripts/gen-sheet-css.ts
import { buildSheetCss } from "../src/lib/sheet/css";

await Bun.write("src/sheet.generated.css", buildSheetCss());
console.log("записан src/sheet.generated.css");
```

В `package.json` → `scripts` добавить `"sheet:css": "bun scripts/gen-sheet-css.ts"` (скриптом, чтобы не ошибиться с запятыми):

```bash
uv run - <<'EOF'
import json, pathlib
p = pathlib.Path("package.json")
d = json.loads(p.read_text())
d["scripts"]["sheet:css"] = "bun scripts/gen-sheet-css.ts"
p.write_text(json.dumps(d, indent="\t", ensure_ascii=False) + "\n")
EOF
bun run sheet:css
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/sheet-css.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/sheet/css.ts src/lib/sheet/css-lint.ts scripts/gen-sheet-css.ts src/sheet.generated.css src/lib/__tests__/sheet-css.test.ts package.json
git commit -m "Раздув: CSS-токены листа из модулей и проверка анимируемых свойств" -m "$TRAILER"
```

---

### Task 5: DOM-слой — окна, импульсы, каретка, хвост

**Files:**
- Create: `src/lib/sheet/caret.ts`
- Create: `src/lib/sheet/tail.ts`
- Create: `src/lib/sheet/windows.ts`
- Create: `src/lib/sheet/impulses.ts`
- Test: `src/lib/__tests__/sheet-dom.test.ts` (чистая часть; браузерная проверяется прототипом в Task 6)

**Interfaces:**
- Consumes: `ATTACK_MS`, `SPRINGS`, `springLinear`, `Mass` (Task 2); `BASE_SHIFT`, `planWave`, `Target` (Task 3).
- Produces:
  - `caret.ts`: `interface CaretPoint { x: number; y: number; h: number }` (середина строки в координатах окна и высота строки); `MIRROR_PROPS: readonly string[]`; `caretViewportPoint(i: { fieldLeft; fieldTop; borderLeft; borderTop; markLeft; markTop; markHeight; scrollLeft; scrollTop }): CaretPoint`; `caretOf(el: HTMLInputElement | HTMLTextAreaElement): CaretPoint`.
  - `tail.ts`: `isEraseInput(inputType: string | undefined): boolean`; `tailLength(sinceMs: number): number` (10..48 px: чем быстрее печать, тем длиннее); `showTail(p: CaretPoint, dir: 1 | -1, now?: number): void`. CSS-класс `.caret-tail` (стили в прототипе).
  - `windows.ts`: `interface SheetWindow { el; layer; x; y; w; h; fixed }` (кеш геометрии); `measure(el: HTMLElement): void`; `remeasure(el?: HTMLElement): void`; `sheetWindows(): SheetWindow[]`; `startWindows(): () => void`. Атрибуты: `data-sheet` (`dark | ridge | spectrum | ring`), `data-sheet-fixed`. Окно содержит дочерний слой `<i class="sheet-layer" aria-hidden="true">` (кроме `ring`). CSS-переменные окна `--wx`, `--wy` (положение на странице, px).
  - `impulses.ts`: `interface ImpulseInput { source: Element; sign?: 1 | -1; weight?: number; mass?: Mass; deform?: boolean }`; `impulse(input: ImpulseInput): void`; `startImpulses(): () => void` (ставит слушатели для `[data-impulse]`, вес берёт из `data-weight`; вид `field` слушатели игнорируют).

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/sheet-dom.test.ts
import { describe, expect, test } from "bun:test";
import { caretViewportPoint, MIRROR_PROPS } from "../sheet/caret";
import { isEraseInput, tailLength } from "../sheet/tail";

describe("caretViewportPoint", () => {
	test("складывает поле, рамку и метку, вычитает прокрутку, берёт середину строки", () => {
		expect(
			caretViewportPoint({
				fieldLeft: 100,
				fieldTop: 50,
				borderLeft: 1,
				borderTop: 1,
				markLeft: 40,
				markTop: 20,
				markHeight: 24,
				scrollLeft: 0,
				scrollTop: 10,
			}),
		).toEqual({ x: 141, y: 73, h: 24 });
	});

	test("горизонтальная прокрутка сдвигает влево", () => {
		const p = caretViewportPoint({
			fieldLeft: 0,
			fieldTop: 0,
			borderLeft: 0,
			borderTop: 0,
			markLeft: 300,
			markTop: 0,
			markHeight: 20,
			scrollLeft: 120,
			scrollTop: 0,
		});
		expect(p.x).toBe(180);
	});

	test("зеркало копирует всё, что влияет на перенос строк", () => {
		for (const prop of [
			"font-family",
			"font-size",
			"font-weight",
			"letter-spacing",
			"line-height",
			"padding-left",
			"padding-right",
			"border-left-width",
			"box-sizing",
			"width",
			"text-indent",
			"tab-size",
		]) {
			expect([...MIRROR_PROPS] as string[]).toContain(prop);
		}
	});
});

describe("хвост каретки", () => {
	test("удаление — это delete*, ввод и вставка — нет", () => {
		expect(isEraseInput("deleteContentBackward")).toBe(true);
		expect(isEraseInput("deleteByCut")).toBe(true);
		expect(isEraseInput("insertText")).toBe(false);
		expect(isEraseInput("insertFromPaste")).toBe(false);
		expect(isEraseInput(undefined)).toBe(false);
	});

	test("длина хвоста: 48 px при быстрой печати, 10 px при медленной, монотонно", () => {
		expect(tailLength(0)).toBe(48);
		expect(tailLength(200)).toBe(24);
		expect(tailLength(400)).toBe(10);
		expect(tailLength(5000)).toBe(10);
		let prev = Infinity;
		for (let ms = 0; ms <= 400; ms += 40) {
			const v = tailLength(ms);
			expect(v).toBeLessThanOrEqual(prev);
			prev = v;
		}
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/sheet-dom.test.ts`
Expected: FAIL (`Cannot find module '../sheet/caret'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/sheet/caret.ts
/**
 * Положение каретки в окне просмотра. Для textarea: скрытое зеркало с теми же
 * шрифтом, отступами и шириной; текст до каретки + метка, по метке читаем
 * позицию (один замер раскладки на нажатие). Для однострочного input ширина
 * текста меряется через canvas measureText без раскладки.
 */
export interface CaretPoint {
	/** Середина каретки по горизонтали */
	x: number;
	/** Середина строки по вертикали */
	y: number;
	/** Высота строки */
	h: number;
}

export const MIRROR_PROPS = [
	"direction",
	"box-sizing",
	"width",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
	"border-style",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"font-style",
	"font-variant",
	"font-weight",
	"font-stretch",
	"font-size",
	"font-size-adjust",
	"line-height",
	"font-family",
	"text-align",
	"text-transform",
	"text-indent",
	"text-decoration",
	"letter-spacing",
	"word-spacing",
	"tab-size",
] as const;

export function caretViewportPoint(i: {
	fieldLeft: number;
	fieldTop: number;
	borderLeft: number;
	borderTop: number;
	markLeft: number;
	markTop: number;
	markHeight: number;
	scrollLeft: number;
	scrollTop: number;
}): CaretPoint {
	return {
		x: i.fieldLeft + i.borderLeft + i.markLeft - i.scrollLeft,
		y: i.fieldTop + i.borderTop + i.markTop - i.scrollTop + i.markHeight / 2,
		h: i.markHeight,
	};
}

let mirror: HTMLDivElement | null = null;

function getMirror(): HTMLDivElement {
	if (!mirror) {
		mirror = document.createElement("div");
		mirror.setAttribute("aria-hidden", "true");
		const s = mirror.style;
		s.position = "fixed";
		s.left = "-9999px";
		s.top = "0";
		s.visibility = "hidden";
		s.whiteSpace = "pre-wrap";
		s.overflowWrap = "break-word";
		document.body.appendChild(mirror);
	}
	return mirror;
}

function textareaCaret(el: HTMLTextAreaElement): CaretPoint {
	const cs = getComputedStyle(el);
	const m = getMirror();
	for (const p of MIRROR_PROPS) m.style.setProperty(p, cs.getPropertyValue(p));
	m.style.overflow = "hidden";
	m.style.height = "auto";
	const pos = el.selectionEnd ?? el.value.length;
	m.textContent = el.value.slice(0, pos);
	const mark = document.createElement("span");
	mark.textContent = el.value.slice(pos) || ".";
	m.appendChild(mark);
	const lineHeight = Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2;
	const r = el.getBoundingClientRect();
	return caretViewportPoint({
		fieldLeft: r.left,
		fieldTop: r.top,
		borderLeft: Number.parseFloat(cs.borderLeftWidth) || 0,
		borderTop: Number.parseFloat(cs.borderTopWidth) || 0,
		markLeft: mark.offsetLeft,
		markTop: mark.offsetTop,
		markHeight: lineHeight,
		scrollLeft: el.scrollLeft,
		scrollTop: el.scrollTop,
	});
}

let measureCtx: CanvasRenderingContext2D | null = null;

function inputCaret(el: HTMLInputElement): CaretPoint {
	const cs = getComputedStyle(el);
	measureCtx ??= document.createElement("canvas").getContext("2d");
	const r = el.getBoundingClientRect();
	const pos = el.selectionEnd ?? el.value.length;
	let width = 0;
	if (measureCtx) {
		measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
		const text = el.type === "password" ? "•".repeat(pos) : el.value.slice(0, pos);
		width = measureCtx.measureText(text).width;
	}
	return {
		x:
			r.left +
			(Number.parseFloat(cs.borderLeftWidth) || 0) +
			(Number.parseFloat(cs.paddingLeft) || 0) +
			width -
			el.scrollLeft,
		y: r.top + r.height / 2,
		h: Number.parseFloat(cs.lineHeight) || Number.parseFloat(cs.fontSize) * 1.2,
	};
}

export function caretOf(el: HTMLInputElement | HTMLTextAreaElement): CaretPoint {
	return el instanceof HTMLTextAreaElement ? textareaCaret(el) : inputCaret(el);
}
```

```ts
// src/lib/sheet/tail.ts
import type { CaretPoint } from "./caret";

/**
 * Хвост листа за кареткой: узкая полоса спектра под строкой, растянутая назад
 * по скорости печати (длина 10–48 px) с мягкой маской без плашки. Ввод тянет
 * хвост за кареткой, удаление — вперёд (хвост идёт вспять). Анимируются только
 * `transform` и `opacity`; стили `.caret-tail` лежат в CSS страницы.
 */
const FULL = 48;
const MIN = 10;
const SLOW_MS = 400;

export function isEraseInput(inputType: string | undefined): boolean {
	return !!inputType && inputType.startsWith("delete");
}

/** Чем короче пауза между нажатиями, тем длиннее хвост */
export function tailLength(sinceMs: number): number {
	const v = FULL * (1 - Math.max(0, sinceMs) / SLOW_MS);
	return Math.round(Math.min(FULL, Math.max(MIN, v)));
}

let el: HTMLDivElement | null = null;
let lastAt = 0;

function ensure(): HTMLDivElement {
	if (!el) {
		el = document.createElement("div");
		el.className = "caret-tail";
		el.setAttribute("aria-hidden", "true");
		document.body.appendChild(el);
	}
	return el;
}

export function showTail(p: CaretPoint, dir: 1 | -1, now: number = performance.now()): void {
	const tail = ensure();
	const len = tailLength(now - lastAt);
	lastAt = now;
	const x = Math.round(dir === 1 ? p.x - FULL : p.x);
	const y = Math.round(p.y + p.h / 2 - 2);
	tail.dataset.dir = dir === 1 ? "fwd" : "back";
	tail.style.transformOrigin = dir === 1 ? "100% 50%" : "0 50%";
	// текстура листа выравнивается по координатам страницы: хвост «вырезан» из того же листа
	tail.style.backgroundPosition = `${-(x + window.scrollX)}px ${-(y + window.scrollY)}px`;
	for (const a of tail.getAnimations()) a.cancel();
	const base = `translate(${x}px, ${y}px)`;
	tail.style.transform = base;
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	tail.animate(
		[
			{ opacity: 1, transform: `${base} scaleX(${len / FULL})` },
			{ opacity: 0, transform: `${base} scaleX(0.2)` },
		],
		{ duration: 600, easing: "ease-out" },
	);
}
```

```ts
// src/lib/sheet/windows.ts
/**
 * Окна в лист. Элемент с `data-sheet` показывает кусок общего листа: его
 * дочерний слой `.sheet-layer` несёт текстуру, выровненную по координатам
 * страницы переменными --wx/--wy. Положение и размер измеряются при монтировании
 * и при изменении раскладки (ResizeObserver, MutationObserver) и кешируются:
 * импульс не читает раскладку. Слой — настоящий элемент, а не псевдоэлемент:
 * анимация псевдоэлемента через Web Animations в ≈ 9 раз дороже (замер: 0,9 мс
 * против 0,1 мс на 14 окон).
 */
export interface SheetWindow {
	el: HTMLElement;
	layer: HTMLElement | null;
	/** Левый верхний угол на странице (для `data-sheet-fixed` — в окне просмотра), px */
	x: number;
	y: number;
	w: number;
	h: number;
	fixed: boolean;
}

const known = new Map<HTMLElement, SheetWindow>();

export function measure(el: HTMLElement): void {
	const r = el.getBoundingClientRect();
	const fixed = el.hasAttribute("data-sheet-fixed");
	const x = Math.round(r.left + (fixed ? 0 : window.scrollX));
	const y = Math.round(r.top + (fixed ? 0 : window.scrollY));
	const px = `${x}px`;
	const py = `${y}px`;
	if (el.style.getPropertyValue("--wx") !== px) el.style.setProperty("--wx", px);
	if (el.style.getPropertyValue("--wy") !== py) el.style.setProperty("--wy", py);
	const win = known.get(el);
	if (win) {
		win.x = x;
		win.y = y;
		win.w = r.width;
		win.h = r.height;
		win.fixed = fixed;
	}
}

export function remeasure(el?: HTMLElement): void {
	if (el) measure(el);
	else for (const w of known.keys()) if (w.isConnected) measure(w);
}

export function sheetWindows(): SheetWindow[] {
	return [...known.values()].filter((w) => w.el.isConnected);
}

export function startWindows(): () => void {
	const sizes = new ResizeObserver((entries) => {
		for (const e of entries) measure(e.target as HTMLElement);
	});
	const page = new ResizeObserver(() => remeasure());
	let timer = 0;

	function add(el: HTMLElement): void {
		if (known.has(el)) return;
		known.set(el, {
			el,
			layer: el.querySelector<HTMLElement>(":scope > .sheet-layer"),
			x: 0,
			y: 0,
			w: 0,
			h: 0,
			fixed: false,
		});
		sizes.observe(el);
		measure(el);
	}

	function scan(root: ParentNode): void {
		for (const el of root.querySelectorAll<HTMLElement>("[data-sheet]")) add(el);
	}

	function prune(): void {
		for (const el of known.keys()) {
			if (!el.isConnected) {
				known.delete(el);
				sizes.unobserve(el);
			}
		}
	}

	function later(): void {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			prune();
			remeasure();
		}, 80);
	}

	const mutations = new MutationObserver((records) => {
		for (const r of records) {
			for (const node of r.addedNodes) {
				if (node instanceof HTMLElement) {
					if (node.matches("[data-sheet]")) add(node);
					scan(node);
				}
			}
		}
		later();
	});

	scan(document);
	page.observe(document.documentElement);
	mutations.observe(document.documentElement, { childList: true, subtree: true });
	window.addEventListener("resize", later);
	return () => {
		window.clearTimeout(timer);
		window.removeEventListener("resize", later);
		mutations.disconnect();
		page.disconnect();
		sizes.disconnect();
		known.clear();
	};
}
```

```ts
// src/lib/sheet/impulses.ts
import { ATTACK_MS, type Mass, SPRINGS, springLinear } from "./springs";
import { BASE_SHIFT, planWave, type Target } from "./wave";
import { type SheetWindow, sheetWindows, startWindows } from "./windows";

/**
 * Импульс: источник отвечает первым, остальные окна позже и слабее (волна по
 * расстоянию). Окно сдвигает свой кусок листа (слой `.sheet-layer`, только
 * `transform`); источник ещё и упруго деформируется (`scale`, перелёт ≤ 4%).
 * Всё через Web Animations без постоянного цикла: после волны всё неподвижно.
 * Геометрия окон берётся из кеша `windows.ts`, раскладка в обработчике не читается.
 */
const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
/** Сколько импульсов одновременно может идти на одном окне */
const MAX_ACTIVE = 3;
/**
 * Размеры окна просмотра и прокрутка. `scrollX`/`innerWidth` в Chrome могут
 * принудительно пересчитать раскладку, поэтому читаем их по событиям
 * `scroll`/`resize`, а не в обработчике импульса.
 */
const view = { sx: 0, sy: 0, w: 0, h: 0 };
const readView = (): void => {
	view.sx = window.scrollX;
	view.sy = window.scrollY;
	view.w = window.innerWidth;
	view.h = window.innerHeight;
};
/** Слой фона берём один раз */
let backdrop: HTMLElement | null | undefined;

/** getAnimations() принудительно пересчитывает стили, поэтому активные импульсы считаем сами */
const busy = new WeakMap<Element, number>();

const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ImpulseInput {
	source: Element;
	/** 1 — вперёд (успех, ввод, рост), -1 — назад (отмена, ошибка, трата) */
	sign?: 1 | -1;
	/** Вес по цене действия, 0..1 */
	weight?: number;
	mass?: Mass;
	/** Деформировать источник (по умолчанию да); нажатие кнопки делает это само */
	deform?: boolean;
}

export function impulse(input: ImpulseInput): void {
	const { source, sign = 1, weight = 0.5, mass = "medium", deform = true } = input;
	const { sx, sy } = view;
	const wins = sheetWindows();
	const src = centerOf(source, wins, sx, sy);
	const targets: Target[] = wins.map((w, i) => ({
		id: i,
		x: w.x + w.w / 2 - (w.fixed ? 0 : sx),
		y: w.y + w.h / 2 - (w.fixed ? 0 : sy),
		w: w.w,
		h: w.h,
		isSource: w.el === source || w.el.contains(source),
	}));
	const plan = planWave(src, targets, {
		weight,
		sign,
		viewport: { w: view.w, h: view.h },
	});
	const now = reduced();
	for (const p of plan) {
		const win = wins[p.id]!;
		if (now || win.el === source) {
			animateWindow(win, p.amp, p.delay, mass, deform && win.el === source);
		} else {
			// остальные окна оживают, когда до них доходит волна: стоимость обработчика не растёт с их числом
			window.setTimeout(() => {
				if (win.el.isConnected) animateWindow(win, p.amp, 0, mass, false);
			}, p.delay);
		}
	}
	// фон отвечает позже окон (он слабее), поэтому и создаётся позже: обработчик остаётся коротким
	window.setTimeout(() => nudgeBackground(sign, weight), 24);
}

/** Центр источника в окне просмотра; у окна — из кеша, без чтения раскладки */
function centerOf(el: Element, wins: SheetWindow[], sx: number, sy: number): { x: number; y: number } {
	const win = wins.find((w) => w.el === el);
	if (win) return { x: win.x + win.w / 2 - (win.fixed ? 0 : sx), y: win.y + win.h / 2 - (win.fixed ? 0 : sy) };
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateWindow(win: SheetWindow, amp: number, delay: number, mass: Mass, deform: boolean): void {
	const layer = win.layer;
	if (!layer) return;
	if (reduced()) {
		layer.animate([{ opacity: 0.8 }, { opacity: 1 }], { duration: 150, delay });
		return;
	}
	if ((busy.get(win.el) ?? 0) >= MAX_ACTIVE) return;
	const total = ATTACK_MS + SPRINGS[mass].release;
	const attackAt = ATTACK_MS / total;
	const spring = springLinear(mass);
	const shift = Math.round(amp * win.w * 100) / 100;
	// 2D-transform: статичный translate3d сделал бы слой композитным и в покое
	const anim = layer.animate(
		[
			{ transform: "translate(0,0)", offset: 0, easing: EASE_OUT },
			{ transform: `translate(${shift}px,0)`, offset: attackAt, easing: spring },
			{ transform: "translate(0,0)", offset: 1 },
		],
		{ duration: total, delay, composite: "add" },
	);
	busy.set(win.el, (busy.get(win.el) ?? 0) + 1);
	const done = (): void => {
		busy.set(win.el, Math.max(0, (busy.get(win.el) ?? 1) - 1));
	};
	anim.onfinish = done;
	anim.oncancel = done;
	if (!deform || win.el.style.transform) return;
	const grow = 1 + Math.min(0.035, (0.03 * Math.abs(amp)) / BASE_SHIFT);
	win.el.animate(
		[
			{ scale: "1", offset: 0, easing: EASE_OUT },
			{ scale: String(grow), offset: attackAt, easing: spring },
			{ scale: "1", offset: 1 },
		],
		{ duration: total, delay },
	);
}

/** Фон отвечает слабее окон: сдвиг вдоль диагонали листа на ≤ 6% ширины экрана */
function nudgeBackground(sign: 1 | -1, weight: number): void {
	backdrop ??= document.querySelector<HTMLElement>('[data-slot="sheet"] > i');
	const layer = backdrop;
	if (!layer || reduced()) return;
	const d = Math.round((sign * weight * 0.3 * 0.06 * view.w) / Math.SQRT2);
	const total = ATTACK_MS + SPRINGS.heavy.release;
	layer.animate(
		[
			{ transform: "translate(0,0)", offset: 0, easing: EASE_OUT },
			{ transform: `translate(${d}px,${d}px)`, offset: ATTACK_MS / total, easing: springLinear("heavy") },
			{ transform: "translate(0,0)", offset: 1 },
		],
		{ duration: total, composite: "add" },
	);
}

/** Глобальные слушатели: `[data-impulse]` отвечает на нажатие; вес из `data-weight` */
export function startImpulses(): () => void {
	const stopWindows = startWindows();
	readView();
	window.addEventListener("scroll", readView, { passive: true });
	window.addEventListener("resize", readView, { passive: true });
	let pressed: { el: Element; squash: Animation | null } | null = null;

	function hitDisabled(x: number, y: number): Element | null {
		for (const el of document.querySelectorAll("[data-impulse]:disabled, [data-impulse][aria-disabled='true']")) {
			const r = el.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
		}
		return null;
	}

	function down(e: PointerEvent): void {
		if (!e.isPrimary) return;
		const el = (e.target as Element | null)?.closest?.("[data-impulse]");
		if (!el) {
			// у отключённой кнопки нажатие может прийти на обёртку: ищем её под курсором (дорогой поиск — только здесь)
			const denied = hitDisabled(e.clientX, e.clientY);
			if (denied) impulse({ source: denied, sign: -1, weight: 0.15, mass: "light" });
			return;
		}
		if ((el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true") {
			impulse({ source: el, sign: -1, weight: 0.15, mass: "light" });
			return;
		}
		if (el.getAttribute("data-impulse") === "field") return;
		const weight = Number(el.getAttribute("data-weight"));
		// предвкушение: сжатие ≤ 80 мс; затем лист идёт вперёд, на отпускании выход на 1,03
		const squash = reduced()
			? null
			: el.animate([{ scale: "1" }, { scale: "0.97" }], { duration: 80, easing: EASE_OUT, fill: "forwards" });
		pressed = { el, squash };
		impulse({ source: el, sign: 1, weight: Number.isFinite(weight) && weight > 0 ? weight : 0.5, deform: false });
	}

	function up(): void {
		if (!pressed) return;
		const { el, squash } = pressed;
		pressed = null;
		squash?.cancel();
		if (reduced()) return;
		el.animate([{ scale: "0.97" }, { scale: "1.03", offset: 0.35 }, { scale: "1" }], {
			duration: 460,
			easing: "cubic-bezier(.3,.9,.3,1)",
		});
	}

	document.addEventListener("pointerdown", down, true);
	document.addEventListener("pointerup", up, true);
	document.addEventListener("pointercancel", up, true);
	return () => {
		document.removeEventListener("pointerdown", down, true);
		document.removeEventListener("pointerup", up, true);
		document.removeEventListener("pointercancel", up, true);
		window.removeEventListener("scroll", readView);
		window.removeEventListener("resize", readView);
		backdrop = undefined;
		stopWindows();
	};
}
```

- [ ] **Step 4: Запустить тесты и проверку типов**

Run: `bun test src/lib/__tests__/sheet-dom.test.ts && bun run typecheck`
Expected: PASS; типы без ошибок.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add src/lib/sheet/caret.ts src/lib/sheet/tail.ts src/lib/sheet/windows.ts src/lib/sheet/impulses.ts src/lib/__tests__/sheet-dom.test.ts
git commit -m "Раздув: окна в лист, импульсы на Web Animations, каретка и хвост" -m "$TRAILER"
```

---

### Task 6: Живой прототип, замеры и видео

**Files:**
- Create: `scripts/sheet-proto/index.html`
- Create: `scripts/sheet-proto/proto.css`
- Create: `scripts/sheet-proto/proto.ts`
- Create: `scripts/sheet-proto.ts`
- Modify: `package.json` (dev-зависимость `playwright-core`, скрипт `sheet:proto`)
- Test: `src/lib/__tests__/sheet-proto-css.test.ts`

**Interfaces:**
- Consumes: всё из Tasks 1–5 (`impulse`, `startImpulses`, `remeasure`, `caretOf`, `showTail`, `isEraseInput`, `SPRINGS`, `springLinear`, `Mass`) и `src/sheet.generated.css`.
- Produces: `bun run sheet:proto` — собирает страницу в `captures/sheet-proto/site`, прогоняет сценарий в Chromium, пишет скриншоты в `captures/sheet-proto/shots/`, видео в `captures/sheet-proto/demo.webm`, печатает таблицу замеров и завершается кодом 1 при нарушении бюджета.

Прототип — **автономная страница без Tailwind и shadcn**, на реальных токенах и модулях листа. Иконки в нём — простые заглушки (в Плане 2 вместо них `@tabler/icons-react`). Текст только там, где без него не обойтись.

- [ ] **Step 1: Написать падающий тест** (CSS прототипа подчиняется правилам системы)

```ts
// src/lib/__tests__/sheet-proto-css.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ALLOWED_ANIMATED, animatedProperties, bannedTokens } from "../sheet/css-lint";

const css = readFileSync(path.join(import.meta.dir, "../../../scripts/sheet-proto/proto.css"), "utf8");

describe("CSS прототипа", () => {
	test("анимируются только transform, translate, scale, rotate, opacity", () => {
		const bad = [...animatedProperties(css)].filter((p) => !ALLOWED_ANIMATED.has(p));
		expect(bad).toEqual([]);
	});

	test("нет filter, backdrop-filter, mix-blend-mode, @property", () => {
		expect(bannedTokens(css)).toEqual([]);
	});

	test("теней нет", () => {
		expect(css).not.toMatch(/(box|text)-shadow|drop-shadow/);
	});

	test("подключает сгенерированные токены листа", () => {
		expect(css).toContain('@import "../../src/sheet.generated.css"');
	});

	test("при reduced-motion отключены дрейф и переходы окон", () => {
		const block = css.slice(css.indexOf("prefers-reduced-motion"));
		expect(block).toContain(".sheet > i");
		expect(block).toContain("animation: none");
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/sheet-proto-css.test.ts`
Expected: FAIL (`ENOENT … proto.css`)

- [ ] **Step 3: Реализация**

```html
<!-- scripts/sheet-proto/index.html -->
<!doctype html>
<html lang="ru">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>gen42 — прототип «Раздув»</title>
	<link rel="stylesheet" href="./proto.css" />
</head>
<body>
	<div class="sheet" data-slot="sheet"><i></i></div>

	<header class="bar">
		<span class="logo" aria-label="gen42">gen42</span>
		<div class="bar-right">
			<span class="pill" id="pill" role="status" aria-label="Баланс">
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></svg>
				<span class="numbox" id="numbox"><span id="num" class="num">42</span></span>
			</span>
			<button type="button" class="icon-btn" data-sheet="dark" data-impulse="tap" data-weight="0.3" aria-label="Аккаунт">
				<i class="sheet-layer" aria-hidden="true"></i>
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></svg>
			</button>
		</div>
	</header>

	<main class="page">
		<div class="tabs" id="tabs" role="tablist">
			<i class="tabs-ind" id="ind" data-sheet="ridge"><i class="sheet-layer" aria-hidden="true"></i></i>
			<button type="button" class="tab" role="tab" aria-selected="true">
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="M5 17l4.5-4 3.5 3 3-2.5 3 3" /></svg>
				Изображение
			</button>
			<button type="button" class="tab" role="tab" aria-selected="false">
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z" /></svg>
				Турбо
			</button>
		</div>

		<div class="field" id="field" data-sheet="ring">
			<textarea id="prompt" rows="4" aria-label="Промпт"></textarea>
			<div class="field-foot">
				<button type="button" class="chip" data-sheet="dark" data-impulse="tap" data-weight="0.2" aria-label="Модель: Krea 2">
					<i class="sheet-layer" aria-hidden="true"></i>
					<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 4.4 2.2 6 6.5 6.5-4.3.5-5.9 2.1-6.5 6.5-.6-4.4-2.2-6-6.5-6.5C9.8 9 11.4 7.4 12 3z" /></svg>
					<span class="price"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></svg>1</span>
				</button>
				<button type="button" class="go" id="go" data-sheet="ridge" data-impulse="tap" data-weight="0.65" aria-label="Создать">
					<i class="sheet-layer" aria-hidden="true"></i>
					<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 4.4 2.2 6 6.5 6.5-4.3.5-5.9 2.1-6.5 6.5-.6-4.4-2.2-6-6.5-6.5C9.8 9 11.4 7.4 12 3z" /></svg>
					<span class="price"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></svg>10</span>
				</button>
			</div>
		</div>

		<section class="reasoning">
			<h2 class="h">
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.2A3 3 0 0 0 8 18a3 3 0 0 0 4 1V5.5A2.5 2.5 0 0 0 9 5zM15 5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.2A3 3 0 0 1 16 18a3 3 0 0 1-4 1" /></svg>
				Рассуждение
			</h2>
			<div class="slider" id="slider" role="slider" tabindex="0" aria-label="Уровень рассуждения" aria-valuemin="0" aria-valuemax="3" aria-valuenow="1" aria-valuetext="Высокое">
				<div class="track" data-sheet="dark"><i class="sheet-layer" aria-hidden="true"></i></div>
				<div class="fill" id="fill" data-sheet="spectrum"><i class="sheet-layer" aria-hidden="true"></i></div>
				<div class="thumb" id="thumb" data-sheet="ridge"><i class="sheet-layer" aria-hidden="true"></i></div>
			</div>
		</section>

		<div class="frame" id="frame" data-sheet="dark" role="img" aria-label="Кадр">
			<i class="sheet-layer" aria-hidden="true"></i>
			<div class="pic" id="pic"></div>
			<i class="flow" id="flow" data-sheet="spectrum"><i class="sheet-layer" aria-hidden="true"></i></i>
		</div>

		<section class="gallery" aria-label="Недавние">
			<div class="h" aria-hidden="true">
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5M12 8v4l3 2" /></svg>
			</div>
			<div class="tiles" id="tiles">
				<button type="button" class="tile" data-sheet="ring" data-impulse="tap" data-weight="0.3" aria-label="Открыть" style="background: radial-gradient(circle at 30% 30%, #ffb86b, transparent 55%), radial-gradient(circle at 70% 70%, #2dd4bf, transparent 60%), #2a1f3d"></button>
				<button type="button" class="tile" data-sheet="ring" data-impulse="tap" data-weight="0.3" aria-label="Открыть" style="background: conic-gradient(from 40deg at 50% 50%, #f59e0b, #10b981, #3b82f6, #f59e0b)"></button>
				<button type="button" class="tile" data-sheet="ring" data-impulse="tap" data-weight="0.3" aria-label="Открыть" style="background: linear-gradient(160deg, #f97316, #be123c)"></button>
				<button type="button" class="tile" data-sheet="ring" data-impulse="tap" data-weight="0.3" aria-label="Открыть" style="background: radial-gradient(circle at 60% 40%, #fde68a, #f59e0b 40%, #7c2d12 85%)"></button>
			</div>
		</section>
	</main>

	<script type="module" src="./proto.ts"></script>
</body>
</html>
```

```css
/* scripts/sheet-proto/proto.css */
@import "../../src/sheet.generated.css";

* {
	box-sizing: border-box;
}

html,
body {
	margin: 0;
}

body {
	position: relative;
	min-height: 100vh;
	overflow-x: hidden;
	background: #0d0b1e;
	color: var(--text);
	font: 500 16px/1.4 "Inter Tight", Inter, system-ui, sans-serif;
	-webkit-font-smoothing: antialiased;
}

button,
textarea {
	font: inherit;
	color: inherit;
}

button {
	padding: 0;
	border: 0;
	background: none;
	cursor: pointer;
}

:focus-visible {
	outline: 2px solid var(--text);
	outline-offset: 3px;
}

.ico {
	width: 18px;
	height: 18px;
	flex: none;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.8;
	stroke-linecap: round;
	stroke-linejoin: round;
}

/* ── Лист-фон: тёмная полоса, один слой, дрейф ±40 px с периодом 90 с ── */
.sheet {
	position: absolute;
	inset: 0;
	z-index: -1;
	overflow: hidden;
	background: var(--sheet-dark);
	background-size: var(--sheet-tile) var(--sheet-tile);
}

.sheet > i {
	position: absolute;
	inset: -64px;
	background: var(--sheet-dark);
	background-size: var(--sheet-tile) var(--sheet-tile);
	background-position: 64px 64px;
	animation: drift 90s ease-in-out infinite alternate;
}

@keyframes drift {
	from {
		transform: translate(-40px, -40px);
	}
	to {
		transform: translate(40px, 40px);
	}
}

/* ── Окна в лист: дочерний слой .sheet-layer с текстурой, выровненной по странице.
   Слой — настоящий элемент: анимация псевдоэлемента в ≈ 9 раз дороже ── */
[data-sheet] {
	position: relative;
	overflow: hidden;
	isolation: isolate;
}

.sheet-layer {
	position: absolute;
	inset: -48px;
	z-index: -1;
	background-image: var(--sheet-ridge);
	background-size: var(--sheet-tile) var(--sheet-tile);
	background-position: calc(48px - var(--wx, 0px)) calc(48px - var(--wy, 0px));
	pointer-events: none;
	transition: translate var(--spring-light-ms) var(--spring-light);
}

[data-sheet="dark"] > .sheet-layer {
	background-image: var(--sheet-dark);
}

[data-sheet="spectrum"] > .sheet-layer {
	background-image: var(--sheet-spectrum);
}

/* наведение: лист в окне подтягивается к курсору (лёгкая пружина) */
[data-sheet][data-impulse]:hover > .sheet-layer {
	translate: 10% 0;
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
.tile:hover::after {
	opacity: 1;
}

/* ── Шапка ── */
.bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	max-width: 760px;
	margin: 0 auto;
	padding: 22px 20px;
}

.bar-right {
	display: flex;
	align-items: center;
	gap: 12px;
}

.logo {
	font: 800 28px/1 "Bricolage Grotesque", "Inter Tight", system-ui, sans-serif;
	letter-spacing: -0.02em;
	background-image: var(--sheet-spectrum);
	background-size: var(--sheet-tile) var(--sheet-tile);
	background-position: -20px -22px;
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}

.pill {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 36px;
	padding: 0 14px;
	border: 1px solid var(--edge);
	border-radius: 999px;
	color: var(--text-2);
	font-variant-numeric: tabular-nums;
}

.numbox {
	position: relative;
	display: inline-block;
	min-width: 2ch;
	height: 1.3em;
	overflow: hidden;
	color: var(--text);
}

.num,
.num-in {
	display: block;
}

.num-in {
	position: absolute;
	top: 0;
	left: 0;
}

.icon-btn {
	display: grid;
	width: 38px;
	height: 38px;
	place-items: center;
	border: 1px solid var(--edge);
	border-radius: 50%;
	color: var(--text-2);
}

/* ── Страница ── */
.page {
	display: flex;
	flex-direction: column;
	gap: 22px;
	max-width: 760px;
	margin: 0 auto;
	padding: 8px 20px 96px;
}

.h {
	display: flex;
	align-items: center;
	gap: 10px;
	margin: 0;
	font: 700 18px/1.2 "Bricolage Grotesque", "Inter Tight", system-ui, sans-serif;
}

/* вкладки: один индикатор-окно хребта под активной */
.tabs {
	position: relative;
	display: flex;
	align-self: center;
	border: 1px solid var(--edge);
	border-radius: 999px;
	background: rgb(30 26 61 / 0.6);
}

.tab {
	position: relative;
	z-index: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 150px;
	height: 40px;
	border-radius: 999px;
	color: var(--text-2);
	font-weight: 600;
}

.tab[aria-selected="true"] {
	color: #fff;
}

.tabs-ind {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	z-index: 0;
	width: 150px;
	border-radius: 999px;
}

/* поле промпта */
.field {
	border: 1px solid var(--edge);
	border-radius: 22px;
	background: rgb(30 26 61 / 0.6);
}

.field textarea {
	display: block;
	width: 100%;
	min-height: 120px;
	padding: 18px 20px 6px;
	border: 0;
	outline: none;
	background: transparent;
	font-size: 17px;
	line-height: 1.5;
	caret-color: #ff5ca8;
	resize: none;
}

.field-foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 12px 12px;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 38px;
	padding: 0 14px;
	border: 1px solid var(--edge);
	border-radius: 999px;
	color: var(--text-2);
}

.price {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 14px;
	font-variant-numeric: tabular-nums;
}

.go {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	height: 46px;
	padding: 0 18px 0 16px;
	border-radius: 999px;
	color: #fff;
	font-weight: 700;
}

/* слайдер «Рассуждение»: дорожка — окно фона, заливка — спектр, ручка — капсула хребта */
.slider {
	position: relative;
	height: 30px;
	margin-top: 14px;
	cursor: pointer;
	touch-action: none;
}

.track {
	position: absolute;
	top: 11px;
	right: 0;
	left: 0;
	height: 8px;
	border: 1px solid var(--edge);
	border-radius: 999px;
}

.fill {
	position: absolute;
	top: 11px;
	left: 0;
	width: 100%;
	height: 8px;
	border-radius: 999px;
	transform-origin: left;
	transform: scaleX(0.33);
}

.thumb {
	position: absolute;
	top: 0;
	left: 0;
	width: 46px;
	height: 30px;
	border-radius: 999px;
}

/* кадр: ожидание (слой спектра) и сдёргивание занавеса */
.frame {
	width: min(100%, 420px);
	aspect-ratio: 1 / 1;
	margin: 6px auto 0;
	border: 1px solid var(--edge);
	border-radius: 22px;
	opacity: 0;
	transform: scaleY(0.16);
	transform-origin: 50% 0;
}

.frame[data-ready="true"] {
	opacity: 1;
	transform: none;
}

.pic {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(circle at 28% 30%, rgb(255 214 120 / 0.9), transparent 38%),
		radial-gradient(circle at 72% 66%, rgb(60 220 200 / 0.85), transparent 42%),
		conic-gradient(from 200deg at 55% 45%, #fb923c, #f43f5e, #22d3ee, #84cc16, #fb923c);
	opacity: 0;
}

.flow {
	position: absolute;
	inset: 0;
	border-radius: inherit;
	opacity: 0;
	-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 64px), transparent);
	mask-image: linear-gradient(to right, #000 calc(100% - 64px), transparent);
	transition: opacity var(--spring-heavy-ms) var(--spring-heavy);
}

.frame.waiting .flow > .sheet-layer {
	animation: flow-drift 6s ease-in-out infinite alternate;
}

@keyframes flow-drift {
	from {
		transform: translate(-8%, 0);
	}
	to {
		transform: translate(8%, 0);
	}
}

/* галерея */
.gallery {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.tiles {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
}

.tile {
	width: 92px;
	height: 92px;
	border-radius: 18px;
	transition: scale var(--spring-light-ms) var(--spring-light);
}

.tile:hover {
	scale: 1.02;
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

@media (prefers-reduced-motion: reduce) {
	.sheet > i {
		animation: none;
	}

	.frame.waiting .flow > .sheet-layer {
		animation: none;
	}

	.sheet-layer,
	.tile,
	.flow {
		transition: none;
	}

	[data-sheet][data-impulse]:hover > .sheet-layer {
		translate: none;
	}

	.tile:hover {
		scale: 1;
	}
}
```

```ts
// scripts/sheet-proto/proto.ts
import { caretOf } from "../../src/lib/sheet/caret";
import { impulse, startImpulses } from "../../src/lib/sheet/impulses";
import { type Mass, SPRINGS, springLinear } from "../../src/lib/sheet/springs";
import { isEraseInput, showTail } from "../../src/lib/sheet/tail";
import { remeasure } from "../../src/lib/sheet/windows";

/**
 * Прототип «Раздув»: вся страница на одном листе. Показывает идею во времени:
 * волну импульса, хвост каретки, резинку вкладок, массы слайдера, ожидание
 * ступенями, сдёргивание занавеса и «выдох».
 */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const WAIT_MS = Number(new URLSearchParams(location.search).get("wait") ?? 3600);

startImpulses();

// ── Печать: хвост листа за кареткой и лёгкая волна по полю ───────────────
const prompt = $<HTMLTextAreaElement>("prompt");
const field = $("field");
let lastWave = 0;
prompt.addEventListener("input", (e) => {
	const erase = isEraseInput((e as InputEvent).inputType);
	showTail(caretOf(prompt), erase ? -1 : 1);
	const now = performance.now();
	if (now - lastWave > 140) {
		lastWave = now;
		impulse({ source: field, sign: erase ? -1 : 1, weight: 0.15, mass: "light" });
	}
});

// ── Вкладки: индикатор тянется как резинка ──────────────────────────────
const tabsEl = $("tabs");
const ind = $("ind");
const tabs = [...tabsEl.querySelectorAll<HTMLElement>(".tab")];
let at = 0;
const offsetOf = (i: number): number =>
	tabs[i]!.getBoundingClientRect().left - tabsEl.getBoundingClientRect().left - tabsEl.clientLeft;

function settleIndicator(): void {
	ind.style.width = `${tabs[at]!.offsetWidth}px`;
	ind.style.transform = `translate(${offsetOf(at)}px,0)`;
	remeasure(ind);
}
settleIndicator();

tabs.forEach((tab, i) => {
	tab.addEventListener("click", () => {
		if (i === at) return;
		const x0 = offsetOf(at);
		const x1 = offsetOf(i);
		const forward = i > at;
		const stretch = 1 + Math.min(0.9, Math.abs(x1 - x0) / tab.offsetWidth);
		at = i;
		for (const [k, t] of tabs.entries()) t.setAttribute("aria-selected", String(k === i));
		ind.style.transform = `translate(${x1}px,0)`;
		if (!reduced) {
			for (const a of ind.getAnimations()) a.cancel();
			ind.animate(
				[
					{ transform: `translate(${x0}px,0) scaleX(1)` },
					{ transform: `translate(${(x0 + x1) / 2}px,0) scaleX(${stretch})`, offset: 0.45 },
					{ transform: `translate(${x1}px,0) scaleX(1)` },
				],
				{ duration: 560, easing: "cubic-bezier(.3,.9,.3,1)" },
			);
		}
		window.setTimeout(() => remeasure(ind), reduced ? 0 : 580);
		impulse({ source: tab, sign: forward ? 1 : -1, weight: forward ? 0.6 : 0.35 });
	});
});

// ── Слайдер «Рассуждение»: у каждого уровня своя масса ───────────────────
const slider = $("slider");
const thumb = $("thumb");
const fill = $("fill");
const NAMES = ["Среднее", "Высокое", "Очень высокое", "Максимальное"];
const MASSES: Mass[] = ["light", "medium", "medium", "heavy"];
const SNAP_MS = [180, 280, 380, 500];
let level = 1;
let pos = 0;
/** Растяжение ручки при быстром движении: scaleX в том же transform, что и сдвиг */
let stretch = 1;
let dragging = false;

const geom = () => {
	const w = slider.clientWidth;
	const tw = thumb.offsetWidth;
	return { w, tw, span: w - tw };
};
const posFor = (lv: number): number => (geom().span * lv) / 3;
const fillFor = (px: number): number => (px + geom().tw / 2) / geom().w;

function place(px: number): void {
	pos = px;
	thumb.style.transform = `translate(${px}px,0) scaleX(${stretch})`;
	fill.style.transform = `scaleX(${fillFor(px)})`;
}

function setLevel(lv: number): void {
	if (lv === level) return;
	const up = lv > level;
	level = lv;
	slider.setAttribute("aria-valuenow", String(lv));
	slider.setAttribute("aria-valuetext", NAMES[lv]!);
	impulse({ source: thumb, sign: up ? 1 : -1, weight: 0.2 + 0.2 * lv, mass: MASSES[lv]! });
}

function snap(from_stretch = 1): void {
	const from = pos;
	const target = posFor(level);
	place(target);
	if (!reduced) {
		const opts = { duration: SNAP_MS[level]!, easing: springLinear(MASSES[level]!) };
		thumb.animate(
			[{ transform: `translate(${from}px,0) scaleX(${from_stretch})` }, { transform: `translate(${target}px,0) scaleX(1)` }],
			opts,
		);
		fill.animate([{ transform: `scaleX(${fillFor(from)})` }, { transform: `scaleX(${fillFor(target)})` }], opts);
	}
	window.setTimeout(() => remeasure(thumb), reduced ? 0 : SNAP_MS[level]! + 20);
}

const pxOf = (e: PointerEvent): number => {
	const r = slider.getBoundingClientRect();
	const g = geom();
	return Math.min(g.span, Math.max(0, e.clientX - r.left - g.tw / 2));
};

function drag(e: PointerEvent): void {
	const next = pxOf(e);
	stretch = reduced ? 1 : 1 + Math.min(0.15, Math.abs(next - pos) / 60);
	place(next);
	remeasure(thumb);
	setLevel(Math.round((next / geom().span) * 3));
}

slider.addEventListener("pointerdown", (e) => {
	dragging = true;
	slider.setPointerCapture(e.pointerId);
	for (const a of [...thumb.getAnimations(), ...fill.getAnimations()]) a.cancel();
	drag(e);
});
slider.addEventListener("pointermove", (e) => {
	if (dragging) drag(e);
});
const endDrag = (): void => {
	if (!dragging) return;
	dragging = false;
	const was = stretch;
	stretch = 1;
	snap(was);
};
slider.addEventListener("pointerup", endDrag);
slider.addEventListener("pointercancel", endDrag);
slider.addEventListener("keydown", (e) => {
	if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
	setLevel(Math.min(3, Math.max(0, level + (e.key === "ArrowRight" ? 1 : -1))));
	snap();
});

place(posFor(level));
remeasure(thumb);
window.addEventListener("resize", () => {
	place(posFor(level));
	settleIndicator();
});

// ── Баланс: старое число уходит вверх, новое приходит снизу ──────────────
const numbox = $("numbox");
const num = $("num");
let balance = 42;

function roll(next: number): void {
	if (reduced) {
		num.textContent = String(next);
		return;
	}
	const incoming = document.createElement("span");
	incoming.className = "num-in";
	incoming.textContent = String(next);
	numbox.appendChild(incoming);
	num.animate(
		[
			{ transform: "translate(0,0)", opacity: 1 },
			{ transform: "translate(0,-110%)", opacity: 0 },
		],
		{ duration: 360, easing: springLinear("light"), fill: "forwards" },
	);
	incoming
		.animate(
			[
				{ transform: "translate(0,110%)", opacity: 0 },
				{ transform: "translate(0,0)", opacity: 1 },
			],
			{ duration: 360, easing: "cubic-bezier(.3,.9,.3,1)", fill: "forwards" },
		)
		.finished.then(() => {
			num.textContent = String(next);
			for (const a of num.getAnimations()) a.cancel();
			incoming.remove();
		});
}

// ── Генерация: рамка растёт, ожидание ступенями, занавес, выдох ───────────
const go = $("go");
const frame = $("frame");
const flow = $("flow");
const pic = $("pic");
const tiles = $("tiles");
const ART = [
	"radial-gradient(circle at 25% 30%, #fde047, transparent 50%), radial-gradient(circle at 75% 70%, #22d3ee, transparent 55%), #1f2a44",
	"conic-gradient(from 120deg at 50% 50%, #fb7185, #f59e0b, #34d399, #fb7185)",
];
let busy = false;
let breath: Animation | null = null;
let made = 0;

function addTile(): void {
	const tile = document.createElement("button");
	tile.className = "tile";
	tile.setAttribute("data-sheet", "ring");
	tile.setAttribute("data-impulse", "tap");
	tile.setAttribute("data-weight", "0.3");
	tile.setAttribute("aria-label", "Открыть");
	tile.style.background = ART[made++ % ART.length]!;
	tiles.prepend(tile);
	if (!reduced) {
		tile.animate(
			[
				{ opacity: 0, transform: "scale(0.9)" },
				{ opacity: 1, transform: "scale(1)" },
			],
			{ duration: 560, easing: springLinear("medium") },
		);
	}
}

function reveal(): void {
	breath?.cancel();
	breath = null;
	pic.style.opacity = "1";
	const finish = (): void => {
		flow.style.opacity = "0";
		frame.classList.remove("waiting");
		impulse({ source: frame, sign: 1, weight: 1, mass: "heavy" });
		addTile();
		busy = false;
	};
	if (reduced) {
		finish();
		return;
	}
	pic.animate([{ transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 700, easing: springLinear("heavy") });
	const curtain = flow.animate(
		[{ transform: "translate(0,0)" }, { transform: "translate(-102%,0)" }],
		{ duration: 650, easing: springLinear("heavy"), fill: "forwards" },
	);
	curtain.finished.then(() => {
		flow.style.opacity = "0";
		curtain.cancel();
		finish();
	});
}

go.addEventListener("click", () => {
	if (busy) return;
	busy = true;
	balance -= 10;
	roll(balance);
	impulse({ source: $("pill"), sign: -1, weight: 0.25, mass: "light" });
	pic.style.opacity = "0";
	frame.dataset.ready = "true";
	frame.classList.add("waiting");
	if (!reduced) {
		frame.animate(
			[
				{ transform: "scaleY(0.16)", opacity: 0 },
				{ transform: "scaleY(1)", opacity: 1 },
			],
			{ duration: SPRINGS.heavy.move, easing: springLinear("heavy") },
		);
	}
	flow.style.opacity = "0.25";
	window.setTimeout(() => {
		flow.style.opacity = "0.4";
		impulse({ source: frame, sign: 1, weight: 0.3, mass: "heavy" });
		if (!reduced) {
			breath = flow.animate([{ opacity: 0.4 }, { opacity: 0.55 }], {
				duration: 2000,
				direction: "alternate",
				iterations: Number.POSITIVE_INFINITY,
				easing: "ease-in-out",
			});
		}
	}, 800);
	window.setTimeout(reveal, WAIT_MS);
});
```

```ts
// scripts/sheet-proto.ts
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";

/**
 * Прототип «Раздув»: сборка, сценарий в Chromium с видео, замеры бюджета.
 * Результаты: captures/sheet-proto/{shots/*.png, demo.webm}. Код возврата 1 при
 * нарушении бюджета. Каталог captures/ в git не попадает.
 */
const OUT = process.env.SHEET_OUT ?? "captures/sheet-proto";
/**
 * Предел обработчика события при замедлении процессора ×4. Замер: одна пустая
 * Web-анимация в этой среде стоит 0,1–1 мс при ×4 (шум таймера), событие создаёт
 * 3–4 анимации; ≤ 1 мс из спецификации недостижимо, предел согласуется с владельцем.
 */
const COST_BUDGET_MS = 4;
/**
 * Слои композитора. Каркас страницы (корень, прокрутка документа, тело, дрейф
 * фона) — 6; при записи видео браузер добавляет ещё один. Ожидание добавляет
 * четыре (рамка, поток, его дрейф, картинка). Без записи: 6 и 10.
 */
const IDLE_LAYERS = 7;
const WAIT_LAYERS = 11;
const SITE = path.join(OUT, "site");
const SHOTS = path.join(OUT, "shots");
const ROOT = path.resolve(SITE);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const built = await Bun.build({ entrypoints: ["scripts/sheet-proto/index.html"], outdir: SITE });
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

async function findChromium(): Promise<string> {
	const candidates = [
		process.env.CHROMIUM_PATH,
		"/opt/pw-browsers/chromium",
		"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
	].filter(Boolean) as string[];
	for (const p of candidates) if (await Bun.file(p).exists()) return p;
	throw new Error("Chromium не найден: задайте CHROMIUM_PATH");
}

const rows: Array<{ name: string; value: string; ok: boolean }> = [];
function check(name: string, value: number, ok: boolean, unit = ""): void {
	rows.push({ name, value: `${Math.round(value * 100) / 100}${unit}`, ok });
}

async function open(browser: Browser, opts: { video?: boolean; reduced?: boolean } = {}) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 960 },
		reducedMotion: opts.reduced ? "reduce" : "no-preference",
		...(opts.video ? { recordVideo: { dir: path.join(OUT, "video"), size: { width: 1280, height: 960 } } } : {}),
	});
	const page = await context.newPage();
	await page.addInitScript(() => {
		const w = window as unknown as { __raf: number };
		w.__raf = 0;
		const original = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (cb: FrameRequestCallback) => {
			w.__raf++;
			return original(cb);
		};
	});
	await page.goto(`http://localhost:${server.port}/`);
	await page.waitForSelector("#go");
	return { context, page };
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const animations = (page: Page) => page.evaluate(() => document.getAnimations().length);
const rafCount = (page: Page) => page.evaluate(() => (window as unknown as { __raf: number }).__raf);

const browser = await chromium.launch({ executablePath: await findChromium(), args: ["--no-sandbox"] });
try {
	// ── Основной сценарий с видео ────────────────────────────────────────
	const { context, page } = await open(browser, { video: true });
	const cdp = await context.newCDPSession(page);
	let layers = 0;
	cdp.on("LayerTree.layerTreeDidChange", (e: { layers?: unknown[] }) => {
		layers = e.layers?.length ?? layers;
	});
	await cdp.send("LayerTree.enable");

	await pause(page, 1500);
	check("простой: активных анимаций (только дрейф фона)", await animations(page), (await animations(page)) <= 1);
	const raf0 = await rafCount(page);
	await pause(page, 2000);
	check("простой: вызовов requestAnimationFrame за 2 с", (await rafCount(page)) - raf0, (await rafCount(page)) === raf0);
	check("простой: слоёв композитора", layers, layers <= IDLE_LAYERS);
	await shot(page, "01-idle"); // снимок экрана сам меняет слои, поэтому после замера

	// стоимость события при замедлении процессора ×4
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
	const samples: number[] = [];
	for (let i = 0; i < 5; i++) {
		samples.push(
			await page.evaluate(() => {
				const el = document.querySelector(".chip")!;
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

	// наведение и нажатие: волна доходит до остальных окон
	await page.hover("#go");
	await pause(page, 350);
	await shot(page, "02-hover");
	const chip = (await page.locator(".chip").boundingBox())!;
	await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
	await page.mouse.down();
	await pause(page, 70);
	await shot(page, "03-press");
	await page.mouse.up();
	await pause(page, 160);
	await shot(page, "04-wave");
	await pause(page, 1200);

	// печать: хвост листа за кареткой
	await page.click("#prompt");
	await page.keyboard.type("кот в короне едет на золотом тракторе", { delay: 55 });
	await shot(page, "05-typing");
	await page.keyboard.press("Backspace");
	await page.keyboard.press("Backspace");
	await page.keyboard.press("Backspace");
	await shot(page, "06-erasing");
	await pause(page, 900);

	// вкладка: резинка индикатора
	await page.getByRole("tab", { name: "Турбо" }).click();
	await pause(page, 170);
	await shot(page, "07-tab-mid");
	await pause(page, 900);

	// слайдер: до «Максимального» и обратно
	const slider = (await page.locator("#slider").boundingBox())!;
	const thumb = (await page.locator("#thumb").boundingBox())!;
	await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
	await page.mouse.down();
	await page.mouse.move(slider.x + slider.width - thumb.width / 2, slider.y + slider.height / 2, { steps: 16 });
	await pause(page, 140);
	await shot(page, "08-slider-max");
	await page.mouse.up();
	await pause(page, 900);
	const thumb2 = (await page.locator("#thumb").boundingBox())!;
	await page.mouse.move(thumb2.x + thumb2.width / 2, thumb2.y + thumb2.height / 2);
	await page.mouse.down();
	await page.mouse.move(slider.x + thumb.width / 2, slider.y + slider.height / 2, { steps: 16 });
	await pause(page, 140);
	await shot(page, "09-slider-min");
	await page.mouse.up();
	await pause(page, 900);

	// генерация: рамка растёт, ожидание, занавес, выдох
	await page.click("#go");
	await pause(page, 250);
	await shot(page, "10-frame-grows");
	// волны от старта и приёма запроса к этому моменту затухли: считаем слои ожидания
	await pause(page, 2650);
	check("ожидание: слоёв композитора", layers, layers <= WAIT_LAYERS);
	await shot(page, "11-waiting");
	await pause(page, 700);
	await shot(page, "12-curtain");
	await pause(page, 450);
	await shot(page, "13-curtain-late");
	await pause(page, 1600);
	await shot(page, "14-final");
	const raf1 = await rafCount(page);
	await pause(page, 1000);
	check("после всего: вызовов requestAnimationFrame за 1 с", (await rafCount(page)) - raf1, (await rafCount(page)) === raf1);

	const videoPath = await page.video()?.path();
	await context.close();
	if (videoPath) renameSync(videoPath, path.join(OUT, "demo.webm"));

	// ── reduced-motion: ничего не движется ───────────────────────────────
	const rm = await open(browser, { reduced: true });
	await pause(rm.page, 800);
	check("reduced-motion: анимаций в покое", await animations(rm.page), (await animations(rm.page)) === 0);
	await rm.page.click("#go");
	await pause(rm.page, 900);
	const moving = await rm.page.evaluate(() =>
		document
			.getAnimations()
			.filter((a) => {
				const props = (a.effect as KeyframeEffect | null)?.getKeyframes().flatMap((k) => Object.keys(k)) ?? [];
				return props.some((p) => p === "transform" || p === "scale" || p === "translate");
			}).length,
	);
	check("reduced-motion: анимаций движения после нажатия", moving, moving === 0);
	await rm.context.close();
} finally {
	await browser.close();
	server.stop(true);
	rmSync(path.join(OUT, "video"), { recursive: true, force: true });
}

for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.value}`);
console.log(`скриншоты: ${SHOTS}`, readdirSync(SHOTS).length, "шт.; видео: " + path.join(OUT, "demo.webm"));
if (rows.some((r) => !r.ok)) process.exit(1);
console.log("бюджет выдержан");
```

В `package.json` добавить скрипт и зависимость:

```bash
bun add -d playwright-core@1.56.1
uv run - <<'EOF'
import json, pathlib
p = pathlib.Path("package.json")
d = json.loads(p.read_text())
d["scripts"]["sheet:proto"] = "bun scripts/sheet-proto.ts"
p.write_text(json.dumps(d, indent="\t", ensure_ascii=False) + "\n")
EOF
```

- [ ] **Step 4: Запустить тест CSS, типы и прототип**

```bash
bun test src/lib/__tests__/sheet-proto-css.test.ts
bun run typecheck
bun run sheet:proto
```
Expected: тест PASS; типы без ошибок; прототип печатает строки с `✓`, затем «бюджет выдержан». Затем открыть и просмотреть скриншоты в `captures/sheet-proto/shots/` инструментом `Read` (всего 14): проверить глазами по критериям спецификации. Если строка с `✗`:
- «простой: активных анимаций» > 1: найти лишнюю бесконечную анимацию (`document.getAnimations()` в консоли страницы), убрать;
- «реакция на событие» выше `COST_BUDGET_MS`: снизить `WAVE_LIMIT` (Task 3) или `MAX_ACTIVE` (Task 5) и повторить, зафиксировав измеренное значение; бюджет не ослаблять без согласования с владельцем;
- «слоёв композитора» выше предела (`IDLE_LAYERS`, `WAIT_LAYERS`): убрать лишний `will-change`/слой;
- шов окон с фоном виден на скриншоте (цвет кнопки «обрывается» относительно соседнего фона): проверить `measure` для этого окна (`--wx/--wy`) и вызвать `remeasure` после его перемещения.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add scripts/sheet-proto scripts/sheet-proto.ts src/lib/__tests__/sheet-proto-css.test.ts package.json bun.lock
git commit -m "Раздув: живой прототип на листе со сценарием, замерами бюджета и видео" -m "$TRAILER"
```

---

### Task 7: Приёмка владельцем и уточнение спецификации

**Files:**
- Modify: `docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md` (раздел «Уточнения при планировании»)

**Interfaces:**
- Consumes: результаты Task 6 (таблица замеров, скриншоты, видео).
- Produces: решение владельца «принять / поправить»; основание для Плана 2.

- [ ] **Step 1: Дописать в спецификацию уточнения, найденные при планировании** (раздел добавляется в конец файла):

```markdown
## Уточнения при планировании (План 1)

- **Геометрия листа.** Градиент 135° на квадратной плитке 1600×1600 px (вместо 115°): при угле угол-в-угол и двух палиндромных волнах на плитку цвет зависит только от (x + y) с периодом в сторону плитки, поэтому плитки стыкуются без шва по обеим осям, а окно выравнивается со страницей смещением `background-position`. Окно — элемент с `overflow: hidden` и **дочерним слоем-элементом** `.sheet-layer` с текстурой листа (не псевдоэлементом: анимация псевдоэлемента через Web Animations в ≈ 9 раз дороже — замер 0,9 мс против 0,1 мс на 14 окон); импульс двигает только `transform` этого слоя (`composite: add`). Геометрия окон кешируется (ResizeObserver, MutationObserver), в обработчике события раскладка не читается.
- **Доля хребта в фоне** 0,075 (вместо ≈ 0,078): фон L ≈ 0,0174, запас от предела 0,018.
- **Индикатор вкладок** — окно **хребта**, а не спектра: под ним стоит белый текст активной вкладки, а спектр под текстом запрещён.
- **Дрейф фона** ±40 px по диагонали с периодом 90 с: бóльшая амплитуда рассинхронизирует фон со статичными окнами.
- **Наведение** — CSS-свойство `translate` слоя окна с лёгкой пружиной (отдельно от `transform`, которым пользуются импульсы).
- **Только 2D-transform.** Статичный `translate3d` делает слой композитным и в покое (замер: 10 слоёв вместо ≤ 6), поэтому везде `translate(x,y)`. Свойство `scale` для вытягивания ручки слайдера и индикатора вкладок не используется: оно складывается с `transform`, поэтому растяжение пишется `scaleX` в том же `transform`.
- **Ожидание**: сервер не сообщает стадии генерации (изменения бэкенда вне объёма), поэтому ступеней яркости две и обе наблюдаемы клиентом: запрос отправлен (0,25) и принят (0,4, для «Турбо» — ответ 202 с идентификатором); дальше рамка дышит. Расширение до реальных серверных стадий — отдельная задача с полем в API.
- **Источник импульса** не получает деформации `scale` от волны (у него своя: сжатие 0,97 → выход 1,03).
- **Бюджет по замерам прототипа (требуется подтверждение владельца).** Обработчик события при замедлении ×4: медиана 1,8–3,3 мс (предел в прототипе 4 мс; в спецификации было ≤ 1 мс — недостижимо: пустая Web-анимация стоит здесь 0,1–1 мс при ×4, а событие создаёт 3–4; без замедления ≈ 0,5–0,7 мс). Волна для дальних окон создаётся по таймеру в момент прихода, поэтому стоимость обработчика не растёт с числом окон. Слои композитора: каркас страницы 6 (7 при записи видео), при ожидании +4.
```

Применить скриптом (добавляет раздел, если его ещё нет):

```bash
uv run - <<'EOF'
import pathlib
p = pathlib.Path("docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md")
s = p.read_text()
marker = "## Уточнения при планировании (План 1)"
assert marker not in s
section = """

## Уточнения при планировании (План 1)

- **Геометрия листа.** Градиент 135° на квадратной плитке 1600×1600 px (вместо 115°): при угле угол-в-угол и двух палиндромных волнах на плитку цвет зависит только от (x + y) с периодом в сторону плитки, поэтому плитки стыкуются без шва по обеим осям, а окно выравнивается со страницей смещением `background-position`. Окно — элемент с `overflow: hidden` и **дочерним слоем-элементом** `.sheet-layer` с текстурой листа (не псевдоэлементом: анимация псевдоэлемента через Web Animations в ≈ 9 раз дороже — замер 0,9 мс против 0,1 мс на 14 окон); импульс двигает только `transform` этого слоя (`composite: add`). Геометрия окон кешируется (ResizeObserver, MutationObserver), в обработчике события раскладка не читается.
- **Доля хребта в фоне** 0,075 (вместо ≈ 0,078): фон L ≈ 0,0174, запас от предела 0,018.
- **Индикатор вкладок** — окно **хребта**, а не спектра: под ним стоит белый текст активной вкладки, а спектр под текстом запрещён.
- **Дрейф фона** ±40 px по диагонали с периодом 90 с: бóльшая амплитуда рассинхронизирует фон со статичными окнами.
- **Наведение** — CSS-свойство `translate` слоя окна с лёгкой пружиной (отдельно от `transform`, которым пользуются импульсы).
- **Только 2D-transform.** Статичный `translate3d` делает слой композитным и в покое (замер: 10 слоёв вместо ≤ 6), поэтому везде `translate(x,y)`. Свойство `scale` для вытягивания ручки слайдера и индикатора вкладок не используется: оно складывается с `transform`, поэтому растяжение пишется `scaleX` в том же `transform`.
- **Ожидание**: сервер не сообщает стадии генерации (изменения бэкенда вне объёма), поэтому ступеней яркости две и обе наблюдаемы клиентом: запрос отправлен (0,25) и принят (0,4, для «Турбо» — ответ 202 с идентификатором); дальше рамка дышит. Расширение до реальных серверных стадий — отдельная задача с полем в API.
- **Источник импульса** не получает деформации `scale` от волны (у него своя: сжатие 0,97 → выход 1,03).
- **Бюджет по замерам прототипа (требуется подтверждение владельца).** Обработчик события при замедлении ×4: медиана 1,8–3,3 мс (предел в прототипе 4 мс; в спецификации было ≤ 1 мс — недостижимо: пустая Web-анимация стоит здесь 0,1–1 мс при ×4, а событие создаёт 3–4; без замедления ≈ 0,5–0,7 мс). Волна для дальних окон создаётся по таймеру в момент прихода, поэтому стоимость обработчика не растёт с числом окон. Слои композитора: каркас страницы 6 (7 при записи видео), при ожидании +4.
"""
p.write_text(s.rstrip("\n") + "\n" + section)
EOF
```

- [ ] **Step 2: Показать владельцу результат**

Отправить владельцу видео `captures/sheet-proto/demo.webm` и 4–6 ключевых скриншотов (`01-idle`, `04-wave`, `05-typing`, `08-slider-max`, `12-curtain`, `14-final`) через `SendUserFile`, приложить таблицу замеров из вывода `bun run sheet:proto` и повторить три решения по умолчанию из раздела 11 спецификации. **Дальше не идти, пока владелец не ответит «принято» или не пришлёт правки.** Правки вносятся в Task 1–6 (палитра, пружины, CSS прототипа) по тем же шагам, с повторным прогоном `bun run sheet:proto`.

- [ ] **Step 3: Коммит уточнений**

```bash
git add docs/superpowers/specs/2026-10-11-design-system-razdyv-design.md
git commit -m "Раздув: уточнения спецификации по итогам планирования основы" -m "$TRAILER"
git push -u origin claude/github-issue-17-w7b2eq
```

- [ ] **Step 4: После приёмки — написать План 2** (скилл `writing-plans`) на перенос системы в `src/index.css`, примитивы shadcn, экраны, текстовую диету, тест-стражи покрытия, документацию. Его материалы: принятые прототип и замеры, таблица спецификации раздела 5, список замен текста раздела 3.
