# Спецэффекты и анимации Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Единый «живой» интерфейс gen42: новый фон `Stage`, canvas-движок частиц с блёстками из каретки, эффекты состояний во всех базовых компонентах, переделанный слайдер «Рассуждение», реакции на действия на всех экранах.

**Architecture:** Движок частиц в `src/lib/fx/` (чистые модули над типизированными массивами, тестируются `bun test`) + тонкая DOM-обвязка (`FxCanvas`, глобальные слушатели с `data-fx`). Фон `Stage` целиком на CSS-слоях с запечёнными SVG-тайлами (двигает композитор). Эффекты состояний вшиты в компоненты shadcn, а тест-страж не даёт появиться интерактивному элементу без `data-fx`.

**Tech Stack:** Bun (`bun test`, сборка HTML imports), React 19, Tailwind v4, shadcn/ui (radix), Tabler Icons, Canvas 2D, CSS (`transform`/`opacity`/individual `translate`), Playwright (только для замеров).

**Spec:** `docs/superpowers/specs/2026-10-11-special-effects-design.md`

## Global Constraints

- Bun вместо Node: `bun test`, `bun run <script>`, `bunx`. Одноразовые скрипты на Python — только `uv run`.
- Любые правки UI — по скиллу `shadcn` (`.agents/skills/shadcn/`): канонические примитивы, `cn()` из `@/lib/utils`, `gap-*` вместо `space-*`, `size-*`, иконки Tabler (`@tabler/icons-react`), семантические токены. Самописных аналогов shadcn-компонентов не писать; новые компоненты — только если примитива нет.
- Язык интерфейса и комментариев в коде — русский; в пользовательских текстах нет технических подробностей.
- Форматирование — biome (табы). Перед каждым коммитом: `bun run lint:fix`, затем `bun run lint` без замечаний; `bun run typecheck` без ошибок (в том числе предсуществующих в тронутых файлах).
- Каждый коммит: `git commit -m "<сообщение по-русски>" -m "$TRAILER"`, где в сессии один раз задано
  `export TRAILER=$'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_013hZ8T6WPS3CEH12uHr6s3b'`.
- Работа идёт на ветке `claude/github-issue-17-w7b2eq`; в `main` не мержить; артефакты прогонов (`captures/`, трассы) в коммит не класть.
- Бюджет (приёмка, из спецификации): в простое 0 кадров отрисовки canvas и 0 вызовов `requestAnimationFrame` от эффектов; на пике эффектов в среднем не более 4 мс скриптов на кадр; ни одной аллокации в цикле частиц (пул из типизированных массивов); композитных слоёв фона не более 8.
- Запрещено в постоянном фоне: `filter`, `mix-blend-mode`, `backdrop-filter`, анимация `box-shadow`/`background-position`/`@property`-переменных (всё это идёт через главный поток). Постоянно анимировать только `transform`, `translate`, `opacity`. Размытие дальних объектов запекается в SVG-тайл.
- `prefers-reduced-motion: reduce`: никаких частиц, дрейфа и параллакса; вместо них короткая статичная вспышка `data-fx-pulse` на `Stage` (только на разовые события: нажатие, успех, ошибка, отказ, результат; не на ввод текста).
- Читаемость: худший случай (яркий объект ближнего слоя под текстом) обязан давать контраст текста не ниже WCAG AA 4.5:1 — это проверяет тест в Task 10.
- Нельзя `import … from "bun"` в коде, достижимом из `workflows/**` и `src/lib/**` бэкенда; модули `src/lib/fx/**` — только для браузера и не импортируются сервером.
- Новые и изменённые поведение, контракты и договорённости фиксируются в `AGENTS.md` и `README.md` (Task 14).

---

## Структура файлов

**Создаются:**

| Файл | Ответственность |
|---|---|
| `src/lib/fx/rng.ts` | Детерминированный PRNG (mulberry32) |
| `src/lib/fx/tables.ts` | Таблицы sin/cos, плавности, пружины (считаются один раз) |
| `src/lib/fx/pool.ts` | Пул частиц в типизированных массивах, шаг, границы, объединение прямоугольников |
| `src/lib/fx/sprites.ts` | Константы спрайтов и раскладка атласа |
| `src/lib/fx/budget.ts` | Токен-бакет: лимит событий в секунду |
| `src/lib/fx/level.ts` | `levelSpec(index)`: параметры эффектов уровня рассуждения |
| `src/lib/fx/effects.ts` | Эмиттеры частиц (блёстки, пыль, взрыв, салют, монеты, периметр) |
| `src/lib/fx/bus.ts` | Типы событий и шина `fxBus` |
| `src/lib/fx/dispatch.ts` | Соответствие «событие → эмиттер» с бюджетом |
| `src/lib/fx/engine.ts` | Цикл `requestAnimationFrame`, засыпает без частиц, статистика кадров |
| `src/lib/fx/atlas.ts` | Запекание атласа спрайтов (canvas) |
| `src/lib/fx/renderer.ts` | Отрисовка пула в canvas по dirty-rect |
| `src/lib/fx/caret.ts` | Положение каретки в `textarea`/`input` |
| `src/lib/fx/bindings.ts` | Глобальные слушатели, `data-fx`, параллакс |
| `src/lib/fx/dom.ts` | `emitAt`, `flashAttr`, `setStageAttr` |
| `src/lib/fx/scatter.ts` | Равномерная раскладка точек на торе (best-candidate) |
| `src/lib/fx/decor.ts` | SVG-объекты декора (10 видов × 3 цвета) |
| `src/lib/fx/tile.ts` | Сборка SVG-тайла слоя глубины из объектов и пыли |
| `src/components/FxCanvas.tsx` | Canvas событий, подключение движка и слушателей |
| `src/components/Stage.tsx` | Фон: слои, свет за курсором, вспышка |
| `src/components/ReasoningSlider.tsx` | Слайдер «Рассуждение» с кристаллом-бегунком |
| `src/lib/__tests__/fx-*.test.ts` | Тесты модулей и тест-страж покрытия |
| `scripts/fx-perf.ts` | Замеры Chromium (простой, пик, число слоёв) |

**Меняются:** `src/index.css`, `src/components/App.tsx`, `src/components/Auth.tsx`, `src/components/Admin.tsx`, `src/components/Generate.tsx`, `src/components/QuotaBar.tsx`, `src/components/ui/{button,input,textarea,tabs,select,dropdown-menu,slider,table,input-group}.tsx`, `package.json` (dev-зависимость `playwright-core`), `AGENTS.md`, `README.md`.

**Удаляются:** `src/components/DecoScatter.tsx`, `src/components/graphics-bg.tsx`.

> Отклонение от спецификации (осознанное): «кристальная пыль» и «наклейки» собраны в один SVG-тайл на каждую из трёх глубин (объекты и мелкая пыль в одном изображении). Это три композитных слоя вместо шести и укладывается в «6–8 слоёв» приёмки.

---

### Task 1: Основа — PRNG и таблицы

**Files:**
- Create: `src/lib/fx/rng.ts`
- Create: `src/lib/fx/tables.ts`
- Test: `src/lib/__tests__/fx-tables.test.ts`

**Interfaces:**
- Produces: `createRng(seed: number): () => number` (значения в `[0, 1)`); `sinT(turns: number): number`, `cosT(turns: number): number` (угол в оборотах, любой знак); `easeOut(t: number): number` (`t` зажимается в `[0, 1]`); `SPRING_UNIT: Float32Array` (25 значений, первое = 1); `springOffsets(amplitude: number): number[]`.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-tables.test.ts
import { describe, expect, test } from "bun:test";
import { createRng } from "../fx/rng";
import {
	cosT,
	easeOut,
	SPRING_UNIT,
	sinT,
	springOffsets,
} from "../fx/tables";

describe("createRng", () => {
	test("один seed даёт одну последовательность", () => {
		const a = createRng(42);
		const b = createRng(42);
		for (let i = 0; i < 20; i++) expect(a()).toBe(b());
	});

	test("разные seed дают разные последовательности", () => {
		expect(createRng(1)()).not.toBe(createRng(2)());
	});

	test("значения в [0, 1) и среднее около 0,5", () => {
		const r = createRng(7);
		let sum = 0;
		for (let i = 0; i < 5000; i++) {
			const v = r();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
			sum += v;
		}
		expect(Math.abs(sum / 5000 - 0.5)).toBeLessThan(0.03);
	});
});

describe("таблицы углов", () => {
	test("sinT и cosT в узловых точках", () => {
		expect(sinT(0)).toBeCloseTo(0, 5);
		expect(sinT(0.25)).toBeCloseTo(1, 5);
		expect(sinT(0.125)).toBeCloseTo(Math.SQRT1_2, 4);
		expect(cosT(0)).toBeCloseTo(1, 5);
		expect(cosT(0.5)).toBeCloseTo(-1, 5);
	});

	test("отрицательные обороты и обороты больше единицы", () => {
		expect(sinT(-0.25)).toBeCloseTo(-1, 5);
		expect(sinT(1.25)).toBeCloseTo(1, 5);
	});
});

describe("easeOut", () => {
	test("границы, монотонность, значение в середине", () => {
		expect(easeOut(0)).toBe(0);
		expect(easeOut(1)).toBe(1);
		expect(easeOut(-3)).toBe(0);
		expect(easeOut(9)).toBe(1);
		expect(easeOut(0.5)).toBeCloseTo(0.875, 2);
		let prev = 0;
		for (let i = 1; i <= 20; i++) {
			const v = easeOut(i / 20);
			expect(v).toBeGreaterThanOrEqual(prev);
			prev = v;
		}
	});
});

describe("пружина", () => {
	test("25 отсчётов: начинается с амплитуды, затухает к нулю", () => {
		expect(SPRING_UNIT.length).toBe(25);
		const o = springOffsets(10);
		expect(o.length).toBe(25);
		expect(o[0]).toBe(10);
		expect(Math.abs(o[24] ?? 1)).toBeLessThan(0.1);
	});

	test("колеблется: меняет знак", () => {
		const o = springOffsets(1);
		expect(o.some((v) => v < 0)).toBe(true);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-tables.test.ts`
Expected: FAIL (`Cannot find module '../fx/rng'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/rng.ts
/** Детерминированный генератор mulberry32: тот же seed — та же последовательность. */
export function createRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
```

```ts
// src/lib/fx/tables.ts
/**
 * Таблицы вместо вычислений (приём Doom: finesine/finetangent). Всё считается
 * один раз при загрузке модуля; в цикле частиц нет ни Math.sin, ни кривых.
 * Углы задаются в оборотах (1 = полный круг).
 */
export const TABLE_SIZE = 1024;
const MASK = TABLE_SIZE - 1;

export const SIN = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
	SIN[i] = Math.sin((i / TABLE_SIZE) * Math.PI * 2);
}

export function sinT(turns: number): number {
	return SIN[(turns * TABLE_SIZE) & MASK]!;
}

export function cosT(turns: number): number {
	return SIN[(turns * TABLE_SIZE + TABLE_SIZE / 4) & MASK]!;
}

const EASE_SIZE = 256;
const EASE_OUT = new Float32Array(EASE_SIZE + 1);
for (let i = 0; i <= EASE_SIZE; i++) {
	const t = i / EASE_SIZE;
	EASE_OUT[i] = 1 - (1 - t) ** 3;
}

/** Плавное замедление к концу (easeOutCubic), t в [0, 1]. */
export function easeOut(t: number): number {
	const c = t < 0 ? 0 : t > 1 ? 1 : t;
	return EASE_OUT[(c * EASE_SIZE + 0.5) | 0]!;
}

/** Затухающая пружина: доля амплитуды в 25 равных моментах от 0 до 1. */
export const SPRING_UNIT = new Float32Array(25);
for (let i = 0; i < SPRING_UNIT.length; i++) {
	const t = i / (SPRING_UNIT.length - 1);
	SPRING_UNIT[i] = Math.exp(-5 * t) * Math.cos(11 * t);
}

/** Отсчёты смещения для Web Animations (импульс amplitude, возврат с колебанием). */
export function springOffsets(amplitude: number): number[] {
	const out: number[] = [];
	for (let i = 0; i < SPRING_UNIT.length; i++) {
		out.push(amplitude * SPRING_UNIT[i]!);
	}
	return out;
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-tables.test.ts`
Expected: PASS (все тесты)

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/rng.ts src/lib/fx/tables.ts src/lib/__tests__/fx-tables.test.ts
git commit -m "Спецэффекты: детерминированный PRNG и таблицы sin/cos, плавности, пружины" -m "$TRAILER"
```

---

### Task 2: Пул частиц, спрайты, бюджет

**Files:**
- Create: `src/lib/fx/pool.ts`
- Create: `src/lib/fx/sprites.ts`
- Create: `src/lib/fx/budget.ts`
- Test: `src/lib/__tests__/fx-pool.test.ts`

**Interfaces:**
- Produces:
  - `pool.ts`: `interface Rect { x: number; y: number; w: number; h: number }`; `const KIND = { SPARKLE: 0, DUST: 1, SHARD: 2 }`; `interface Pool { capacity; count; x; y; vx; vy; life; maxLife; grav: Float32Array; sprite; kind: Uint8Array }`; `createPool(capacity): Pool`; `spawn(pool, kind, sprite, x, y, vx, vy, life, grav): boolean`; `step(pool, dt, gravity): void`; `newRect(): Rect`; `bounds(pool, margin, out: Rect): boolean` (пишет в `out`, `false` — частиц нет); `unionInto(out: Rect, a: Rect | null, b: Rect | null): boolean` (пишет в `out`, `false` — оба `null`); `clearPool(pool): void`.
  - `sprites.ts`: `FRAMES = 8`, `CELL = 32`, `SPARKLE_COLORS`, `SPARKLE_SIZES`, `SPRITE = { DUST: 9, SHARD: 10 }`, `SPRITE_COUNT = 11`, `sparkleSprite(color: 0|1|2, size: 0|1|2): number`, `spriteRect(sprite, frame, scale?): { sx; sy; size }`, `atlasSize(scale?): { w; h }`.
  - `budget.ts`: `interface Budget { take(n: number, nowMs: number): number }`, `createBudget(perSecond: number, burst?: number): Budget`.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-pool.test.ts
import { describe, expect, test } from "bun:test";
import { createBudget } from "../fx/budget";
import {
	bounds,
	clearPool,
	createPool,
	KIND,
	newRect,
	spawn,
	step,
	unionInto,
} from "../fx/pool";
import {
	atlasSize,
	CELL,
	FRAMES,
	SPRITE_COUNT,
	sparkleSprite,
	spriteRect,
} from "../fx/sprites";

describe("пул частиц", () => {
	test("spawn заполняет пул до ёмкости и затем отказывает", () => {
		const p = createPool(4);
		for (let i = 0; i < 4; i++) {
			expect(spawn(p, KIND.SPARKLE, 0, i, 0, 0, 0, 1, 0)).toBe(true);
		}
		expect(spawn(p, KIND.SPARKLE, 0, 9, 0, 0, 0, 1, 0)).toBe(false);
		expect(p.count).toBe(4);
	});

	test("step двигает частицу по скорости", () => {
		const p = createPool(2);
		spawn(p, KIND.SPARKLE, 0, 0, 0, 100, 0, 1, 0);
		step(p, 0.1, 0);
		expect(p.x[0]).toBeCloseTo(10, 4);
	});

	test("гравитация тянет вниз пропорционально grav", () => {
		const p = createPool(2);
		spawn(p, KIND.SPARKLE, 0, 0, 0, 0, 0, 1, 1);
		spawn(p, KIND.DUST, 0, 0, 0, 0, 0, 1, 0);
		step(p, 0.1, 400);
		expect(p.vy[0]).toBeCloseTo(35.2, 3);
		expect(p.vy[1]).toBeCloseTo(0, 5);
	});

	test("умершая частица удаляется, выжившая остаётся целой", () => {
		const p = createPool(4);
		spawn(p, KIND.SPARKLE, 1, 5, 5, 0, 0, 0.05, 0);
		spawn(p, KIND.SHARD, 2, 77, 8, 0, 0, 1, 0);
		step(p, 0.1, 0);
		expect(p.count).toBe(1);
		expect(p.x[0]).toBeCloseTo(77, 4);
		expect(p.sprite[0]).toBe(2);
		expect(p.kind[0]).toBe(KIND.SHARD);
	});

	test("bounds пишет прямоугольник с полем в out без выделений", () => {
		const p = createPool(2);
		const out = newRect();
		expect(bounds(p, 10, out)).toBe(false);
		spawn(p, KIND.SPARKLE, 0, 100, 50, 0, 0, 1, 0);
		expect(bounds(p, 10, out)).toBe(true);
		expect(out).toEqual({ x: 90, y: 40, w: 20, h: 20 });
		spawn(p, KIND.SPARKLE, 0, 120, 70, 0, 0, 1, 0);
		expect(bounds(p, 10, out)).toBe(true);
		expect(out).toEqual({ x: 90, y: 40, w: 40, h: 40 });
	});

	test("unionInto объединяет и терпит null", () => {
		const out = newRect();
		expect(unionInto(out, null, null)).toBe(false);
		const a = { x: 0, y: 0, w: 10, h: 10 };
		expect(unionInto(out, a, null)).toBe(true);
		expect(out).toEqual(a);
		expect(unionInto(out, a, { x: 20, y: 5, w: 10, h: 10 })).toBe(true);
		expect(out).toEqual({ x: 0, y: 0, w: 30, h: 15 });
	});

	test("clearPool обнуляет счётчик", () => {
		const p = createPool(2);
		spawn(p, KIND.DUST, 0, 0, 0, 0, 0, 1, 0);
		clearPool(p);
		expect(p.count).toBe(0);
	});
});

describe("спрайты и атлас", () => {
	test("раскладка: все ячейки уникальны и внутри атласа", () => {
		const seen = new Set<string>();
		const { w, h } = atlasSize(2);
		for (let s = 0; s < SPRITE_COUNT; s++) {
			for (let f = 0; f < FRAMES; f++) {
				const r = spriteRect(s, f, 2);
				expect(r.size).toBe(CELL * 2);
				expect(r.sx + r.size).toBeLessThanOrEqual(w);
				expect(r.sy + r.size).toBeLessThanOrEqual(h);
				seen.add(`${r.sx},${r.sy}`);
			}
		}
		expect(seen.size).toBe(SPRITE_COUNT * FRAMES);
	});

	test("sparkleSprite: 9 блёсток, цвет × размер", () => {
		expect(sparkleSprite(0, 0)).toBe(0);
		expect(sparkleSprite(1, 2)).toBe(5);
		expect(sparkleSprite(2, 2)).toBe(8);
	});
});

describe("бюджет событий", () => {
	test("всплеск до burst, затем по токену в 1/perSecond", () => {
		const b = createBudget(10, 5);
		expect(b.take(5, 0)).toBe(5);
		expect(b.take(1, 0)).toBe(0);
		expect(b.take(1, 100)).toBe(1);
		expect(b.take(100, 10000)).toBe(5);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-pool.test.ts`
Expected: FAIL (`Cannot find module '../fx/pool'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/pool.ts
/**
 * Пул частиц: структура массивов (SoA) фиксированной ёмкости. В цикле ни
 * объектов, ни выделений памяти — сборщик мусора не просыпается. Мёртвые
 * частицы удаляются заменой последней (порядок не важен).
 */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export const KIND = { SPARKLE: 0, DUST: 1, SHARD: 2 } as const;

export interface Pool {
	readonly capacity: number;
	count: number;
	readonly x: Float32Array;
	readonly y: Float32Array;
	readonly vx: Float32Array;
	readonly vy: Float32Array;
	readonly life: Float32Array;
	readonly maxLife: Float32Array;
	/** Множитель гравитации: 0 — не падает (пыль), 1 — полностью */
	readonly grav: Float32Array;
	readonly sprite: Uint8Array;
	readonly kind: Uint8Array;
}

export function createPool(capacity: number): Pool {
	return {
		capacity,
		count: 0,
		x: new Float32Array(capacity),
		y: new Float32Array(capacity),
		vx: new Float32Array(capacity),
		vy: new Float32Array(capacity),
		life: new Float32Array(capacity),
		maxLife: new Float32Array(capacity),
		grav: new Float32Array(capacity),
		sprite: new Uint8Array(capacity),
		kind: new Uint8Array(capacity),
	};
}

export function spawn(
	pool: Pool,
	kind: number,
	sprite: number,
	x: number,
	y: number,
	vx: number,
	vy: number,
	life: number,
	grav: number,
): boolean {
	if (pool.count >= pool.capacity) return false;
	const i = pool.count++;
	pool.x[i] = x;
	pool.y[i] = y;
	pool.vx[i] = vx;
	pool.vy[i] = vy;
	pool.life[i] = life;
	pool.maxLife[i] = life;
	pool.grav[i] = grav;
	pool.sprite[i] = sprite;
	pool.kind[i] = kind;
	return true;
}

function copyDown(pool: Pool, from: number, to: number): void {
	pool.x[to] = pool.x[from]!;
	pool.y[to] = pool.y[from]!;
	pool.vx[to] = pool.vx[from]!;
	pool.vy[to] = pool.vy[from]!;
	pool.life[to] = pool.life[from]!;
	pool.maxLife[to] = pool.maxLife[from]!;
	pool.grav[to] = pool.grav[from]!;
	pool.sprite[to] = pool.sprite[from]!;
	pool.kind[to] = pool.kind[from]!;
}

/** Шаг физики. `gravity` — px/с²; сопротивление воздуха линейное, считается раз на шаг. */
export function step(pool: Pool, dt: number, gravity: number): void {
	const drag = 1 - 1.2 * dt;
	let i = 0;
	while (i < pool.count) {
		const life = pool.life[i]! - dt;
		if (life <= 0) {
			pool.count--;
			if (i < pool.count) copyDown(pool, pool.count, i);
			continue;
		}
		pool.life[i] = life;
		pool.vy[i] = pool.vy[i]! + gravity * pool.grav[i]! * dt;
		pool.x[i] = pool.x[i]! + pool.vx[i]! * dt;
		pool.y[i] = pool.y[i]! + pool.vy[i]! * dt;
		pool.vx[i] = pool.vx[i]! * drag;
		pool.vy[i] = pool.vy[i]! * drag;
		i++;
	}
}

export function newRect(): Rect {
	return { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * Ограничивающий прямоугольник живых частиц с полем `margin` (для dirty-rect)
 * пишется в `out`: в цикле кадров нет выделений. `false` — частиц нет.
 */
export function bounds(pool: Pool, margin: number, out: Rect): boolean {
	if (pool.count === 0) return false;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let i = 0; i < pool.count; i++) {
		const x = pool.x[i]!;
		const y = pool.y[i]!;
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	out.x = minX - margin;
	out.y = minY - margin;
	out.w = maxX - minX + margin * 2;
	out.h = maxY - minY + margin * 2;
	return true;
}

/** Объединение двух прямоугольников пишется в `out`. `false` — оба `null`. */
export function unionInto(out: Rect, a: Rect | null, b: Rect | null): boolean {
	if (!a && !b) return false;
	if (!a || !b) {
		const s = (a ?? b)!;
		out.x = s.x;
		out.y = s.y;
		out.w = s.w;
		out.h = s.h;
		return true;
	}
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	const w = Math.max(a.x + a.w, b.x + b.w) - x;
	const h = Math.max(a.y + a.h, b.y + b.h) - y;
	out.x = x;
	out.y = y;
	out.w = w;
	out.h = h;
	return true;
}

export function clearPool(pool: Pool): void {
	pool.count = 0;
}
```

```ts
// src/lib/fx/sprites.ts
/**
 * Раскладка атласа спрайтов: строка — спрайт, столбец — кадр вращения.
 * Вращение и мерцание частицы — переключение заранее нарисованных кадров,
 * а не поворот canvas на каждую частицу.
 */
export const FRAMES = 8;
/** Сторона ячейки атласа в CSS-пикселях */
export const CELL = 32;

export const SPARKLE_COLORS = ["#ffd54a", "#ff5ca8", "#6c5cff"] as const;
/** Радиус луча блёстки по размерам S/M/L, CSS px (диаметр 8–16). Свечение (радиус × 1,25) обязано помещаться в ячейку 32×32 */
export const SPARKLE_SIZES = [4, 6, 8] as const;

export const SPRITE = { DUST: 9, SHARD: 10 } as const;
export const SPRITE_COUNT = 11;

/** 0..8: цвет × размер */
export function sparkleSprite(color: 0 | 1 | 2, size: 0 | 1 | 2): number {
	return color * 3 + size;
}

export function spriteRect(
	sprite: number,
	frame: number,
	scale = 1,
): { sx: number; sy: number; size: number } {
	const size = CELL * scale;
	return { sx: frame * size, sy: sprite * size, size };
}

export function atlasSize(scale = 1): { w: number; h: number } {
	return { w: FRAMES * CELL * scale, h: SPRITE_COUNT * CELL * scale };
}
```

```ts
// src/lib/fx/budget.ts
/**
 * Токен-бакет: лавина событий (быстрая печать, шлейф слайдера) не раздувает
 * нагрузку, а превращается в плотный, но ограниченный поток вспышек.
 */
export interface Budget {
	take(n: number, nowMs: number): number;
}

export function createBudget(perSecond: number, burst = perSecond / 4): Budget {
	let tokens = burst;
	let last = -1;
	return {
		take(n, nowMs) {
			if (last < 0) last = nowMs;
			tokens = Math.min(burst, tokens + ((nowMs - last) * perSecond) / 1000);
			last = nowMs;
			const give = Math.min(n, Math.floor(tokens));
			tokens -= give;
			return give;
		},
	};
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-pool.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/pool.ts src/lib/fx/sprites.ts src/lib/fx/budget.ts src/lib/__tests__/fx-pool.test.ts
git commit -m "Спецэффекты: пул частиц на типизированных массивах, раскладка спрайтов, бюджет событий" -m "$TRAILER"
```

---

### Task 3: Уровни, эмиттеры, шина и диспетчер

**Files:**
- Create: `src/lib/fx/level.ts`
- Create: `src/lib/fx/effects.ts`
- Create: `src/lib/fx/bus.ts`
- Create: `src/lib/fx/dispatch.ts`
- Test: `src/lib/__tests__/fx-effects.test.ts`

**Interfaces:**
- Consumes: `createPool`, `Pool`, `KIND`, `spawn` (Task 2); `sparkleSprite`, `SPRITE` (Task 2); `sinT`, `cosT` (Task 1); `createBudget`, `Budget` (Task 2).
- Produces:
  - `level.ts`: `LEVEL_COUNT = 4`; `interface LevelSpec { rings: number; orbitSparks: number; rays: number; bolt: boolean; scale: number; glow: number; notchesLit: number; burst: number }`; `levelSpec(index: number): LevelSpec`.
  - `effects.ts`: `type Rng = () => number`; `interface Box { x; y; w; h }`; `emitTyped(pool, rng, x, y): number`; `emitErased(...)`; `emitBurst(pool, rng, x, y, count, speed?): number`; `emitSalute(pool, rng, w, h): number`; `emitPerimeter(pool, rng, box): number`; `emitCoins(pool, rng, x, y, dir: 1 | -1): number`; `emitLevel(pool, rng, x, y, level): number`; `emitDenied(pool, rng, x, y): number`; `emitResult(pool, rng, box): number`.
  - `bus.ts`: `type FxEvent` (объединение, см. код); `interface FxBus { emit(e: FxEvent): void; subscribe(fn: (e: FxEvent) => void): () => void }`; `createBus(): FxBus`; `fxBus: FxBus`.
  - `dispatch.ts`: `interface DispatchCtx { pool; rng; budget; width; height; now }`; `dispatch(e: FxEvent, c: DispatchCtx): number` (число рождённых частиц).

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-effects.test.ts
import { describe, expect, test } from "bun:test";
import { createBudget } from "../fx/budget";
import { createBus } from "../fx/bus";
import { dispatch } from "../fx/dispatch";
import {
	emitCoins,
	emitErased,
	emitLevel,
	emitPerimeter,
	emitSalute,
	emitTyped,
} from "../fx/effects";
import { LEVEL_COUNT, levelSpec } from "../fx/level";
import { createPool } from "../fx/pool";
import { createRng } from "../fx/rng";

describe("levelSpec", () => {
	test("четыре уровня, эффекты растут монотонно", () => {
		expect(LEVEL_COUNT).toBe(4);
		for (let i = 1; i < LEVEL_COUNT; i++) {
			const a = levelSpec(i - 1);
			const b = levelSpec(i);
			expect(b.rings).toBeGreaterThanOrEqual(a.rings);
			expect(b.orbitSparks).toBeGreaterThanOrEqual(a.orbitSparks);
			expect(b.rays).toBeGreaterThanOrEqual(a.rays);
			expect(b.scale).toBeGreaterThan(a.scale);
			expect(b.glow).toBeGreaterThan(a.glow);
			expect(b.burst).toBeGreaterThan(a.burst);
			expect(b.notchesLit).toBe(i + 1);
		}
		expect(levelSpec(0).bolt).toBe(false);
		expect(levelSpec(3).bolt).toBe(true);
	});

	test("индекс зажимается в 0..3", () => {
		expect(levelSpec(-5)).toEqual(levelSpec(0));
		expect(levelSpec(99)).toEqual(levelSpec(3));
	});
});

describe("эмиттеры", () => {
	test("emitTyped: 3–6 блёсток из каретки, все летят вверх", () => {
		const pool = createPool(512);
		const rng = createRng(1);
		for (let k = 0; k < 20; k++) {
			pool.count = 0;
			const n = emitTyped(pool, rng, 100, 200);
			expect(n).toBeGreaterThanOrEqual(3);
			expect(n).toBeLessThanOrEqual(6);
			expect(pool.count).toBe(n);
			for (let i = 0; i < pool.count; i++) {
				expect(pool.x[i]).toBeCloseTo(100, 3);
				expect(pool.y[i]).toBeCloseTo(200, 3);
				expect(pool.vy[i]!).toBeLessThan(0);
			}
		}
	});

	test("emitErased: пыль вокруг каретки летит к ней", () => {
		const pool = createPool(512);
		const n = emitErased(pool, createRng(2), 50, 60);
		expect(n).toBeGreaterThanOrEqual(5);
		for (let i = 0; i < pool.count; i++) {
			const dx = pool.x[i]! - 50;
			const dy = pool.y[i]! - 60;
			const dist = Math.hypot(dx, dy);
			expect(dist).toBeGreaterThanOrEqual(17.9);
			expect(dist).toBeLessThanOrEqual(30.1);
			expect(dx * pool.vx[i]! + dy * pool.vy[i]!).toBeLessThan(0);
		}
	});

	test("emitSalute: больше шестидесяти частиц и всё помещается в пул", () => {
		const pool = createPool(512);
		const n = emitSalute(pool, createRng(3), 1200, 800);
		expect(n).toBeGreaterThan(60);
		expect(pool.count).toBe(n);
	});

	test("emitCoins: плюс — вверх, минус — вниз", () => {
		const up = createPool(64);
		emitCoins(up, createRng(4), 0, 0, 1);
		for (let i = 0; i < up.count; i++) expect(up.vy[i]!).toBeLessThan(0);
		const down = createPool(64);
		emitCoins(down, createRng(4), 0, 0, -1);
		for (let i = 0; i < down.count; i++) expect(down.vy[i]!).toBeGreaterThan(0);
	});

	test("emitLevel: число частиц равно levelSpec(level).burst", () => {
		for (let l = 0; l < LEVEL_COUNT; l++) {
			const pool = createPool(512);
			expect(emitLevel(pool, createRng(5), 0, 0, l)).toBe(levelSpec(l).burst);
		}
	});

	test("emitPerimeter: искры стартуют на границе рамки", () => {
		const pool = createPool(64);
		const n = emitPerimeter(pool, createRng(6), { x: 10, y: 20, w: 100, h: 40 });
		expect(n).toBe(10);
		for (let i = 0; i < pool.count; i++) {
			const x = pool.x[i]!;
			const y = pool.y[i]!;
			const onV = Math.abs(x - 10) < 0.01 || Math.abs(x - 110) < 0.01;
			const onH = Math.abs(y - 20) < 0.01 || Math.abs(y - 60) < 0.01;
			expect(onV || onH).toBe(true);
		}
	});
});

describe("шина", () => {
	test("подписка, доставка, отписка", () => {
		const bus = createBus();
		const got: string[] = [];
		const off = bus.subscribe((e) => got.push(e.type));
		bus.emit({ type: "press", x: 1, y: 2 });
		off();
		bus.emit({ type: "press", x: 1, y: 2 });
		expect(got).toEqual(["press"]);
	});
});

describe("dispatch", () => {
	function ctx(now = 0) {
		return {
			pool: createPool(512),
			rng: createRng(9),
			budget: createBudget(40, 10),
			width: 1200,
			height: 800,
			now,
		};
	}

	test("каждое событие рождает частицы", () => {
		const c = ctx();
		const events = [
			{ type: "typed", x: 1, y: 1 },
			{ type: "erased", x: 1, y: 1 },
			{ type: "trail", x: 1, y: 1 },
			{ type: "press", x: 1, y: 1 },
			{ type: "focus", x: 0, y: 0, w: 50, h: 20 },
			{ type: "denied", x: 1, y: 1 },
			{ type: "error", x: 1, y: 1 },
			{ type: "balance", x: 1, y: 1, delta: 5 },
			{ type: "level", x: 1, y: 1, level: 2 },
			{ type: "result", x: 0, y: 0, w: 300, h: 300 },
		] as const;
		for (const e of events) {
			c.pool.count = 0;
			c.budget = createBudget(40, 10);
			expect(dispatch(e, c)).toBeGreaterThan(0);
		}
		c.pool.count = 0;
		expect(dispatch({ type: "success", x: 0, y: 0 }, c)).toBeGreaterThan(60);
	});

	test("быстрая печать упирается в бюджет", () => {
		const c = ctx(1000);
		let total = 0;
		let denied = 0;
		for (let i = 0; i < 20; i++) {
			c.pool.count = 0;
			const n = dispatch({ type: "typed", x: 5, y: 5 }, c);
			total += n;
			if (n === 0) denied++;
		}
		expect(total).toBeGreaterThan(0);
		expect(denied).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-effects.test.ts`
Expected: FAIL (`Cannot find module '../fx/budget'`… либо `../fx/level`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/level.ts
/** Параметры эффектов уровня рассуждения (0 = «Среднее» … 3 = «Максимальное»). */
export const LEVEL_COUNT = 4;

export interface LevelSpec {
	/** Кольца вокруг кристалла-бегунка */
	rings: number;
	/** Искры на орбите */
	orbitSparks: number;
	/** Лучи звезды */
	rays: number;
	/** Молния в сердцевине */
	bolt: boolean;
	/** Масштаб бегунка */
	scale: number;
	/** Сила свечения 0..1 */
	glow: number;
	/** Сколько засечек дорожки горит */
	notchesLit: number;
	/** Число частиц при смене значения */
	burst: number;
}

const SPECS: readonly LevelSpec[] = [
	{ rings: 0, orbitSparks: 0, rays: 0, bolt: false, scale: 0.9, glow: 0.25, notchesLit: 1, burst: 8 },
	{ rings: 1, orbitSparks: 0, rays: 0, bolt: false, scale: 1, glow: 0.45, notchesLit: 2, burst: 18 },
	{ rings: 2, orbitSparks: 3, rays: 0, bolt: false, scale: 1.15, glow: 0.7, notchesLit: 3, burst: 28 },
	{ rings: 2, orbitSparks: 5, rays: 8, bolt: true, scale: 1.3, glow: 1, notchesLit: 4, burst: 44 },
];

export function levelSpec(index: number): LevelSpec {
	const i = Math.min(LEVEL_COUNT - 1, Math.max(0, Math.round(index)));
	return SPECS[i]!;
}
```

```ts
// src/lib/fx/effects.ts
import { levelSpec } from "./level";
import { KIND, type Pool, spawn } from "./pool";
import { SPRITE, sparkleSprite } from "./sprites";
import { cosT, sinT } from "./tables";

/**
 * Эмиттеры: вызываются по событию (не в цикле кадров), поэтому используют
 * таблицы углов и детерминированный rng. Скорости — px/с, жизнь — секунды.
 */
export type Rng = () => number;

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Золото встречается чаще фуксии и индиго */
function pickColor(rng: Rng): 0 | 1 | 2 {
	const r = rng();
	return r < 0.5 ? 0 : r < 0.8 ? 1 : 2;
}

function pickSize(rng: Rng): 0 | 1 | 2 {
	return ((rng() * 3) | 0) as 0 | 1 | 2;
}

/** Печать символа: 3–6 блёсток из каретки вверх и в стороны. */
export function emitTyped(pool: Pool, rng: Rng, x: number, y: number): number {
	const n = 3 + ((rng() * 4) | 0);
	let done = 0;
	for (let i = 0; i < n; i++) {
		const turns = -0.25 + (rng() - 0.5) * 0.35;
		const speed = 90 + rng() * 160;
		if (
			spawn(
				pool,
				KIND.SPARKLE,
				sparkleSprite(pickColor(rng), pickSize(rng)),
				x,
				y,
				cosT(turns) * speed,
				sinT(turns) * speed,
				0.55 + rng() * 0.35,
				1,
			)
		) {
			done++;
		}
	}
	return done;
}

/** Стирание: холодная пыль втягивается в каретку. */
export function emitErased(pool: Pool, rng: Rng, x: number, y: number): number {
	const n = 5 + ((rng() * 3) | 0);
	const life = 0.35;
	let done = 0;
	for (let i = 0; i < n; i++) {
		const turns = rng();
		const r = 18 + rng() * 12;
		const dx = cosT(turns);
		const dy = sinT(turns);
		const speed = r / life;
		if (
			spawn(pool, KIND.DUST, SPRITE.DUST, x + dx * r, y + dy * r, -dx * speed, -dy * speed, life, 0)
		) {
			done++;
		}
	}
	return done;
}

/** Радиальный взрыв; каждая пятая частица — осколок. */
export function emitBurst(
	pool: Pool,
	rng: Rng,
	x: number,
	y: number,
	count: number,
	speed = 260,
): number {
	let done = 0;
	for (let i = 0; i < count; i++) {
		const turns = rng();
		const sp = speed * (0.35 + rng() * 0.65);
		const shard = i % 5 === 0;
		if (
			spawn(
				pool,
				shard ? KIND.SHARD : KIND.SPARKLE,
				shard ? SPRITE.SHARD : sparkleSprite(pickColor(rng), pickSize(rng)),
				x,
				y,
				cosT(turns) * sp,
				sinT(turns) * sp,
				0.5 + rng() * 0.5,
				shard ? 0.6 : 1,
			)
		) {
			done++;
		}
	}
	return done;
}

/** Салют на весь экран: три залпа на разной высоте. */
export function emitSalute(pool: Pool, rng: Rng, w: number, h: number): number {
	let done = 0;
	for (const fx of [0.25, 0.5, 0.75]) {
		done += emitBurst(pool, rng, w * fx, h * (0.3 + rng() * 0.15), 40, 420);
	}
	return done;
}

/** Искры по периметру рамки наружу (фокус поля). */
export function emitPerimeter(pool: Pool, rng: Rng, box: Box): number {
	let done = 0;
	for (let i = 0; i < 10; i++) {
		const side = (rng() * 4) | 0;
		const t = rng();
		let x = box.x;
		let y = box.y;
		let nx = 0;
		let ny = 0;
		if (side === 0) {
			x = box.x + t * box.w;
			ny = -1;
		} else if (side === 1) {
			x = box.x + t * box.w;
			y = box.y + box.h;
			ny = 1;
		} else if (side === 2) {
			y = box.y + t * box.h;
			nx = -1;
		} else {
			x = box.x + box.w;
			y = box.y + t * box.h;
			nx = 1;
		}
		const sp = 30 + rng() * 40;
		if (
			spawn(
				pool,
				KIND.SPARKLE,
				sparkleSprite(pickColor(rng), 0),
				x,
				y,
				nx * sp,
				ny * sp,
				0.5,
				0,
			)
		) {
			done++;
		}
	}
	return done;
}

/** Монеты баланса: плюс взлетает, минус осыпается. */
export function emitCoins(pool: Pool, rng: Rng, x: number, y: number, dir: 1 | -1): number {
	let done = 0;
	for (let i = 0; i < 8; i++) {
		const turns = (dir > 0 ? -0.25 : 0.25) + (rng() - 0.5) * 0.24;
		const speed = 80 + rng() * 120;
		if (
			spawn(
				pool,
				KIND.SPARKLE,
				sparkleSprite(0, pickSize(rng)),
				x,
				y,
				cosT(turns) * speed,
				sinT(turns) * speed,
				0.7 + rng() * 0.3,
				1,
			)
		) {
			done++;
		}
	}
	return done;
}

/** Смена уровня рассуждения: сила растёт с уровнем. */
export function emitLevel(pool: Pool, rng: Rng, x: number, y: number, level: number): number {
	const spec = levelSpec(level);
	return emitBurst(pool, rng, x, y, spec.burst, 140 + Math.round(level) * 60);
}

/** Отказ (кнопка отключена): пыль в стороны. */
export function emitDenied(pool: Pool, rng: Rng, x: number, y: number): number {
	let done = 0;
	for (let i = 0; i < 5; i++) {
		const side = i % 2 === 0 ? 1 : -1;
		if (
			spawn(pool, KIND.DUST, SPRITE.DUST, x, y, side * (40 + rng() * 40), (rng() - 0.5) * 30, 0.3, 0)
		) {
			done++;
		}
	}
	return done;
}

/** Готовая картинка: залпы из углов и центра рамки. */
export function emitResult(pool: Pool, rng: Rng, box: Box): number {
	let done = 0;
	for (const [cx, cy] of [
		[box.x, box.y],
		[box.x + box.w, box.y],
		[box.x, box.y + box.h],
		[box.x + box.w, box.y + box.h],
	] as const) {
		done += emitBurst(pool, rng, cx, cy, 14, 300);
	}
	done += emitBurst(pool, rng, box.x + box.w / 2, box.y + box.h / 2, 20, 240);
	return done;
}
```

```ts
// src/lib/fx/bus.ts
/** События интерфейса, на которые реагирует слой эффектов. Координаты — viewport, px. */
export type FxEvent =
	| { type: "typed"; x: number; y: number }
	| { type: "erased"; x: number; y: number }
	| { type: "trail"; x: number; y: number }
	| { type: "press"; x: number; y: number }
	| { type: "focus"; x: number; y: number; w: number; h: number }
	| { type: "denied"; x: number; y: number }
	| { type: "success"; x: number; y: number }
	| { type: "error"; x: number; y: number }
	| { type: "balance"; x: number; y: number; delta: number }
	| { type: "level"; x: number; y: number; level: number }
	| { type: "result"; x: number; y: number; w: number; h: number };

export interface FxBus {
	emit(e: FxEvent): void;
	subscribe(fn: (e: FxEvent) => void): () => void;
}

export function createBus(): FxBus {
	const subs = new Set<(e: FxEvent) => void>();
	return {
		emit(e) {
			for (const fn of subs) fn(e);
		},
		subscribe(fn) {
			subs.add(fn);
			return () => {
				subs.delete(fn);
			};
		},
	};
}

/** Единая шина приложения */
export const fxBus: FxBus = createBus();
```

```ts
// src/lib/fx/dispatch.ts
import type { Budget } from "./budget";
import type { FxEvent } from "./bus";
import {
	emitBurst,
	emitCoins,
	emitDenied,
	emitErased,
	emitLevel,
	emitPerimeter,
	emitResult,
	emitSalute,
	emitTyped,
	type Rng,
} from "./effects";
import type { Pool } from "./pool";

export interface DispatchCtx {
	pool: Pool;
	rng: Rng;
	budget: Budget;
	width: number;
	height: number;
	/** performance.now() */
	now: number;
}

/** Событие → эмиттер. Частые события (ввод, шлейф) проходят через бюджет. Возвращает число рождённых частиц. */
export function dispatch(e: FxEvent, c: DispatchCtx): number {
	switch (e.type) {
		case "typed":
			return c.budget.take(1, c.now) ? emitTyped(c.pool, c.rng, e.x, e.y) : 0;
		case "erased":
			return c.budget.take(1, c.now) ? emitErased(c.pool, c.rng, e.x, e.y) : 0;
		case "trail":
			return c.budget.take(1, c.now) ? emitBurst(c.pool, c.rng, e.x, e.y, 2, 90) : 0;
		case "press":
			return emitBurst(c.pool, c.rng, e.x, e.y, 10, 220);
		case "focus":
			return emitPerimeter(c.pool, c.rng, { x: e.x, y: e.y, w: e.w, h: e.h });
		case "denied":
			return emitDenied(c.pool, c.rng, e.x, e.y);
		case "success":
			return emitSalute(c.pool, c.rng, c.width, c.height);
		case "error":
			return emitBurst(c.pool, c.rng, e.x, e.y, 14, 170);
		case "balance":
			return emitCoins(c.pool, c.rng, e.x, e.y, e.delta >= 0 ? 1 : -1);
		case "level":
			return emitLevel(c.pool, c.rng, e.x, e.y, e.level);
		case "result":
			return emitResult(c.pool, c.rng, { x: e.x, y: e.y, w: e.w, h: e.h });
		default: {
			const never: never = e;
			return never;
		}
	}
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-effects.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/level.ts src/lib/fx/effects.ts src/lib/fx/bus.ts src/lib/fx/dispatch.ts src/lib/__tests__/fx-effects.test.ts
git commit -m "Спецэффекты: уровни, эмиттеры частиц, шина событий и диспетчер" -m "$TRAILER"
```

---

### Task 4: Цикл движка

**Files:**
- Create: `src/lib/fx/engine.ts`
- Test: `src/lib/__tests__/fx-engine.test.ts`

**Interfaces:**
- Consumes: `Pool`, `Rect`, `step`, `bounds`, `newRect`, `clearPool` (Task 2).
- Produces: `interface EngineStats { frames: number; totalMs: number; maxMs: number }`; `interface Engine { wake(): void; stop(): void; isRunning(): boolean; readonly stats: EngineStats }`; `interface EngineOptions { pool; gravity; now(): number; raf(cb: (t: number) => void): number; caf(id: number): void; render(prev: Rect | null, cur: Rect | null): void; margin?: number }`; `createEngine(o: EngineOptions): Engine`.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-engine.test.ts
import { describe, expect, test } from "bun:test";
import { createEngine } from "../fx/engine";
import { createPool, KIND, type Rect, spawn } from "../fx/pool";

function fakeLoop() {
	let t = 0;
	let cb: ((t: number) => void) | null = null;
	let id = 0;
	let rafCalls = 0;
	return {
		now: () => t,
		raf: (f: (t: number) => void) => {
			rafCalls++;
			cb = f;
			return ++id;
		},
		caf: () => {
			cb = null;
		},
		tick(ms: number) {
			t += ms;
			const f = cb;
			cb = null;
			f?.(t);
		},
		pending: () => cb !== null,
		rafCalls: () => rafCalls,
	};
}

function setup() {
	const loop = fakeLoop();
	const pool = createPool(16);
	const renders: Array<[Rect | null, Rect | null]> = [];
	// движок переиспользует прямоугольники, поэтому в журнал кладём копии
	const engine = createEngine({
		pool,
		gravity: 0,
		now: loop.now,
		raf: loop.raf,
		caf: loop.caf,
		render: (prev, cur) =>
			renders.push([prev && { ...prev }, cur && { ...cur }]),
	});
	return { loop, pool, renders, engine };
}

describe("engine", () => {
	test("пустой пул: один кадр и сон", () => {
		const { loop, engine } = setup();
		engine.wake();
		expect(engine.isRunning()).toBe(true);
		loop.tick(16);
		expect(loop.pending()).toBe(false);
		expect(engine.isRunning()).toBe(false);
	});

	test("живая частица держит цикл, смерть усыпляет и стирает след", () => {
		const { loop, pool, renders, engine } = setup();
		spawn(pool, KIND.SPARKLE, 0, 50, 50, 0, 0, 0.05, 0);
		engine.wake();
		loop.tick(16);
		expect(loop.pending()).toBe(true);
		loop.tick(100);
		expect(loop.pending()).toBe(false);
		expect(engine.isRunning()).toBe(false);
		const last = renders[renders.length - 1]!;
		expect(last[0]).not.toBeNull();
		expect(last[1]).toBeNull();
	});

	test("повторный wake не ставит второй кадр", () => {
		const { loop, pool, engine } = setup();
		spawn(pool, KIND.SPARKLE, 0, 1, 1, 0, 0, 5, 0);
		engine.wake();
		engine.wake();
		engine.wake();
		expect(loop.rafCalls()).toBe(1);
	});

	test("stop очищает пул, стирает след и снимает кадр", () => {
		const { loop, pool, renders, engine } = setup();
		spawn(pool, KIND.SPARKLE, 0, 1, 1, 0, 0, 5, 0);
		engine.wake();
		loop.tick(16);
		engine.stop();
		expect(pool.count).toBe(0);
		expect(loop.pending()).toBe(false);
		expect(renders[renders.length - 1]![1]).toBeNull();
	});

	test("статистика копит кадры", () => {
		const { loop, pool, engine } = setup();
		spawn(pool, KIND.SPARKLE, 0, 1, 1, 0, 0, 5, 0);
		engine.wake();
		loop.tick(16);
		loop.tick(16);
		expect(engine.stats.frames).toBe(2);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-engine.test.ts`
Expected: FAIL (`Cannot find module '../fx/engine'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/engine.ts
import { bounds, clearPool, newRect, type Pool, type Rect, step } from "./pool";

/**
 * Цикл эффектов. Просыпается по событию (`wake`) и засыпает, как только в пуле
 * не осталось живых частиц: в простое ни одного кадра и ни одного вызова raf.
 * Шаг dt ограничен 50 мс, чтобы возврат во вкладку не «выстреливал» частицы.
 */
export interface EngineStats {
	frames: number;
	totalMs: number;
	maxMs: number;
}

export interface Engine {
	wake(): void;
	stop(): void;
	isRunning(): boolean;
	readonly stats: EngineStats;
}

export interface EngineOptions {
	pool: Pool;
	/** px/с² */
	gravity: number;
	now(): number;
	raf(cb: (t: number) => void): number;
	caf(id: number): void;
	/** Стереть объединение `prev` и `cur` и нарисовать пул. `cur === null` — частиц нет */
	render(prev: Rect | null, cur: Rect | null): void;
	/** Поле вокруг частиц для dirty-rect, px (по умолчанию 24) */
	margin?: number;
}

export function createEngine(o: EngineOptions): Engine {
	const margin = o.margin ?? 24;
	const stats: EngineStats = { frames: 0, totalMs: 0, maxMs: 0 };
	let running = false;
	let id = 0;
	let last = 0;
	// два переиспользуемых прямоугольника (прежний и новый): ни одной аллокации в кадре
	let prevRect = newRect();
	let curRect = newRect();
	let hasPrev = false;

	function frame(t: number): void {
		const t0 = o.now();
		const dt = Math.min(Math.max((t - last) / 1000, 0), 0.05);
		last = t;
		step(o.pool, dt, o.gravity);
		const hasCur = bounds(o.pool, margin, curRect);
		o.render(hasPrev ? prevRect : null, hasCur ? curRect : null);
		const tmp = prevRect;
		prevRect = curRect;
		curRect = tmp;
		hasPrev = hasCur;
		const ms = o.now() - t0;
		stats.frames++;
		stats.totalMs += ms;
		if (ms > stats.maxMs) stats.maxMs = ms;
		if (o.pool.count > 0) {
			id = o.raf(frame);
		} else {
			running = false;
		}
	}

	return {
		wake() {
			if (running) return;
			running = true;
			last = o.now();
			id = o.raf(frame);
		},
		stop() {
			if (running) o.caf(id);
			running = false;
			clearPool(o.pool);
			o.render(hasPrev ? prevRect : null, null);
			hasPrev = false;
		},
		isRunning: () => running,
		stats,
	};
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/engine.ts src/lib/__tests__/fx-engine.test.ts
git commit -m "Спецэффекты: цикл движка, засыпающий без частиц, со статистикой кадров" -m "$TRAILER"
```

---

### Task 5: Атлас спрайтов и отрисовка в canvas

**Files:**
- Create: `src/lib/fx/atlas.ts`
- Create: `src/lib/fx/renderer.ts`
- Test: `src/lib/__tests__/fx-renderer.test.ts`

**Interfaces:**
- Consumes: `Pool`, `Rect`, `newRect`, `unionInto` (Task 2); `atlasSize`, `CELL`, `FRAMES`, `SPARKLE_COLORS`, `SPARKLE_SIZES`, `SPRITE`, `SPRITE_COUNT` (Task 2).
- Produces: `type AtlasCanvas = OffscreenCanvas | HTMLCanvasElement`; `bakeAtlas(scale: number): AtlasCanvas`; `interface RenderCtx { globalAlpha: number; clearRect(x: number, y: number, w: number, h: number): void; drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void }`; `createRenderer(ctx: RenderCtx, atlas: CanvasImageSource, pool: Pool, scale: number): (prev: Rect | null, cur: Rect | null) => void`.

- [ ] **Step 1: Написать падающий тест** (рендерер проверяется на фейковом контексте; запекание атласа проверяется в браузере в Task 7)

```ts
// src/lib/__tests__/fx-renderer.test.ts
import { describe, expect, test } from "bun:test";
import { createPool, KIND, spawn } from "../fx/pool";
import { createRenderer, type RenderCtx } from "../fx/renderer";

function fakeCtx() {
	const calls: Array<{ op: string; args: number[] }> = [];
	const ctx: RenderCtx = {
		globalAlpha: 1,
		clearRect: (...args) => calls.push({ op: "clear", args }),
		drawImage: (_img, ...args) => calls.push({ op: "draw", args }),
	};
	return { ctx, calls };
}

describe("renderer", () => {
	test("без прямоугольников ничего не делает", () => {
		const { ctx, calls } = fakeCtx();
		const render = createRenderer(ctx, {} as CanvasImageSource, createPool(4), 1);
		render(null, null);
		expect(calls.length).toBe(0);
	});

	test("стирает объединение один раз и рисует каждую частицу целыми координатами", () => {
		const { ctx, calls } = fakeCtx();
		const pool = createPool(4);
		spawn(pool, KIND.SPARKLE, 3, 100.7, 50.2, 0, 0, 1, 0);
		spawn(pool, KIND.SHARD, 10, 200.4, 80.9, 0, 0, 1, 0);
		const render = createRenderer(ctx, {} as CanvasImageSource, pool, 2);
		render({ x: 0, y: 0, w: 50, h: 50 }, { x: 90, y: 40, w: 130, h: 60 });
		const clears = calls.filter((c) => c.op === "clear");
		const draws = calls.filter((c) => c.op === "draw");
		expect(clears.length).toBe(1);
		expect(draws.length).toBe(2);
		for (const d of draws) {
			const [sx, sy, sw, sh, dx, dy, dw, dh] = d.args as [
				number, number, number, number, number, number, number, number,
			];
			expect(Number.isInteger(dx)).toBe(true);
			expect(Number.isInteger(dy)).toBe(true);
			expect(dw).toBe(32);
			expect(dh).toBe(32);
			expect(sw).toBe(64);
			expect(sh).toBe(64);
			expect(sx % 64).toBe(0);
			expect(sy % 64).toBe(0);
		}
		expect(ctx.globalAlpha).toBe(1);
	});

	test("частица у конца жизни рисуется прозрачнее", () => {
		const { ctx } = fakeCtx();
		const alphas: number[] = [];
		const spy: RenderCtx = {
			get globalAlpha() {
				return ctx.globalAlpha;
			},
			set globalAlpha(v: number) {
				alphas.push(v);
				ctx.globalAlpha = v;
			},
			clearRect: ctx.clearRect,
			drawImage: ctx.drawImage,
		};
		const pool = createPool(2);
		spawn(pool, KIND.SPARKLE, 0, 10, 10, 0, 0, 1, 0);
		pool.life[0] = 0.1;
		const render = createRenderer(spy, {} as CanvasImageSource, pool, 1);
		render(null, { x: 0, y: 0, w: 30, h: 30 });
		expect(alphas.some((a) => a > 0 && a < 1)).toBe(true);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-renderer.test.ts`
Expected: FAIL (`Cannot find module '../fx/renderer'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/renderer.ts
import { newRect, type Pool, type Rect, unionInto } from "./pool";
import { CELL, FRAMES } from "./sprites";

/** Минимум, который нужен рендереру от 2D-контекста (удобно подменять в тестах). */
export interface RenderCtx {
	globalAlpha: number;
	clearRect(x: number, y: number, w: number, h: number): void;
	drawImage(
		image: CanvasImageSource,
		sx: number,
		sy: number,
		sw: number,
		sh: number,
		dx: number,
		dy: number,
		dw: number,
		dh: number,
	): void;
}

/**
 * Рисует пул. Очищается только объединение прежнего и нового ограничивающих
 * прямоугольников (dirty-rect). В цикле нет выделений памяти: исходный
 * прямоугольник спрайта считается арифметикой, координаты — целые (без
 * субпиксельной передискретизации).
 */
export function createRenderer(
	ctx: RenderCtx,
	atlas: CanvasImageSource,
	pool: Pool,
	scale: number,
): (prev: Rect | null, cur: Rect | null) => void {
	const cellPx = CELL * scale;
	const half = CELL / 2;
	const r = newRect();
	return (prev, cur) => {
		if (!unionInto(r, prev, cur)) return;
		ctx.clearRect(Math.floor(r.x), Math.floor(r.y), Math.ceil(r.w) + 1, Math.ceil(r.h) + 1);
		for (let i = 0; i < pool.count; i++) {
			const life = pool.life[i]!;
			const max = pool.maxLife[i]!;
			const frame = (((max - life) * 18) | 0) & (FRAMES - 1);
			const fade = life / (max * 0.4);
			ctx.globalAlpha = fade > 1 ? 1 : fade;
			ctx.drawImage(
				atlas,
				frame * cellPx,
				pool.sprite[i]! * cellPx,
				cellPx,
				cellPx,
				(pool.x[i]! - half) | 0,
				(pool.y[i]! - half) | 0,
				CELL,
				CELL,
			);
		}
		ctx.globalAlpha = 1;
	};
}
```

```ts
// src/lib/fx/atlas.ts
import {
	atlasSize,
	CELL,
	FRAMES,
	SPARKLE_COLORS,
	SPARKLE_SIZES,
	SPRITE,
	SPRITE_COUNT,
} from "./sprites";

export type AtlasCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AtlasCanvas {
	if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return c;
}

const TAU = Math.PI * 2;

/** Четырёхлучевая блёстка с мягким свечением и белым ядром; `turns` — поворот в оборотах. */
function drawSparkle(ctx: Ctx, cx: number, cy: number, r: number, color: string, turns: number): void {
	const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.25);
	glow.addColorStop(0, `${color}aa`);
	glow.addColorStop(1, `${color}00`);
	ctx.fillStyle = glow;
	ctx.beginPath();
	ctx.arc(cx, cy, r * 1.25, 0, TAU);
	ctx.fill();

	ctx.fillStyle = color;
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const rad = i % 2 === 0 ? r : r * 0.24;
		const a = turns * TAU + (i * Math.PI) / 4 - Math.PI / 2;
		const px = cx + Math.cos(a) * rad;
		const py = cy + Math.sin(a) * rad;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
	ctx.fill();

	ctx.fillStyle = "#ffffff";
	ctx.beginPath();
	ctx.arc(cx, cy, r * 0.2, 0, TAU);
	ctx.fill();
}

/** Мягкая холодная точка пыли */
function drawDust(ctx: Ctx, cx: number, cy: number): void {
	const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5);
	g.addColorStop(0, "#a79cffcc");
	g.addColorStop(0.5, "#6c5cff88");
	g.addColorStop(1, "#6c5cff00");
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, 5, 0, TAU);
	ctx.fill();
}

/** Осколок-ромб: золото → фуксия, светлая грань; поворот на полный оборот по кадрам. */
function drawShard(ctx: Ctx, cx: number, cy: number, turns: number): void {
	const pts: Array<[number, number]> = [[0, -8], [5, -1.5], [0, 9], [-5, -1.5]];
	const rot = turns * TAU;
	const c = Math.cos(rot);
	const s = Math.sin(rot);
	const place = (p: [number, number]): [number, number] => [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c];
	const g = ctx.createLinearGradient(cx - 5, cy - 8, cx + 5, cy + 9);
	g.addColorStop(0, "#ffd54a");
	g.addColorStop(1, "#ff5ca8");
	ctx.fillStyle = g;
	ctx.beginPath();
	pts.forEach((p, i) => {
		const [x, y] = place(p);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	});
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = "#ffffff88";
	ctx.beginPath();
	for (const [i, p] of ([pts[0], pts[1], [0, -2]] as Array<[number, number]>).entries()) {
		const [x, y] = place(p);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.fill();
}

/**
 * Запекает атлас один раз: строки — спрайты, столбцы — кадры вращения.
 * `scale` — множитель плотности пикселей (DPR), чтобы блёстки были чёткими.
 */
export function bakeAtlas(scale: number): AtlasCanvas {
	const { w, h } = atlasSize(scale);
	const canvas = makeCanvas(w, h);
	const ctx = canvas.getContext("2d") as Ctx | null;
	if (!ctx) return canvas;
	ctx.scale(scale, scale);
	for (let sprite = 0; sprite < SPRITE_COUNT; sprite++) {
		for (let frame = 0; frame < FRAMES; frame++) {
			const cx = frame * CELL + CELL / 2;
			const cy = sprite * CELL + CELL / 2;
			if (sprite < 9) {
				const color = SPARKLE_COLORS[Math.floor(sprite / 3)]!;
				const r = SPARKLE_SIZES[sprite % 3]!;
				// у четырёхлучевой звезды период поворота — четверть оборота
				drawSparkle(ctx, cx, cy, r, color, (frame / FRAMES) * 0.25);
			} else if (sprite === SPRITE.DUST) {
				drawDust(ctx, cx, cy);
			} else {
				drawShard(ctx, cx, cy, frame / FRAMES);
			}
		}
	}
	return canvas;
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/atlas.ts src/lib/fx/renderer.ts src/lib/__tests__/fx-renderer.test.ts
git commit -m "Спецэффекты: запекание атласа спрайтов и отрисовка пула по dirty-rect" -m "$TRAILER"
```

---

### Task 6: Положение каретки

**Files:**
- Create: `src/lib/fx/caret.ts`
- Test: `src/lib/__tests__/fx-caret.test.ts`

**Interfaces:**
- Produces: `interface CaretPoint { x: number; y: number }`; `MIRROR_PROPS: readonly string[]` (CSS-свойства в kebab-case, копируемые в зеркало); `caretViewportPoint(i: { fieldLeft; fieldTop; borderLeft; borderTop; markLeft; markTop; markHeight; scrollLeft; scrollTop }): CaretPoint`; `textareaCaret(el: HTMLTextAreaElement): CaretPoint`; `inputCaret(el: HTMLInputElement): CaretPoint`; `caretOf(el: HTMLInputElement | HTMLTextAreaElement): CaretPoint`.

- [ ] **Step 1: Написать падающий тест** (чистая часть; замер в DOM проверяется браузером в Task 7)

```ts
// src/lib/__tests__/fx-caret.test.ts
import { describe, expect, test } from "bun:test";
import { caretViewportPoint, MIRROR_PROPS } from "../fx/caret";

describe("caretViewportPoint", () => {
	test("складывает поле, рамку и метку, вычитает прокрутку, берёт середину строки", () => {
		const p = caretViewportPoint({
			fieldLeft: 100,
			fieldTop: 50,
			borderLeft: 1,
			borderTop: 1,
			markLeft: 40,
			markTop: 20,
			markHeight: 24,
			scrollLeft: 0,
			scrollTop: 10,
		});
		expect(p).toEqual({ x: 141, y: 73 });
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
});

describe("MIRROR_PROPS", () => {
	test("зеркало копирует всё, что влияет на перенос строк", () => {
		for (const p of [
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
			expect([...MIRROR_PROPS] as string[]).toContain(p);
		}
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-caret.test.ts`
Expected: FAIL (`Cannot find module '../fx/caret'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/caret.ts
/**
 * Положение каретки в viewport. Для textarea — скрытое зеркало с теми же
 * шрифтом, отступами и шириной: текст до каретки + метка, по метке читаем
 * позицию. Это один замер раскладки на нажатие. Для однострочного input
 * ширина текста меряется через canvas measureText без раскладки.
 */
export interface CaretPoint {
	x: number;
	y: number;
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

export function textareaCaret(el: HTMLTextAreaElement): CaretPoint {
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

export function inputCaret(el: HTMLInputElement): CaretPoint {
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
	};
}

export function caretOf(el: HTMLInputElement | HTMLTextAreaElement): CaretPoint {
	return el instanceof HTMLTextAreaElement ? textareaCaret(el) : inputCaret(el);
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-caret.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/caret.ts src/lib/__tests__/fx-caret.test.ts
git commit -m "Спецэффекты: положение каретки в textarea и input" -m "$TRAILER"
```

---

### Task 7: Привязки, холст эффектов и первая видимая работа

После этой задачи блёстки уже летят из каретки в любом поле, а нажатия на кнопки дают вспышки (пока без нового фона).

**Files:**
- Create: `src/lib/fx/dom.ts`
- Create: `src/lib/fx/bindings.ts`
- Create: `src/components/FxCanvas.tsx`
- Create: `scripts/fx-harness.ts` (экспорт `openPage({ mode, viewport, reducedMotion, dist })`)
- Create: `scripts/fx-smoke.ts`
- Modify: `src/components/App.tsx` (оболочка `App` + `AppContent`)
- Modify: `package.json` (dev-зависимость `playwright-core`)
- Test: `src/lib/__tests__/fx-bindings.test.ts`

**Interfaces:**
- Consumes: `fxBus`, `FxBus`, `FxEvent` (Task 3); `caretOf` (Task 6); `createPool`, `createEngine`, `createBudget`, `createRng`, `dispatch`, `bakeAtlas`, `createRenderer` (Tasks 1–5).
- Produces:
  - `dom.ts`: `prefersReducedMotion(): boolean`; `getStage(): HTMLElement | null`; `setStageAttr(name: string, value: string | null): void` (`null` — убрать атрибут); `flashAttr(el: Element | null, name: string, ms: number): void`; `emitCenter(el: Element | null, type: "press" | "denied" | "success" | "error"): void`; `emitBalance(el: Element | null, delta: number): void`; `emitLevelAt(el: Element | null, level: number): void`; `emitResultAt(el: Element | null): void`; `emitTrailAt(x: number, y: number): void`; `rememberPressed(el: Element | null): void`; `emitOutcome(ok: boolean): void` (итог асинхронного действия вспыхивает на последней нажатой кнопке: успех — залпы вокруг неё, сбой — искры и встряска).
  - `bindings.ts`: `isEraseInput(inputType: string | undefined): boolean`; `pressEventType(kind: string | null): "press" | null`; `interface BindingsOptions { bus: FxBus; stage(): HTMLElement | null; reducedMotion(): boolean }`; `installBindings(o: BindingsOptions): () => void`.
  - `FxCanvas.tsx`: `export function FxCanvas(): JSX.Element`. При `?fxstats` в адресе открывает `window.__fxStats` (`EngineStats`) и `window.__fxBus` (для замеров).

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-bindings.test.ts
import { describe, expect, test } from "bun:test";
import { isEraseInput, pressEventType } from "../fx/bindings";

describe("isEraseInput", () => {
	test("удаление — это delete*", () => {
		expect(isEraseInput("deleteContentBackward")).toBe(true);
		expect(isEraseInput("deleteContentForward")).toBe(true);
		expect(isEraseInput("deleteByCut")).toBe(true);
	});

	test("ввод, вставка и неизвестное — не удаление", () => {
		expect(isEraseInput("insertText")).toBe(false);
		expect(isEraseInput("insertFromPaste")).toBe(false);
		expect(isEraseInput(undefined)).toBe(false);
	});
});

describe("pressEventType", () => {
	test("нажимаемые виды дают press, поле и пустое — нет", () => {
		for (const k of ["press", "toggle", "item", "link", "submit", "level"]) {
			expect(pressEventType(k)).toBe("press");
		}
		expect(pressEventType("field")).toBeNull();
		expect(pressEventType(null)).toBeNull();
		expect(pressEventType("что-то")).toBeNull();
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-bindings.test.ts`
Expected: FAIL (`Cannot find module '../fx/bindings'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/dom.ts
import { fxBus } from "./bus";

export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getStage(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[data-slot="stage"]');
}

/** Атрибут на корне фона: CSS по нему меняет тон, яркость и состояние слоёв. */
export function setStageAttr(name: string, value: string | null): void {
	const stage = getStage();
	if (!stage) return;
	if (value === null) stage.removeAttribute(name);
	else stage.setAttribute(name, value);
}

/** Временный атрибут-триггер для CSS-анимации (встряска, вспышка). */
export function flashAttr(el: Element | null, name: string, ms: number): void {
	if (!el) return;
	el.removeAttribute(name);
	void (el as HTMLElement).offsetWidth;
	el.setAttribute(name, "");
	window.setTimeout(() => el.removeAttribute(name), ms);
}

function center(el: Element): { x: number; y: number } {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function emitCenter(
	el: Element | null,
	type: "press" | "denied" | "success" | "error",
): void {
	if (!el) return;
	const c = center(el);
	fxBus.emit({ type, x: c.x, y: c.y });
}

export function emitBalance(el: Element | null, delta: number): void {
	if (!el) return;
	const c = center(el);
	fxBus.emit({ type: "balance", x: c.x, y: c.y, delta });
}

export function emitLevelAt(el: Element | null, level: number): void {
	if (!el) return;
	const c = center(el);
	fxBus.emit({ type: "level", x: c.x, y: c.y, level });
}

export function emitResultAt(el: Element | null): void {
	if (!el) return;
	const r = el.getBoundingClientRect();
	fxBus.emit({ type: "result", x: r.left, y: r.top, w: r.width, h: r.height });
}

export function emitTrailAt(x: number, y: number): void {
	fxBus.emit({ type: "trail", x, y });
}

let lastPressed: Element | null = null;

/** Запоминает элемент последнего нажатия: итог действия вспыхивает на нём. */
export function rememberPressed(el: Element | null): void {
	lastPressed = el;
}

/** Итог асинхронного действия (сохранили ключ, проверка не прошла…) на только что нажатой кнопке. */
export function emitOutcome(ok: boolean): void {
	const el = lastPressed?.isConnected ? lastPressed : null;
	if (!el) return;
	if (ok) {
		emitResultAt(el);
	} else {
		emitCenter(el, "error");
		flashAttr(el, "data-fx-denied", 400);
	}
}
```

```ts
// src/lib/fx/bindings.ts
import type { FxBus } from "./bus";
import { caretOf } from "./caret";
import { rememberPressed } from "./dom";

/**
 * Глобальные слушатели: страницы не переписываются, элементы помечаются
 * атрибутом `data-fx` (вид: press | toggle | item | link | submit | level | field).
 */
export interface BindingsOptions {
	bus: FxBus;
	stage(): HTMLElement | null;
	reducedMotion(): boolean;
}

export function isEraseInput(inputType: string | undefined): boolean {
	return !!inputType && inputType.startsWith("delete");
}

const PRESS_KINDS = new Set(["press", "toggle", "item", "link", "submit", "level"]);

export function pressEventType(kind: string | null): "press" | null {
	return kind !== null && PRESS_KINDS.has(kind) ? "press" : null;
}

/** Отключённые элементы с pointer-events: none событий не получают — ищем попадание по прямоугольнику. */
function hitDisabled(x: number, y: number): HTMLElement | null {
	for (const el of document.querySelectorAll<HTMLElement>("[data-fx]:disabled")) {
		const r = el.getBoundingClientRect();
		if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
	}
	return null;
}

export function installBindings(o: BindingsOptions): () => void {
	let moveRaf = 0;
	let mx = 0;
	let my = 0;
	let typingTimer = 0;

	function onPointerDown(e: PointerEvent): void {
		if (!e.isPrimary) return;
		const denied = hitDisabled(e.clientX, e.clientY);
		if (denied) {
			o.bus.emit({ type: "denied", x: e.clientX, y: e.clientY });
			denied.setAttribute("data-fx-denied", "");
			window.setTimeout(() => denied.removeAttribute("data-fx-denied"), 400);
			return;
		}
		const host = (e.target as Element | null)?.closest?.("[data-fx]") ?? null;
		rememberPressed(host);
		if (pressEventType(host?.getAttribute("data-fx") ?? null)) {
			o.bus.emit({ type: "press", x: e.clientX, y: e.clientY });
		}
	}

	function onFocusIn(e: FocusEvent): void {
		const t = e.target as HTMLElement | null;
		if (!t?.matches?.('[data-fx="field"]') || o.reducedMotion()) return;
		const box = t.closest('[data-slot="input-group"]') ?? t;
		const r = box.getBoundingClientRect();
		o.bus.emit({ type: "focus", x: r.left, y: r.top, w: r.width, h: r.height });
	}

	function markTyping(): void {
		const stage = o.stage();
		if (!stage) return;
		stage.setAttribute("data-typing", "");
		window.clearTimeout(typingTimer);
		typingTimer = window.setTimeout(() => stage.removeAttribute("data-typing"), 1200);
	}

	function onInput(e: Event): void {
		const t = e.target;
		if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
		if (t.getAttribute("data-fx") !== "field" || o.reducedMotion()) return;
		const p = caretOf(t);
		const erase = isEraseInput((e as InputEvent).inputType);
		o.bus.emit({ type: erase ? "erased" : "typed", x: p.x, y: p.y });
		markTyping();
	}

	function applyMove(): void {
		moveRaf = 0;
		const stage = o.stage();
		if (!stage) return;
		const s = stage.style;
		s.setProperty("--px", ((mx / window.innerWidth) * 2 - 1).toFixed(3));
		s.setProperty("--py", ((my / window.innerHeight) * 2 - 1).toFixed(3));
		s.setProperty("--lx", `${Math.round(mx)}px`);
		s.setProperty("--ly", `${Math.round(my)}px`);
	}

	function onPointerMove(e: PointerEvent): void {
		if (o.reducedMotion()) return;
		mx = e.clientX;
		my = e.clientY;
		if (!moveRaf) moveRaf = requestAnimationFrame(applyMove);
	}

	document.addEventListener("pointerdown", onPointerDown, true);
	document.addEventListener("focusin", onFocusIn, true);
	document.addEventListener("input", onInput, true);
	document.addEventListener("pointermove", onPointerMove, { passive: true });
	return () => {
		document.removeEventListener("pointerdown", onPointerDown, true);
		document.removeEventListener("focusin", onFocusIn, true);
		document.removeEventListener("input", onInput, true);
		document.removeEventListener("pointermove", onPointerMove);
		if (moveRaf) cancelAnimationFrame(moveRaf);
		window.clearTimeout(typingTimer);
	};
}
```

```tsx
// src/components/FxCanvas.tsx
import { useEffect, useRef } from "react";
import { bakeAtlas } from "@/lib/fx/atlas";
import { installBindings } from "@/lib/fx/bindings";
import { createBudget } from "@/lib/fx/budget";
import { fxBus } from "@/lib/fx/bus";
import { dispatch } from "@/lib/fx/dispatch";
import { flashAttr, getStage, prefersReducedMotion } from "@/lib/fx/dom";
import { createEngine } from "@/lib/fx/engine";
import { createPool } from "@/lib/fx/pool";
import { createRenderer } from "@/lib/fx/renderer";
import { createRng } from "@/lib/fx/rng";

/** Разовые события, на которые при reduced-motion достаточно статичной вспышки фона. */
const PULSE_EVENTS = new Set(["press", "denied", "success", "error", "result", "balance", "level"]);

/**
 * Холст эффектов поверх интерфейса. Цикл кадров запускается событием и
 * засыпает, когда частиц нет; скрытая вкладка останавливает всё.
 */
export function FxCanvas() {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const pool = createPool(512);
		const rng = createRng((Math.random() * 4294967296) >>> 0);
		const budget = createBudget(40, 10);
		let render: ((prev: any, cur: any) => void) | null = null;

		function ensureRenderer(): void {
			if (render || !ctx) return;
			render = createRenderer(ctx, bakeAtlas(dpr), pool, dpr);
		}

		function resize(): void {
			if (!canvas || !ctx) return;
			canvas.width = Math.round(window.innerWidth * dpr);
			canvas.height = Math.round(window.innerHeight * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		resize();

		const engine = createEngine({
			pool,
			gravity: 380,
			now: () => performance.now(),
			raf: (cb) => requestAnimationFrame(cb),
			caf: (id) => cancelAnimationFrame(id),
			render: (prev, cur) => render?.(prev, cur),
		});

		if (new URLSearchParams(location.search).has("fxstats")) {
			(window as any).__fxStats = engine.stats;
			(window as any).__fxBus = fxBus;
		}

		// атлас запекаем в простое, а не на первом нажатии
		const idle: (cb: () => void) => void =
			(window as any).requestIdleCallback?.bind(window) ?? ((cb) => window.setTimeout(cb, 200));
		idle(ensureRenderer);

		const unsubscribe = fxBus.subscribe((e) => {
			if (prefersReducedMotion()) {
				if (PULSE_EVENTS.has(e.type)) flashAttr(getStage(), "data-fx-pulse", 320);
				return;
			}
			ensureRenderer();
			const spawned = dispatch(e, {
				pool,
				rng,
				budget,
				width: window.innerWidth,
				height: window.innerHeight,
				now: performance.now(),
			});
			if (spawned > 0) engine.wake();
		});

		const uninstall = installBindings({
			bus: fxBus,
			stage: getStage,
			reducedMotion: prefersReducedMotion,
		});

		function onVisibility(): void {
			if (document.hidden) engine.stop();
		}
		function onResize(): void {
			engine.stop();
			resize();
		}
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("resize", onResize);

		return () => {
			unsubscribe();
			uninstall();
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("resize", onResize);
			engine.stop();
		};
	}, []);

	return (
		<canvas
			ref={ref}
			inert
			className="pointer-events-none fixed inset-0 z-[80] size-full"
		/>
	);
}
```

В `src/components/App.tsx`: переименовать существующую функцию `App` в `AppContent` и добавить оболочку (импорт `FxCanvas`):

```tsx
import { FxCanvas } from "./FxCanvas";

export function App() {
	return (
		<>
			<FxCanvas />
			<AppContent />
		</>
	);
}

function AppContent() {
	// … прежнее тело App без изменений …
}
```

Harness для проверок в браузере и дымовой тест:

```ts
// scripts/fx-harness.ts
import path from "node:path";
import { type Browser, chromium, type Page } from "playwright-core";

/**
 * Поднимает собранный `dist/` на свободном порту и открывает его в Chromium с
 * заглушками API, чтобы не нужна была БД. Режимы: `auth` (сессии нет — экран
 * входа) и `app` (демо-пользователь — главная страница).
 * Перед запуском: `bun run build.ts`.
 */
export type PageMode = "auth" | "app";

export interface Harness {
	page: Page;
	browser: Browser;
	close(): Promise<void>;
}

const APP_FIXTURES: Record<string, unknown> = {
	"/api/auth/get-session": {
		user: { id: "u1", email: "demo@gen42.local", name: "Demo" },
	},
	"/api/me": { is_admin: true, balance: 42 },
	"/api/models": [
		{ id: "krea", label: "Krea 2", cost: 1 },
		{ id: "ideogram", label: "Ideogram 4", cost: 3 },
		{ id: "turbo", label: "Турбо", cost: 10 },
	],
	"/api/generations": [],
};

async function findChromium(): Promise<string> {
	const candidates = [
		process.env.CHROMIUM_PATH,
		"/opt/pw-browsers/chromium",
		"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
	].filter(Boolean) as string[];
	for (const p of candidates) if (await Bun.file(p).exists()) return p;
	throw new Error("Chromium не найден: задайте CHROMIUM_PATH");
}

export async function openPage(
	opts: {
		mode?: PageMode;
		viewport?: { width: number; height: number };
		reducedMotion?: boolean;
		dist?: string;
	} = {},
): Promise<Harness> {
	const mode = opts.mode ?? "auth";
	const dist = opts.dist ?? path.join(process.cwd(), "dist");
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			const full = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
			if (!full.startsWith(dist)) return new Response("not found", { status: 404 });
			const file = Bun.file(full);
			return (await file.exists())
				? new Response(file)
				: new Response(Bun.file(path.join(dist, "index.html")));
		},
	});
	const browser = await chromium.launch({
		executablePath: await findChromium(),
		args: ["--no-sandbox"],
	});
	const page = await browser.newPage({
		viewport: opts.viewport ?? { width: 1280, height: 800 },
		reducedMotion: opts.reducedMotion ? "reduce" : "no-preference",
	});
	await page.route("https://fonts.*/**", (r) => r.abort());
	await page.route("**/api/**", (r) => {
		const pathname = new URL(r.request().url()).pathname;
		if (mode === "app" && pathname in APP_FIXTURES) {
			return r.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(APP_FIXTURES[pathname]),
			});
		}
		return r.fulfill({
			status: mode === "app" ? 404 : 401,
			contentType: "application/json",
			body: "{}",
		});
	});
	await page.goto(`http://localhost:${server.port}/?fxstats`);
	await page.waitForSelector(mode === "app" ? "#prompt" : "#email");
	return {
		page,
		browser,
		async close() {
			await browser.close();
			server.stop(true);
		},
	};
}
```

```ts
// scripts/fx-smoke.ts
import { openPage } from "./fx-harness";

const h = await openPage();
const frames = () => h.page.evaluate(() => (window as any).__fxStats.frames as number);
try {
	await h.page.click("#email");
	await h.page.keyboard.type("hello", { delay: 40 });
	await h.page.waitForTimeout(200);
	const during = await frames();
	if (during <= 0) throw new Error("блёстки не рисуются: кадров нет");
	await h.page.waitForTimeout(1500);
	const a = await frames();
	await h.page.waitForTimeout(500);
	const b = await frames();
	if (a !== b) throw new Error(`цикл не уснул: ${a} → ${b}`);
	console.log(`ok: кадров при печати ${during}, после сна ${a}, цикл спит`);
} finally {
	await h.close();
}
```

- [ ] **Step 4: Установить зависимость, запустить тесты и дымовой тест в браузере**

```bash
bun add -d playwright-core
bun test src/lib/__tests__/fx-bindings.test.ts
bun run typecheck
bun run build.ts
bun scripts/fx-smoke.ts
```
Expected: тест PASS; `typecheck` без ошибок; сборка «dist/…»; смоук печатает `ok: кадров при печати N, после сна M, цикл спит`.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add src/lib/fx/dom.ts src/lib/fx/bindings.ts src/components/FxCanvas.tsx src/components/App.tsx scripts/fx-harness.ts scripts/fx-smoke.ts src/lib/__tests__/fx-bindings.test.ts package.json bun.lock
git commit -m "Спецэффекты: холст эффектов, глобальные привязки, блёстки из каретки, дымовой тест в Chromium" -m "$TRAILER"
```

---

### Task 8: Эффекты состояний в базовых компонентах и тест-страж покрытия

**Files:**
- Modify: `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `tabs.tsx`, `select.tsx`, `dropdown-menu.tsx`, `slider.tsx`, `table.tsx`
- Modify: `src/index.css` (раздел состояний)
- Modify: `src/components/{App,Admin,Auth,Generate}.tsx` (атрибут `data-fx` у «голых» элементов — скриптом ниже)
- Test: `src/lib/__tests__/fx-coverage.test.ts`

**Interfaces:**
- Consumes: виды `data-fx` из Task 7 (`press | toggle | item | link | submit | level | field`).
- Produces: гарантия «у каждого интерактивного элемента есть `data-fx`»; CSS-селекторы `[data-fx-denied]`, `[data-fx-error]`, `.fx-row`; атрибуты видов ставятся самими примитивами shadcn.

- [ ] **Step 1: Написать падающий тест-страж**

```ts
// src/lib/__tests__/fx-coverage.test.ts
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const COMPONENTS = path.join(import.meta.dir, "../../components");

/** Открывающие теги интерактивных элементов без `data-fx` (с учётом `>` внутри `{…}`). */
export function rawWithoutFx(source: string): Array<{ line: number; tag: string }> {
	const out: Array<{ line: number; tag: string }> = [];
	const re = /<(button|a|input|textarea|select)(?=[\s>/])/g;
	for (let m = re.exec(source); m; m = re.exec(source)) {
		let depth = 0;
		let quote = "";
		let i = m.index + m[0].length;
		for (; i < source.length; i++) {
			const ch = source[i]!;
			if (quote) {
				if (ch === quote) quote = "";
				continue;
			}
			if (depth === 0 && (ch === '"' || ch === "'")) quote = ch;
			else if (ch === "{") depth++;
			else if (ch === "}") depth--;
			else if (ch === ">" && depth === 0) break;
		}
		const text = source.slice(m.index, i + 1);
		if (!/\bdata-fx\b/.test(text)) {
			out.push({ line: source.slice(0, m.index).split("\n").length, tag: m[1]! });
		}
	}
	return out;
}

describe("rawWithoutFx", () => {
	test("находит тег без data-fx, даже со стрелкой внутри атрибута", () => {
		const src = '<div>\n<button type="button" onClick={() => a > b}>x</button>\n</div>';
		expect(rawWithoutFx(src)).toEqual([{ line: 2, tag: "button" }]);
	});

	test("не трогает теги с data-fx и компоненты с заглавной буквы", () => {
		const src = '<button data-fx="press" type="button">x</button><Button>y</Button><Admin />';
		expect(rawWithoutFx(src)).toEqual([]);
	});
});

describe("покрытие эффектами", () => {
	test("в экранах нет интерактивных элементов без data-fx", () => {
		const problems: string[] = [];
		for (const name of readdirSync(COMPONENTS)) {
			if (!name.endsWith(".tsx")) continue;
			const src = readFileSync(path.join(COMPONENTS, name), "utf8");
			for (const p of rawWithoutFx(src)) problems.push(`${name}:${p.line} <${p.tag}>`);
		}
		expect(problems).toEqual([]);
	});

	test("примитивы shadcn ставят data-fx сами", () => {
		for (const name of ["button", "input", "textarea", "tabs", "select", "dropdown-menu", "slider"]) {
			const src = readFileSync(path.join(COMPONENTS, "ui", `${name}.tsx`), "utf8");
			expect(src).toContain("data-fx=");
		}
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-coverage.test.ts`
Expected: FAIL — «в экранах…» перечисляет «голые» элементы в `App.tsx`, `Admin.tsx`, `Auth.tsx`, `Generate.tsx`, `CodexAccess.tsx`, «примитивы…» падает на `button`.

- [ ] **Step 3: Реализация**

Примитивы shadcn: `data-fx` ставится **до** `{...props}`, чтобы вызывающий мог переопределить вид.

- `src/components/ui/button.tsx`: в `<Comp …>` после `data-size={size}` добавить строку `data-fx="press"`.
- `src/components/ui/input.tsx`: после `data-slot="input"` добавить `data-fx="field"`.
- `src/components/ui/textarea.tsx`: после `data-slot="textarea"` добавить `data-fx="field"`.
- `src/components/ui/tabs.tsx`: у `TabsPrimitive.Trigger` после `data-slot="tabs-trigger"` добавить `data-fx="toggle"`.
- `src/components/ui/select.tsx`: у `SelectTrigger` после `data-slot="select-trigger"` добавить `data-fx="press"`.
- `src/components/ui/dropdown-menu.tsx`: у `DropdownMenuItem` после `data-slot="dropdown-menu-item"` добавить `data-fx="item"`.
- `src/components/ui/slider.tsx`: у `SliderPrimitive.Root` после `data-slot="slider"` добавить `data-fx="level"`.
- `src/components/ui/table.tsx`: в `TableRow` к классам первого аргумента `cn(` добавить `"fx-row"` в начало строки классов: `"fx-row border-b transition-colors hover:bg-muted/50 …"`.

Остальные «голые» элементы экранов размечает скрипт (вид выбирается по тегу: `role="menuitem"` → `item`, `href` → `link`, `setIsLogin` → `toggle`, иначе `press`):

```bash
uv run - <<'EOF'
import pathlib, re

RE = re.compile(r"<(button|a|input|textarea|select)(?=[\s>/])")

def tag_end(src, start):
    depth, quote, i = 0, "", start
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == quote:
                quote = ""
        elif depth == 0 and ch in "\"'":
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == ">" and depth == 0:
            return i
        i += 1
    raise SystemExit("тег не закрыт")

def kind(tag):
    if 'role="menuitem"' in tag:
        return "item"
    if "href=" in tag:
        return "link"
    if "setIsLogin" in tag:
        return "toggle"
    return "press"

for f in sorted(pathlib.Path("src/components").glob("*.tsx")):
    src = f.read_text()
    out, pos, changed = [], 0, False
    for m in RE.finditer(src):
        if m.start() < pos:
            continue
        end = tag_end(src, m.end())
        tag = src[m.start() : end + 1]
        if "data-fx" in tag:
            continue
        out.append(src[pos : m.end()] + f' data-fx="{kind(tag)}"')
        pos = m.end()
        changed = True
    out.append(src[pos:])
    if changed:
        f.write_text("".join(out))
        print("обновлён", f)
EOF
```

CSS состояний (в конец `src/index.css`):

```css
/* ── Спецэффекты: состояния интерактивных элементов ─────────────────────
   Правила вне @layer перекрывают утилиты Tailwind. Анимируются только
   transform/translate/opacity; box-shadow меняется лишь переходом при
   наведении, а не постоянной анимацией. */
[data-fx="press"],
[data-fx="toggle"],
[data-fx="item"],
[data-fx="link"],
[data-fx="submit"] {
  transition:
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease,
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.25s ease;
}

[data-fx="press"]:not(:disabled):hover,
[data-fx="toggle"]:not(:disabled):hover,
[data-fx="submit"]:not(:disabled):hover {
  box-shadow:
    0 0 0 1px rgb(108 92 255 / 0.45),
    0 10px 30px -12px rgb(255 92 168 / 0.55);
}

[data-fx="press"]:not(:disabled):active,
[data-fx="toggle"]:not(:disabled):active,
[data-fx="submit"]:not(:disabled):active,
[data-fx="item"]:active,
[data-fx="link"]:active {
  transform: scale(0.96);
}

[data-fx="field"],
[data-slot="input-group"] {
  transition:
    box-shadow 0.3s ease,
    border-color 0.3s ease;
}

/* свечение рисует группа (скруглённая обводка), а не вложенное поле группы */
[data-fx="field"]:not([data-slot="input-group-control"]):focus-visible,
[data-slot="input-group"]:focus-within {
  border-color: rgb(255 92 168 / 0.7);
  box-shadow:
    0 0 0 3px rgb(108 92 255 / 0.28),
    0 18px 60px -22px rgb(255 92 168 / 0.55);
}

/* отказ и ошибка: встряска. Вешать на элемент без собственной анимации появления
   (иначе после встряски `animate-pop-in` проиграется заново) */
[data-fx-denied],
[data-fx-error] {
  animation: fx-shake 0.35s ease;
}

@keyframes fx-shake {
  20% {
    translate: -4px 0;
  }
  40% {
    translate: 4px 0;
  }
  60% {
    translate: -3px 0;
  }
  80% {
    translate: 2px 0;
  }
  100% {
    translate: 0 0;
  }
}

/* строки таблиц админки: светящаяся кромка слева при наведении */
.fx-row:hover {
  background-image: linear-gradient(90deg, rgb(255 92 168 / 0.14), transparent 45%);
}

@media (prefers-reduced-motion: reduce) {
  [data-fx-denied],
  [data-fx-error] {
    animation: none;
  }

  [data-fx]:not(:disabled):active {
    transform: none;
  }
}
```

- [ ] **Step 4: Запустить тесты и проверку типов**

Run: `bun test src/lib/__tests__/fx-coverage.test.ts && bun run typecheck && bun run build.ts && bun scripts/fx-smoke.ts`
Expected: PASS; сборка успешна; смоук `ok: …`.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add -A src/components src/index.css src/lib/__tests__/fx-coverage.test.ts
git commit -m "Спецэффекты: data-fx в примитивах shadcn, состояния элементов и тест-страж покрытия" -m "$TRAILER"
```

---

### Task 9: Раскладка, детальные объекты декора и SVG-тайлы глубин

**Files:**
- Create: `src/lib/fx/scatter.ts`
- Create: `src/lib/fx/decor.ts`
- Create: `src/lib/fx/tile.ts`
- Test: `src/lib/__tests__/fx-tile.test.ts`

**Interfaces:**
- Consumes: `createRng` (Task 1).
- Produces:
  - `scatter.ts`: `interface Point { x: number; y: number }`; `scatter(rng: () => number, w: number, h: number, count: number, candidates?: number): Point[]` (best-candidate на торе: точки равномерно покрывают площадь и бесшовно стыкуются при повторении тайла).
  - `decor.ts`: `interface Palette { name: string; light: string; mid: string; deep: string }`; `PALETTES: readonly Palette[]` (индиго, фуксия, золото); `DECOR_KINDS` (10 видов: `cluster | gem | orb | star | comet | prism | coins | bolt | flower | spiral`); `type DecorKind`; `decorSvg(kind: DecorKind, palette: Palette, id: string): string` (разметка в квадрате 100×100, все `id` начинаются с `id`); `starPoints(cx: number, cy: number, r: number): string`.
  - `tile.ts`: `TILE_W = 960`, `TILE_H = 720`; `interface DepthSpec { count; min; max; opacity; blur; dust; seed }`; `DEPTHS: readonly DepthSpec[]` (0 — дальний, 1 — средний, 2 — ближний); `NEAR_OPACITY`, `CALM_MIN_ALPHA = 0.3`, `CALM_MAX_ALPHA = 0.55`; `interface Placed { kind: DecorKind; palette: number; x; y; size; rot }`; `plan(depth: number): { objects: Placed[]; dust: Array<{ x; y; r; color }> }`; `wrapOffsets(x, y, size): Array<[number, number]>`; `tileSvg(depth: number): string`.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-tile.test.ts
import { describe, expect, test } from "bun:test";
import { DECOR_KINDS, decorSvg, PALETTES } from "../fx/decor";
import { createRng } from "../fx/rng";
import { scatter } from "../fx/scatter";
import { DEPTHS, plan, TILE_H, TILE_W, tileSvg, wrapOffsets } from "../fx/tile";

function torusDist(a: { x: number; y: number }, b: { x: number; y: number }) {
	let dx = Math.abs(a.x - b.x);
	if (dx > TILE_W / 2) dx = TILE_W - dx;
	let dy = Math.abs(a.y - b.y);
	if (dy > TILE_H / 2) dy = TILE_H - dy;
	return Math.hypot(dx, dy);
}

function cellCounts(points: Array<{ x: number; y: number }>, cx: number, cy: number) {
	const grid = new Array<number>(cx * cy).fill(0);
	for (const p of points) {
		const gx = Math.min(cx - 1, Math.floor((p.x / TILE_W) * cx));
		const gy = Math.min(cy - 1, Math.floor((p.y / TILE_H) * cy));
		grid[gy * cx + gx]!++;
	}
	return grid;
}

describe("scatter", () => {
	test("детерминирован и держится в границах", () => {
		const a = scatter(createRng(5), TILE_W, TILE_H, 30);
		const b = scatter(createRng(5), TILE_W, TILE_H, 30);
		expect(a).toEqual(b);
		for (const p of a) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThan(TILE_W);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThan(TILE_H);
		}
	});

	test("точки не слипаются (расстояние на торе)", () => {
		const pts = scatter(createRng(DEPTHS[0]!.seed), TILE_W, TILE_H, DEPTHS[0]!.count);
		let min = Infinity;
		for (let i = 0; i < pts.length; i++) {
			for (let j = i + 1; j < pts.length; j++) {
				min = Math.min(min, torusDist(pts[i]!, pts[j]!));
			}
		}
		expect(min).toBeGreaterThan(60);
	});
});

describe("покрытие: нет обделённых мест", () => {
	test("каждый дальний слой закрывает все клетки 4×3", () => {
		const cells = cellCounts(plan(0).objects, 4, 3);
		expect(Math.min(...cells)).toBeGreaterThanOrEqual(1);
	});

	test("три слоя вместе дают минимум два объекта в каждой клетке 4×3", () => {
		const all = [0, 1, 2].flatMap((d) => plan(d).objects);
		const cells = cellCounts(all, 4, 3);
		expect(Math.min(...cells)).toBeGreaterThanOrEqual(2);
	});

	test("в плане столько объектов, сколько задано глубиной", () => {
		for (let d = 0; d < 3; d++) {
			expect(plan(d).objects.length).toBe(DEPTHS[d]!.count);
			expect(plan(d).dust.length).toBe(DEPTHS[d]!.dust);
		}
	});
});

describe("wrapOffsets", () => {
	test("в центре одна копия, у края две, в углу четыре", () => {
		expect(wrapOffsets(480, 360, 100)).toEqual([[0, 0]]);
		expect(wrapOffsets(10, 360, 100)).toHaveLength(2);
		expect(wrapOffsets(10, 10, 100)).toHaveLength(4);
		expect(wrapOffsets(950, 710, 100)).toHaveLength(4);
	});
});

describe("decorSvg", () => {
	const allowed = new Set(
		PALETTES.flatMap((p) => [p.light, p.mid, p.deep].map((c) => c.toLowerCase())),
	);

	test("десять видов × три цвета: непустая детальная разметка", () => {
		expect(DECOR_KINDS).toHaveLength(10);
		const seen = new Set<string>();
		for (const kind of DECOR_KINDS) {
			for (const palette of PALETTES) {
				const svg = decorSvg(kind, palette, "t1_");
				expect(svg.length).toBeGreaterThan(250);
				expect(svg).not.toContain("NaN");
				expect(svg).not.toContain("undefined");
				for (const m of svg.matchAll(/\bid="([^"]+)"/g)) {
					expect(m[1]!.startsWith("t1_")).toBe(true);
				}
				seen.add(svg);
			}
		}
		expect(seen.size).toBe(30);
	});

	test("только цвета палитры: никакого чисто-белого (контраст текста)", () => {
		for (const kind of DECOR_KINDS) {
			for (const palette of PALETTES) {
				const svg = decorSvg(kind, palette, "t2_");
				expect(svg).not.toMatch(/white/i);
				for (const m of svg.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
					expect(allowed.has(m[0].toLowerCase())).toBe(true);
				}
			}
		}
	});

	test("детерминирован", () => {
		expect(decorSvg("gem", PALETTES[0]!, "x_")).toBe(decorSvg("gem", PALETTES[0]!, "x_"));
	});
});

describe("tileSvg", () => {
	test("корректный SVG, детерминирован, глубины различаются, размер разумный", () => {
		const tiles = [0, 1, 2].map((d) => tileSvg(d));
		expect(new Set(tiles).size).toBe(3);
		for (let d = 0; d < 3; d++) {
			const svg = tiles[d]!;
			expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
			expect(svg).toContain(`viewBox="0 0 ${TILE_W} ${TILE_H}"`);
			expect((svg.match(/<use /g) ?? []).length).toBeGreaterThanOrEqual(DEPTHS[d]!.count);
			expect(svg).toBe(tileSvg(d));
			expect(svg.length).toBeLessThan(400_000);
			expect(svg).not.toContain("NaN");
		}
	});

	test("размытие запечено только в дальних слоях", () => {
		expect(tileSvg(0)).toContain("feGaussianBlur");
		expect(tileSvg(2)).not.toContain("feGaussianBlur");
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-tile.test.ts`
Expected: FAIL (`Cannot find module '../fx/decor'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/scatter.ts
export interface Point {
	x: number;
	y: number;
}

function torusDist2(a: Point, b: Point, w: number, h: number): number {
	let dx = Math.abs(a.x - b.x);
	if (dx > w / 2) dx = w - dx;
	let dy = Math.abs(a.y - b.y);
	if (dy > h / 2) dy = h - dy;
	return dx * dx + dy * dy;
}

/**
 * Алгоритм best-candidate (Митчелл): каждую следующую точку выбираем из
 * `candidates` случайных как самую удалённую от уже поставленных. Расстояние
 * считается на торе, поэтому при повторении тайла швов и кучек нет.
 */
export function scatter(
	rng: () => number,
	w: number,
	h: number,
	count: number,
	candidates = 12,
): Point[] {
	const pts: Point[] = [];
	for (let i = 0; i < count; i++) {
		let best: Point = { x: 0, y: 0 };
		let bestD = -1;
		const tries = i === 0 ? 1 : candidates;
		for (let c = 0; c < tries; c++) {
			const p = { x: rng() * w, y: rng() * h };
			let d = Infinity;
			for (const q of pts) {
				const dd = torusDist2(p, q, w, h);
				if (dd < d) d = dd;
			}
			if (d > bestD) {
				bestD = d;
				best = p;
			}
		}
		pts.push(best);
	}
	return pts;
}
```

```ts
// src/lib/fx/decor.ts
/**
 * Детальные объекты декора (замена 30 плоских значков): грани, градиенты,
 * блики. Каждый рисуется в квадрате 100×100 только цветами палитры (чисто-белого
 * нет — от него падает контраст текста). Идентификаторы градиентов начинаются
 * с переданного `id`, поэтому объекты в одном SVG не конфликтуют.
 */
export interface Palette {
	name: string;
	light: string;
	mid: string;
	deep: string;
}

export const PALETTES: readonly Palette[] = [
	{ name: "indigo", light: "#a79cff", mid: "#6c5cff", deep: "#3a2fb0" },
	{ name: "fuchsia", light: "#ff9ccb", mid: "#ff5ca8", deep: "#b02a6f" },
	{ name: "gold", light: "#fff0a8", mid: "#ffd54a", deep: "#c28a10" },
];

export const DECOR_KINDS = [
	"cluster",
	"gem",
	"orb",
	"star",
	"comet",
	"prism",
	"coins",
	"bolt",
	"flower",
	"spiral",
] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

const f = (n: number): number => Math.round(n * 100) / 100;
const pts = (list: Array<[number, number]>): string =>
	list.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

function lin(id: string, from: string, to: string): string {
	return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
}

function radial(id: string, from: string, to: string): string {
	return `<radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>`;
}

function poly(points: Array<[number, number]>, fill: string, extra = ""): string {
	return `<polygon points="${pts(points)}" fill="${fill}"${extra}/>`;
}

/** Четырёхлучевая искра: вершины многоугольника */
export function starPoints(cx: number, cy: number, r: number): string {
	return pts([
		[cx, cy - r],
		[cx + r * 0.22, cy - r * 0.22],
		[cx + r, cy],
		[cx + r * 0.22, cy + r * 0.22],
		[cx, cy + r],
		[cx - r * 0.22, cy + r * 0.22],
		[cx - r, cy],
		[cx - r * 0.22, cy - r * 0.22],
	]);
}

const star4 = (cx: number, cy: number, r: number, fill: string): string =>
	`<polygon points="${starPoints(cx, cy, r)}" fill="${fill}"/>`;

function cluster(p: Palette, id: string): string {
	const l = `url(#${id}l)`;
	const r = `url(#${id}r)`;
	return (
		`<defs>${lin(`${id}l`, p.light, p.mid)}${lin(`${id}r`, p.mid, p.deep)}</defs>` +
		poly([[38, 92], [38, 34], [50, 12], [50, 92]], l) +
		poly([[50, 92], [50, 12], [62, 34], [62, 92]], r) +
		poly([[38, 34], [50, 12], [62, 34], [50, 41]], p.light, ' opacity="0.9"') +
		poly([[14, 92], [14, 54], [22, 40], [22, 92]], l) +
		poly([[22, 92], [22, 40], [30, 54], [30, 92]], r) +
		poly([[14, 54], [22, 40], [30, 54], [22, 59]], p.light, ' opacity="0.9"') +
		poly([[70, 92], [70, 62], [78, 48], [78, 92]], l) +
		poly([[78, 92], [78, 48], [86, 62], [86, 92]], r) +
		poly([[70, 62], [78, 48], [86, 62], [78, 67]], p.light, ' opacity="0.9"') +
		star4(50, 30, 9, p.light)
	);
}

function gem(p: Palette, id: string): string {
	return (
		`<defs>${lin(`${id}c`, p.light, p.mid)}${lin(`${id}p`, p.mid, p.deep)}</defs>` +
		poly([[22, 40], [30, 20], [70, 20], [78, 40]], `url(#${id}c)`) +
		poly([[30, 20], [50, 20], [50, 40], [22, 40]], p.light, ' opacity="0.55"') +
		poly([[50, 20], [70, 20], [78, 40], [50, 40]], p.mid, ' opacity="0.5"') +
		poly([[22, 40], [78, 40], [50, 90]], `url(#${id}p)`) +
		poly([[22, 40], [50, 40], [50, 90]], p.mid, ' opacity="0.6"') +
		poly([[36, 40], [50, 40], [50, 90]], p.light, ' opacity="0.35"') +
		poly([[22, 40], [30, 20], [70, 20], [78, 40], [50, 90]], "none", ` stroke="${p.light}" stroke-width="1.2" opacity="0.7"`) +
		star4(38, 28, 8, p.light)
	);
}

function orb(p: Palette, id: string): string {
	return (
		`<defs>${radial(`${id}o`, p.light, p.deep)}</defs>` +
		`<ellipse cx="50" cy="50" rx="44" ry="13" transform="rotate(-24 50 50)" fill="none" stroke="${p.mid}" stroke-width="3" opacity="0.85"/>` +
		`<circle cx="50" cy="50" r="24" fill="url(#${id}o)"/>` +
		`<ellipse cx="42" cy="40" rx="8" ry="5" transform="rotate(-30 42 40)" fill="${p.light}" opacity="0.7"/>` +
		`<ellipse cx="50" cy="50" rx="40" ry="10" transform="rotate(32 50 50)" fill="none" stroke="${p.light}" stroke-width="2.5" opacity="0.9"/>` +
		star4(90, 38, 7, p.light) +
		star4(10, 64, 5, p.light)
	);
}

function star(p: Palette, id: string): string {
	const ring = (outer: number, inner: number): Array<[number, number]> =>
		Array.from({ length: 16 }, (_, i): [number, number] => {
			const r = i % 2 === 0 ? outer : inner;
			const a = (i * Math.PI) / 8 - Math.PI / 2;
			return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
		});
	return (
		`<defs>${lin(`${id}s`, p.light, p.deep)}</defs>` +
		poly(ring(46, 19), `url(#${id}s)`) +
		poly(ring(26, 11), p.light, ' opacity="0.8"') +
		`<circle cx="50" cy="50" r="6" fill="${p.mid}"/>` +
		`<line x1="50" y1="2" x2="50" y2="98" stroke="${p.light}" stroke-width="1.2" opacity="0.6"/>` +
		`<line x1="2" y1="50" x2="98" y2="50" stroke="${p.light}" stroke-width="1.2" opacity="0.6"/>`
	);
}

function comet(p: Palette, id: string): string {
	return (
		`<defs><linearGradient id="${id}t" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.mid}" stop-opacity="0"/></linearGradient>${radial(`${id}h`, p.light, p.mid)}</defs>` +
		poly([[72, 18], [8, 72], [18, 84], [86, 40]], `url(#${id}t)`) +
		poly([[78, 26], [26, 80], [32, 86], [88, 36]], p.light, ' opacity="0.35"') +
		`<circle cx="72" cy="30" r="15" fill="url(#${id}h)"/>` +
		`<circle cx="67" cy="25" r="4" fill="${p.light}" opacity="0.8"/>` +
		star4(30, 40, 5, p.light) +
		star4(46, 22, 4, p.mid) +
		star4(18, 60, 4, p.light)
	);
}

function prism(p: Palette, id: string): string {
	const beam = (y: number, color: string) =>
		`<line x1="64" y1="56" x2="98" y2="${y}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
	return (
		`<defs>${lin(`${id}p`, p.light, p.deep)}</defs>` +
		poly([[50, 12], [84, 80], [16, 80]], `url(#${id}p)`) +
		poly([[50, 12], [50, 80], [16, 80]], p.light, ' opacity="0.35"') +
		poly([[50, 12], [84, 80], [16, 80]], "none", ` stroke="${p.light}" stroke-width="1.5"`) +
		`<line x1="2" y1="58" x2="38" y2="52" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/>` +
		beam(40, PALETTES[0]!.mid) +
		beam(54, PALETTES[1]!.mid) +
		beam(68, PALETTES[2]!.mid)
	);
}

function coins(p: Palette, id: string): string {
	let out = `<defs>${lin(`${id}s`, p.mid, p.deep)}${lin(`${id}t`, p.light, p.mid)}</defs>`;
	for (const y of [72, 58, 44]) {
		out +=
			`<path d="M18 ${y} a32 12 0 0 0 64 0 v10 a32 12 0 0 1 -64 0 z" fill="url(#${id}s)"/>` +
			`<ellipse cx="50" cy="${y}" rx="32" ry="12" fill="url(#${id}t)"/>` +
			`<ellipse cx="50" cy="${y}" rx="22" ry="7.5" fill="none" stroke="${p.deep}" stroke-width="1.4" opacity="0.6"/>`;
	}
	return out + star4(36, 40, 6, p.light);
}

function bolt(p: Palette, id: string): string {
	return (
		`<defs>${lin(`${id}b`, p.light, p.mid)}</defs>` +
		poly([[58, 4], [24, 54], [46, 54], [36, 96], [78, 40], [54, 40]], `url(#${id}b)`) +
		poly([[58, 4], [24, 54], [40, 54], [52, 26]], p.light, ' opacity="0.55"') +
		poly([[58, 4], [24, 54], [46, 54], [36, 96], [78, 40], [54, 40]], "none", ` stroke="${p.deep}" stroke-width="1.4"`) +
		star4(70, 24, 6, p.light)
	);
}

function flower(p: Palette): string {
	let out = "";
	for (let k = 0; k < 6; k++) {
		out +=
			`<g transform="rotate(${k * 60} 50 50)">` +
			poly([[50, 50], [40, 28], [50, 6]], p.deep) +
			poly([[50, 50], [50, 6], [60, 28]], p.mid) +
			poly([[50, 50], [50, 6], [55, 22]], p.light, ' opacity="0.6"') +
			"</g>";
	}
	return out + `<circle cx="50" cy="50" r="10" fill="${p.light}"/><circle cx="50" cy="50" r="5" fill="${p.mid}"/>`;
}

function spiral(p: Palette): string {
	let out = "";
	for (let i = 0; i < 14; i++) {
		const t = i / 13;
		const a = t * Math.PI * 6;
		const rad = 6 + t * 38;
		const cx = 50 + Math.cos(a) * rad;
		const cy = 50 + Math.sin(a) * rad;
		const r = 7 - t * 4.5;
		out +=
			`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${t < 0.34 ? p.light : t < 0.67 ? p.mid : p.deep}"/>` +
			`<circle cx="${f(cx - r * 0.3)}" cy="${f(cy - r * 0.3)}" r="${f(r * 0.35)}" fill="${p.light}" opacity="0.8"/>`;
	}
	return out;
}

export function decorSvg(kind: DecorKind, palette: Palette, id: string): string {
	switch (kind) {
		case "cluster":
			return cluster(palette, id);
		case "gem":
			return gem(palette, id);
		case "orb":
			return orb(palette, id);
		case "star":
			return star(palette, id);
		case "comet":
			return comet(palette, id);
		case "prism":
			return prism(palette, id);
		case "coins":
			return coins(palette, id);
		case "bolt":
			return bolt(palette, id);
		case "flower":
			return flower(palette);
		case "spiral":
			return spiral(palette);
	}
}
```

```ts
// src/lib/fx/tile.ts
import { DECOR_KINDS, type DecorKind, decorSvg, PALETTES, starPoints } from "./decor";
import { createRng } from "./rng";
import { scatter } from "./scatter";

/**
 * SVG-тайл слоя глубины. Он рисуется браузером один раз и дальше его двигает
 * только композитор. Размытие дальних объектов запечено в тайл (фильтр в
 * постоянном фоне запрещён). Объекты у краёв дублируются со сдвигом на размер
 * тайла, поэтому повторение бесшовное.
 */
export const TILE_W = 960;
export const TILE_H = 720;

export interface DepthSpec {
	count: number;
	min: number;
	max: number;
	opacity: number;
	/** stdDeviation размытия, запечённого в тайл */
	blur: number;
	dust: number;
	seed: number;
}

/** 0 — дальний (мелкий, мягкий), 1 — средний, 2 — ближний (крупный, чёткий) */
export const DEPTHS: readonly DepthSpec[] = [
	{ count: 22, min: 22, max: 36, opacity: 0.3, blur: 1.4, dust: 30, seed: 4201 },
	{ count: 12, min: 44, max: 68, opacity: 0.45, blur: 0.5, dust: 14, seed: 4202 },
	{ count: 6, min: 72, max: 110, opacity: 0.6, blur: 0, dust: 6, seed: 4203 },
];

/** Предельная яркость фона под текстом: от неё считается контраст (тест Task 10) */
export const NEAR_OPACITY = DEPTHS[2]!.opacity;
/** Затемнение «зоны покоя» по краю и в центре, значения совпадают с index.css */
export const CALM_MIN_ALPHA = 0.3;
export const CALM_MAX_ALPHA = 0.55;

export interface Placed {
	kind: DecorKind;
	palette: number;
	x: number;
	y: number;
	size: number;
	rot: number;
}

export interface Dust {
	x: number;
	y: number;
	r: number;
	color: string;
}

export function plan(depth: number): { objects: Placed[]; dust: Dust[] } {
	const spec = DEPTHS[depth]!;
	const rng = createRng(spec.seed);
	const points = scatter(rng, TILE_W, TILE_H, spec.count);
	const objects: Placed[] = points.map((p, i) => ({
		kind: DECOR_KINDS[(i + Math.floor(rng() * DECOR_KINDS.length)) % DECOR_KINDS.length]!,
		palette: Math.floor(rng() * PALETTES.length),
		x: p.x,
		y: p.y,
		size: spec.min + rng() * (spec.max - spec.min),
		rot: (rng() - 0.5) * 50,
	}));
	const dust: Dust[] = scatter(rng, TILE_W, TILE_H, spec.dust, 4).map((p) => ({
		x: p.x,
		y: p.y,
		r: 3 + rng() * 2.5 * (depth + 1),
		color: PALETTES[Math.floor(rng() * PALETTES.length)]!.light,
	}));
	return { objects, dust };
}

/** Копии объекта, пересекающего край тайла (для бесшовного стыка). */
export function wrapOffsets(x: number, y: number, size: number): Array<[number, number]> {
	const reach = size * 0.75;
	const dxs = [0];
	if (x < reach) dxs.push(TILE_W);
	if (x > TILE_W - reach) dxs.push(-TILE_W);
	const dys = [0];
	if (y < reach) dys.push(TILE_H);
	if (y > TILE_H - reach) dys.push(-TILE_H);
	const out: Array<[number, number]> = [];
	for (const dx of dxs) for (const dy of dys) out.push([dx, dy]);
	return out;
}

const f = (n: number): number => Math.round(n * 100) / 100;

export function tileSvg(depth: number): string {
	const spec = DEPTHS[depth]!;
	const { objects, dust } = plan(depth);
	const defs: string[] = [];
	const uses: string[] = [];
	objects.forEach((o, i) => {
		defs.push(
			`<g id="o${depth}_${i}">${decorSvg(o.kind, PALETTES[o.palette]!, `d${depth}_${i}_`)}</g>`,
		);
		const s = f(o.size / 100);
		for (const [dx, dy] of wrapOffsets(o.x, o.y, o.size)) {
			uses.push(
				`<use href="#o${depth}_${i}" transform="translate(${f(o.x + dx)} ${f(o.y + dy)}) rotate(${f(o.rot)}) scale(${s}) translate(-50 -50)"/>`,
			);
		}
	});
	const dustMarkup = dust
		.flatMap((d) =>
			wrapOffsets(d.x, d.y, d.r * 2).map(
				([dx, dy]) =>
					`<polygon points="${starPoints(f(d.x + dx), f(d.y + dy), f(d.r))}" fill="${d.color}"/>`,
			),
		)
		.join("");
	const filter =
		spec.blur > 0
			? `<filter id="b${depth}" filterUnits="userSpaceOnUse" x="-120" y="-120" width="${TILE_W + 240}" height="${TILE_H + 240}"><feGaussianBlur stdDeviation="${spec.blur}"/></filter>`
			: "";
	const apply = spec.blur > 0 ? ` filter="url(#b${depth})"` : "";
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}" viewBox="0 0 ${TILE_W} ${TILE_H}">` +
		`<defs>${filter}${defs.join("")}</defs>` +
		`<g opacity="${spec.opacity}"${apply}>${dustMarkup}${uses.join("")}</g></svg>`
	);
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `bun test src/lib/__tests__/fx-tile.test.ts`
Expected: PASS. Расчёт при составлении плана показал: при `seed` 4201–4203 и числе объектов 22/12/6 объединение трёх слоёв даёт минимум 2 объекта в каждой клетке 4×3, дальний слой закрывает все клетки 4×3 (минимум 1), минимальное расстояние в дальнем слое 95 px. Если после правки алгоритма какая-то клетка опустеет, менять нужно только значения `seed` в `DEPTHS`.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint && bun run typecheck
git add src/lib/fx/scatter.ts src/lib/fx/decor.ts src/lib/fx/tile.ts src/lib/__tests__/fx-tile.test.ts
git commit -m "Спецэффекты: равномерная раскладка, десять детальных объектов декора и бесшовные SVG-тайлы глубин" -m "$TRAILER"
```

---

### Task 10: Фон Stage вместо разрозненного декора

**Files:**
- Create: `src/components/Stage.tsx`
- Modify: `src/index.css` (раздел Stage; удалить `.pop-mesh`)
- Modify: `src/components/App.tsx`, `src/components/Auth.tsx`, `src/components/Admin.tsx`, `src/components/graphics.tsx`
- Delete: `src/components/DecoScatter.tsx`, `src/components/graphics-bg.tsx`
- Test: `src/lib/__tests__/fx-stage.test.ts`

**Interfaces:**
- Consumes: `DEPTHS`, `tileSvg`, `TILE_W`, `TILE_H`, `NEAR_OPACITY`, `CALM_MIN_ALPHA`, `CALM_MAX_ALPHA` (Task 9); `PALETTES` (Task 9); `setStageAttr` (Task 7) — атрибуты `data-mode`, `data-busy`, `data-typing`, `data-fx-pulse` на корне `[data-slot="stage"]`.
- Produces: `export function Stage(): JSX.Element` — корень с `data-slot="stage"`; CSS-переменные `--px`, `--py` (параллакс, -1..1), `--lx`, `--ly` (свет за курсором, px).

- [ ] **Step 1: Написать падающий тест** (контраст текста — гарантия читаемости, плюс сверка констант с CSS)

```ts
// src/lib/__tests__/fx-stage.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PALETTES } from "../fx/decor";
import { CALM_MAX_ALPHA, CALM_MIN_ALPHA, NEAR_OPACITY, TILE_H, TILE_W } from "../fx/tile";

type RGB = [number, number, number];

const BG: RGB = [13, 11, 30]; // --color-background #0d0b1e
const TEXT: RGB = [242, 239, 255]; // --color-foreground #f2efff

function hex(h: string): RGB {
	return [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as RGB;
}

function lum([r, g, b]: RGB): number {
	const lin = (c: number) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}

/** Смешивание в sRGB, как у браузера: top с непрозрачностью alpha поверх bottom */
function over(top: RGB, alpha: number, bottom: RGB): RGB {
	return top.map((c, i) => c * alpha + bottom[i]! * (1 - alpha)) as RGB;
}

const css = readFileSync(path.join(import.meta.dir, "../../index.css"), "utf8");

describe("читаемость текста поверх фона", () => {
	test("самый яркий цвет декора на ближнем слое под самой слабой зоной покоя даёт контраст ≥ 4,5", () => {
		const brightest = PALETTES.flatMap((p) => [p.light, p.mid, p.deep])
			.map(hex)
			.sort((a, b) => lum(b) - lum(a))[0]!;
		const decorOverBg = over(brightest, NEAR_OPACITY, BG);
		const underCalm = over(BG, CALM_MIN_ALPHA, decorOverBg);
		expect(contrast(TEXT, underCalm)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("константы фона совпадают с CSS", () => {
	test("зона покоя и размер тайла записаны в index.css теми же числами", () => {
		expect(css).toContain(`rgb(13 11 30 / ${CALM_MIN_ALPHA})`);
		expect(css).toContain(`rgb(13 11 30 / ${CALM_MAX_ALPHA})`);
		expect(css).toContain(`background-size: ${TILE_W}px ${TILE_H}px`);
		expect(css).toContain(`translate3d(-${TILE_W}px, -${TILE_H}px, 0)`);
	});

	test("в постоянных анимациях фона нет filter, mix-blend-mode и backdrop-filter", () => {
		const start = css.indexOf("/* ── Фон Stage");
		const end = css.indexOf("/* ── конец Stage");
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const stage = css.slice(start, end);
		expect(stage).not.toMatch(/(?<!-)filter\s*:/);
		expect(stage).not.toContain("mix-blend-mode");
		expect(stage).not.toContain("backdrop-filter");
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-stage.test.ts`
Expected: FAIL — первый тест проходит, два других падают (в `index.css` ещё нет раздела Stage).

- [ ] **Step 3: Реализация**

CSS: в конец `src/index.css` добавить раздел (комментарии-границы используются тестом), а блок `.pop-mesh { … }` внутри `@layer utilities` удалить:

```css
/* ── Фон Stage ──────────────────────────────────────────────────────────
   Только transform/translate/opacity: слои двигает композитор, JS в кадре
   не участвует. Тайлы глубин (SVG) подставляет Stage.tsx через --tile-N. */
.stage {
  position: fixed;
  inset: 0;
  z-index: -10;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
  --px: 0;
  --py: 0;
  --lx: 50vw;
  --ly: 30vh;
}

.stage-mesh {
  position: absolute;
  inset: -20%;
  animation: stage-breathe 28s ease-in-out infinite alternate;
  will-change: transform;
}

.stage-mesh::before,
.stage-mesh::after {
  content: "";
  position: absolute;
  inset: 0;
  transition: opacity 0.8s ease;
}

.stage-mesh::before {
  background:
    radial-gradient(ellipse 50% 40% at 18% 8%, rgb(108 92 255 / 0.3), transparent 70%),
    radial-gradient(ellipse 45% 38% at 88% 96%, rgb(255 92 168 / 0.2), transparent 70%);
}

.stage-mesh::after {
  opacity: 0;
  background:
    radial-gradient(ellipse 50% 40% at 82% 10%, rgb(255 92 168 / 0.3), transparent 70%),
    radial-gradient(ellipse 45% 38% at 14% 94%, rgb(255 213 74 / 0.18), transparent 70%);
}

.stage[data-mode="turbo"] .stage-mesh::after {
  opacity: 1;
}

.stage[data-mode="turbo"] .stage-mesh::before {
  opacity: 0.35;
}

@keyframes stage-breathe {
  from {
    transform: translate3d(-2%, -1%, 0) scale(1);
  }
  to {
    transform: translate3d(2%, 1.5%, 0) scale(1.06);
  }
}

.stage-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(100% + 960px);
  height: calc(100% + 720px);
  background-size: 960px 720px;
  background-repeat: repeat;
  animation: stage-drift var(--dur, 160s) linear infinite;
  will-change: transform;
  translate: calc(var(--px) * var(--k, 6px)) calc(var(--py) * var(--k, 6px));
  transition: translate 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.stage-layer[data-depth="0"] {
  background-image: var(--tile-0);
  --dur: 220s;
  --k: 6px;
}

.stage-layer[data-depth="1"] {
  background-image: var(--tile-1);
  --dur: 150s;
  --k: 14px;
}

.stage-layer[data-depth="2"] {
  background-image: var(--tile-2);
  --dur: 100s;
  --k: 28px;
}

@keyframes stage-drift {
  to {
    transform: translate3d(-960px, -720px, 0);
  }
}

/* зона покоя: читаемость текста (значения проверяет fx-stage.test.ts) */
.stage-calm {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 60% 85% at 50% 45%,
    rgb(13 11 30 / 0.55) 0%,
    rgb(13 11 30 / 0.55) 40%,
    rgb(13 11 30 / 0.3) 100%
  );
}

.stage-light {
  position: absolute;
  left: 0;
  top: 0;
  width: 560px;
  height: 560px;
  margin: -280px 0 0 -280px;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgb(255 92 168 / 0.22),
    rgb(108 92 255 / 0.12) 55%,
    transparent 75%
  );
  transform: translate3d(var(--lx), var(--ly), 0);
  opacity: 0.7;
  transition:
    transform 0.25s ease-out,
    opacity 0.4s ease;
}

.stage[data-typing] .stage-light,
.stage[data-busy] .stage-light {
  opacity: 1;
}

.stage[data-busy] .stage-mesh::before {
  opacity: 1;
}

/* статичная вспышка (reduced-motion и разовые события): псевдоэлемент зоны покоя,
   отдельный элемент дал бы лишний композитный слой */
.stage-calm::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, rgb(255 213 74 / 0.18), transparent 70%);
  opacity: 0;
  transition: opacity 0.35s ease;
}

.stage[data-fx-pulse] .stage-calm::after {
  opacity: 1;
  transition-duration: 0.08s;
}

@media (prefers-reduced-motion: reduce) {
  .stage-mesh,
  .stage-layer {
    animation: none;
  }

  .stage-layer {
    translate: none;
    transition: none;
  }

  .stage-light {
    display: none;
  }
}
/* ── конец Stage ───────────────────────────────────────────────────── */
```

```tsx
// src/components/Stage.tsx
import { useLayoutEffect, useRef } from "react";
import { DEPTHS, tileSvg } from "@/lib/fx/tile";

/**
 * Единый фон всех экранов: mesh-свет, три слоя глубины (детальные объекты и
 * пыль в SVG-тайлах), зона покоя под текстом (она же несёт статичную вспышку) и свет за курсором.
 * Монтируется один раз в App. Тайлы строятся один раз при загрузке и
 * подставляются как blob-изображения.
 */
export function Stage() {
	const ref = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const root = ref.current;
		if (!root) return;
		const urls = DEPTHS.map((_, depth) =>
			URL.createObjectURL(new Blob([tileSvg(depth)], { type: "image/svg+xml" })),
		);
		for (const [depth, url] of urls.entries()) {
			root.style.setProperty(`--tile-${depth}`, `url("${url}")`);
		}
		return () => {
			for (const url of urls) URL.revokeObjectURL(url);
		};
	}, []);

	return (
		<div ref={ref} data-slot="stage" aria-hidden="true" className="stage">
			<div className="stage-mesh" />
			<div className="stage-layer" data-depth="0" />
			<div className="stage-layer" data-depth="1" />
			<div className="stage-layer" data-depth="2" />
			<div className="stage-calm" />
			<div className="stage-light" />
		</div>
	);
}
```

Замена старого декора (скрипт удаляет подключения и неиспользуемые графики):

```bash
uv run - <<'EOF'
import pathlib, re

def edit(path, fn):
    p = pathlib.Path(path)
    p.write_text(fn(p.read_text()))

# App: убрать MeshBackground и DecoScatter, добавить Stage в оболочку
def app(s):
    s = s.replace('import { DecoScatter } from "./DecoScatter";\n', "")
    s = s.replace('import { MeshBackground, PopLogo, PopSpinner } from "./graphics";',
                  'import { PopLogo, PopSpinner } from "./graphics";')
    s = s.replace('import { FxCanvas } from "./FxCanvas";',
                  'import { FxCanvas } from "./FxCanvas";\nimport { Stage } from "./Stage";')
    s = re.sub(r"^[ \t]*<MeshBackground />\n", "", s, flags=re.M)
    s = re.sub(r"^[ \t]*<DecoScatter />\n", "", s, flags=re.M)
    s = s.replace("<FxCanvas />\n\t\t\t<AppContent />", "<Stage />\n\t\t\t<FxCanvas />\n\t\t\t<AppContent />")
    return s
edit("src/components/App.tsx", app)

# Auth: убрать стикеры и фон
def auth(s):
    s = s.replace('import { DecoScatter } from "./DecoScatter";\n', "")
    s = re.sub(r'import \{\s*MeshBackground,\s*PopLogo,\s*PopSpinner,\s*SparkStar,\s*StickerRing,\s*StickerSpiral,\s*\} from "./graphics";',
               'import { PopLogo, PopSpinner } from "./graphics";', s)
    for token in ("<MeshBackground />", "<DecoScatter />", "<SparkStar className=\"animate-float-slow", "<StickerSpiral", "<StickerRing"):
        s = re.sub(r"^[ \t]*" + re.escape(token) + r".*\n", "", s, flags=re.M)
    return s
edit("src/components/Auth.tsx", auth)

# Admin: убрать DecoScatter
def admin(s):
    s = s.replace('import { DecoScatter } from "./DecoScatter";\n', "")
    s = re.sub(r"^[ \t]*<DecoScatter />\n", "", s, flags=re.M)
    return s
edit("src/components/Admin.tsx", admin)

# graphics.tsx: убрать MeshBackground, StickerSpiral, StickerRing (больше не используются)
def graphics(s):
    for name in ("MeshBackground", "StickerSpiral", "StickerRing"):
        s = re.sub(r"(?:/\*[^\n]*\*/\n)?export function " + name + r"\b.*?^}\n\n?", "", s, flags=re.S | re.M)
    return s
edit("src/components/graphics.tsx", graphics)

# index.css: убрать .pop-mesh
def css(s):
    return re.sub(r"[ \t]*/\* Mesh-фон:[^\n]*\*/\n[ \t]*\.pop-mesh \{.*?\n[ \t]*\}\n\n?", "", s, flags=re.S)
edit("src/index.css", css)
EOF
git rm -q src/components/DecoScatter.tsx src/components/graphics-bg.tsx
grep -rn "DecoScatter\|graphics-bg\|MeshBackground\|StickerSpiral\|StickerRing\|pop-mesh" src || echo "старого декора в коде не осталось"
```

После скрипта проверить `git diff src/components/Auth.tsx src/components/graphics.tsx src/index.css`: удалены только перечисленные блоки, `SparkStar` и `StickerBurst` остались (их использует `Generate.tsx`).

- [ ] **Step 4: Запустить тесты, сборку и дымовой тест**

```bash
bun test src/lib/__tests__/fx-stage.test.ts src/lib/__tests__/fx-coverage.test.ts
bun run typecheck
bun run build.ts && bun scripts/fx-smoke.ts
```
Expected: PASS; типы без ошибок; смоук `ok: …`.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add -A src docs
git commit -m "Спецэффекты: единый фон Stage вместо трёх разрозненных декораций, проверка контраста текста" -m "$TRAILER"
```

---

### Task 11: Слайдер «Рассуждение» со спецэффектами

**Files:**
- Modify: `src/components/ui/slider.tsx` (классы дорожки, заполнения и бегунка, содержимое бегунка)
- Create: `src/components/ReasoningSlider.tsx`
- Modify: `src/components/Generate.tsx` (блок Турбо: только заголовок и слайдер)
- Modify: `src/index.css` (раздел слайдера)
- Test: `src/lib/__tests__/fx-slider.test.ts`

**Interfaces:**
- Consumes: `levelSpec`, `LEVEL_COUNT` (Task 3); `emitLevelAt`, `emitTrailAt` (Task 7); `Slider` (shadcn).
- Produces: `ReasoningSlider({ index: number; label: string; onIndexChange(i: number): void; disabled?: boolean })`; `crystalGeometry(spec: LevelSpec): { rings: number[]; rays: number[]; sparks: number[] }` из `src/lib/fx/crystal.ts` (чистая функция раскладки элементов кристалла, тестируется).
- Меняет `Slider` (shadcn): новые необязательные пропсы `trackClassName`, `rangeClassName`, `thumbClassName`, `thumbChildren`; поведение по умолчанию прежнее.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/__tests__/fx-slider.test.ts
import { describe, expect, test } from "bun:test";
import { crystalGeometry } from "../fx/crystal";
import { LEVEL_COUNT, levelSpec } from "../fx/level";

describe("crystalGeometry", () => {
	test("кольца, лучи и орбитальные искры соответствуют уровню", () => {
		for (let i = 0; i < LEVEL_COUNT; i++) {
			const spec = levelSpec(i);
			const g = crystalGeometry(spec);
			expect(g.rings).toHaveLength(spec.rings);
			expect(g.rays).toHaveLength(spec.rays);
			expect(g.sparks).toHaveLength(spec.orbitSparks);
		}
	});

	test("лучи и искры равномерно по кругу", () => {
		const g = crystalGeometry(levelSpec(3));
		expect(g.rays[0]).toBe(0);
		expect(g.rays[1]).toBeCloseTo(360 / 8, 5);
		expect(g.sparks[1]! - g.sparks[0]!).toBeCloseTo(360 / 5, 5);
	});

	test("кольца с каждым уровнем шире", () => {
		const g = crystalGeometry(levelSpec(3));
		expect(g.rings[1]!).toBeGreaterThan(g.rings[0]!);
	});
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-slider.test.ts`
Expected: FAIL (`Cannot find module '../fx/crystal'`)

- [ ] **Step 3: Реализация**

```ts
// src/lib/fx/crystal.ts
import type { LevelSpec } from "./level";

/**
 * Раскладка элементов кристалла-бегунка по уровню: радиусы колец (в долях
 * размера), углы лучей и орбитальных искр в градусах.
 */
export function crystalGeometry(spec: LevelSpec): {
	rings: number[];
	rays: number[];
	sparks: number[];
} {
	return {
		rings: Array.from({ length: spec.rings }, (_, k) => 16 + k * 6),
		rays: Array.from({ length: spec.rays }, (_, i) => (360 / spec.rays) * i),
		sparks: Array.from({ length: spec.orbitSparks }, (_, i) => (360 / spec.orbitSparks) * i),
	};
}
```

`src/components/ui/slider.tsx` — расширить компонент (остальное без изменений). Сигнатура и три места разметки:

```tsx
function Slider({
	className,
	trackClassName,
	rangeClassName,
	thumbClassName,
	thumbChildren,
	defaultValue,
	value,
	min = 0,
	max = 100,
	"aria-label": ariaLabel,
	"aria-valuetext": ariaValueText,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
	trackClassName?: string;
	rangeClassName?: string;
	thumbClassName?: string;
	thumbChildren?: React.ReactNode;
}) {
```

- у `SliderPrimitive.Track`: `className={cn("relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5", trackClassName)}`;
- у `SliderPrimitive.Range`: `className={cn("absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full", rangeClassName)}`;
- у `SliderPrimitive.Thumb`: прежние классы обернуть в `cn("block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50", thumbClassName)` и добавить `{thumbChildren}` внутрь тега (`<SliderPrimitive.Thumb …>{thumbChildren}</SliderPrimitive.Thumb>`).

```tsx
// src/components/ReasoningSlider.tsx
import { useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { crystalGeometry } from "@/lib/fx/crystal";
import { emitLevelAt, emitTrailAt } from "@/lib/fx/dom";
import { LEVEL_COUNT, levelSpec } from "@/lib/fx/level";
import { cn } from "@/lib/utils";

const GOLD = "#ffd54a";
const GOLD_LIGHT = "#fff0a8";
const FUCHSIA = "#ff5ca8";
const INDIGO = "#6c5cff";

/** Бегунок-кристалл: с уровнем растут размер, кольца, орбитальные искры, лучи и молния. */
function LevelCrystal({ index }: { index: number }) {
	const spec = levelSpec(index);
	const g = crystalGeometry(spec);
	const s = spec.scale;
	return (
		<svg
			viewBox="-30 -30 60 60"
			aria-hidden="true"
			className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 overflow-visible"
		>
			<defs>
				<radialGradient id="rs-glow">
					<stop offset="0" stopColor={FUCHSIA} stopOpacity="0.8" />
					<stop offset="1" stopColor={FUCHSIA} stopOpacity="0" />
				</radialGradient>
				<linearGradient id="rs-gem" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor={GOLD_LIGHT} />
					<stop offset="1" stopColor={INDIGO} />
				</linearGradient>
			</defs>
			<circle r={24 * s} fill="url(#rs-glow)" opacity={spec.glow} />
			<g className="reasoning-spin">
				{g.rays.map((a) => (
					<line
						key={a}
						x1={17 * s}
						y1={0}
						x2={30 * s}
						y2={0}
						stroke={GOLD}
						strokeWidth={2.2}
						strokeLinecap="round"
						transform={`rotate(${a})`}
					/>
				))}
			</g>
			{g.rings.map((rx, k) => (
				<ellipse
					key={rx}
					rx={rx * s * 1.2}
					ry={(6 + k * 2) * s * 1.2}
					fill="none"
					stroke={k === 0 ? GOLD_LIGHT : FUCHSIA}
					strokeWidth={1.8}
					opacity={0.95}
					transform={`rotate(${k * 50 - 20})`}
					className={k % 2 === 0 ? "reasoning-spin" : "reasoning-spin-rev"}
				/>
			))}
			<g className="reasoning-spin-rev">
				{g.sparks.map((a) => (
					<polygon
						key={a}
						points="0,-4.6 1.1,-1.1 4.6,0 1.1,1.1 0,4.6 -1.1,1.1 -4.6,0 -1.1,-1.1"
						fill={GOLD_LIGHT}
						transform={`rotate(${a}) translate(${25 * s} 0)`}
					/>
				))}
			</g>
			<g transform={`scale(${s * 1.35})`}>
				<polygon points="0,-12 10,-3 6,11 -6,11 -10,-3" fill="url(#rs-gem)" />
				<polygon points="0,-12 10,-3 0,5" fill={GOLD_LIGHT} opacity="0.55" />
				<polygon points="0,5 10,-3 6,11" fill={INDIGO} opacity="0.6" />
				{spec.bolt && (
					<polygon points="1,-9 -5,1 -1,1 -3,9 5,-2 1,-2" fill={GOLD} stroke={GOLD_LIGHT} strokeWidth="0.6" />
				)}
			</g>
		</svg>
	);
}

/** Засечки дорожки: горят по порядку до выбранного уровня. */
function Notches({ lit }: { lit: number }) {
	return (
		<>
			{Array.from({ length: LEVEL_COUNT }, (_, i) => {
				const pct = (i / (LEVEL_COUNT - 1)) * 100;
				return (
					<span
						key={i}
						aria-hidden="true"
						className={cn("reasoning-notch", i < lit && "reasoning-notch-lit")}
						style={{ left: `calc(${pct}% + ${16 - (pct / 100) * 32}px)` }}
					/>
				);
			})}
		</>
	);
}

export function ReasoningSlider({
	index,
	label,
	onIndexChange,
	disabled,
}: {
	index: number;
	label: string;
	onIndexChange(index: number): void;
	disabled?: boolean;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const spec = levelSpec(index);

	function handleChange(values: number[]) {
		const next = values[0] ?? 0;
		onIndexChange(next);
		// бегунок переедет после перерисовки: вспышку ставим уже на новое место
		requestAnimationFrame(() =>
			emitLevelAt(rootRef.current?.querySelector('[role="slider"]') ?? null, next),
		);
	}

	function handleMove(e: React.PointerEvent) {
		if (e.buttons === 1 && !disabled) emitTrailAt(e.clientX, e.clientY);
	}

	return (
		<div
			ref={rootRef}
			className="reasoning relative py-5"
			style={{ "--glow": spec.glow } as React.CSSProperties}
			onPointerMove={handleMove}
		>
			<div className="reasoning-aura" aria-hidden="true" />
			<Slider
				min={0}
				max={LEVEL_COUNT - 1}
				step={1}
				value={[index]}
				onValueChange={handleChange}
				disabled={disabled}
				aria-label="Уровень рассуждения"
				aria-valuetext={label}
				trackClassName="h-2 bg-border"
				rangeClassName="reasoning-range"
				thumbClassName="size-8 border-0 bg-transparent shadow-none ring-0 hover:ring-0 focus-visible:ring-0"
				thumbChildren={<LevelCrystal index={index} />}
			/>
			<Notches lit={spec.notchesLit} />
		</div>
	);
}
```

В `src/components/Generate.tsx`: импорт `import { ReasoningSlider } from "./ReasoningSlider";`, удалить импорт `Slider` из `@/components/ui/slider` (если больше нигде не используется), а блок `{activeMode === "turbo" && (…)}` (заголовок «Рассуждение», значение, слайдер, строка «Быстрее / Дольше…») заменить на:

```tsx
{activeMode === "turbo" && (
	<div className="animate-pop-in mt-6 flex flex-col gap-1">
		<div className="flex items-center gap-2">
			<IconBrain className="size-5 text-primary" />
			<span className="font-display text-lg font-bold text-foreground">
				Рассуждение
			</span>
		</div>
		<ReasoningSlider
			index={TURBO_REASONING_LEVELS.indexOf(reasoning)}
			label={REASONING_LABELS[reasoning]}
			onIndexChange={(i) => changeReasoning([i])}
			disabled={loading}
		/>
	</div>
)}
```

CSS слайдера (в конец `src/index.css`):

```css
/* ── Слайдер «Рассуждение» ──────────────────────────────────────────── */
.reasoning-range {
  background-image: linear-gradient(90deg, #6c5cff, #ff5ca8 60%, #ffd54a);
}

.reasoning-aura {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 5rem;
  background: radial-gradient(closest-side, rgb(255 92 168 / 0.25), transparent);
  transform: translate(-50%, -50%) scaleX(calc(0.6 + var(--glow, 0.25) * 0.4));
  opacity: calc(0.25 + var(--glow, 0.25) * 0.75);
  transition:
    transform 0.5s ease,
    opacity 0.5s ease;
  pointer-events: none;
}

.reasoning-notch {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  rotate: 45deg;
  border: 1px solid var(--color-muted-foreground);
  background: var(--color-secondary);
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.3s ease;
  pointer-events: none;
}

.reasoning-notch-lit {
  border-color: #fff0a8;
  background: linear-gradient(135deg, #fff0a8, #ffd54a 55%, #c28a10);
  transform: scale(1.25);
}

@keyframes fx-spin {
  to {
    transform: rotate(360deg);
  }
}

.reasoning-spin {
  animation: fx-spin 9s linear infinite;
  transform-origin: 0 0;
}

.reasoning-spin-rev {
  animation: fx-spin 13s linear infinite reverse;
  transform-origin: 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .reasoning-spin,
  .reasoning-spin-rev {
    animation: none;
  }
}
```

- [ ] **Step 4: Запустить тесты, типы, сборку**

```bash
bun test src/lib/__tests__/fx-slider.test.ts src/lib/__tests__/fx-coverage.test.ts
bun run typecheck && bun run build.ts
```
Expected: PASS; типы без ошибок. Визуально слайдер проверяется скриншотами в Task 13 (режим `app`, вкладка «Турбо», по одному кадру на каждый уровень).

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add -A src
git commit -m "Спецэффекты: слайдер «Рассуждение» с кристаллом-бегунком, засечками и вспышками по уровню" -m "$TRAILER"
```

---

### Task 12: Реакции экранов, маркеры заголовков и эффекты данных

**Files:**
- Create: `src/components/CrystalMark.tsx`
- Modify: `src/components/Auth.tsx`, `src/components/App.tsx`, `src/components/Generate.tsx`, `src/components/Admin.tsx`, `src/components/CodexAccess.tsx`, `src/components/QuotaBar.tsx`, `src/components/graphics.tsx`
- Modify: `src/index.css` (раздел эффектов экранов)
- Test: расширить `src/lib/__tests__/fx-coverage.test.ts`

**Interfaces:**
- Consumes: `emitCenter`, `flashAttr`, `emitBalance`, `emitResultAt`, `emitOutcome`, `setStageAttr` (Task 7); `decorSvg`, `PALETTES`, `DecorKind` (Task 9); `ReasoningSlider` (Task 11).
- Produces: `CrystalMark({ kind?: DecorKind; palette?: number; className?: string })`; CSS-классы `fx-bump`, `fx-stagger`, `fx-tile`, `fx-rim`, `animate-fx-reveal`, `fx-fill`, `fx-divider`; атрибуты `data-mode` и `data-busy` на `Stage` выставляет `Generate`.

- [ ] **Step 1: Расширить тест-страж** — реакции экранов нельзя «забыть»: в `src/lib/__tests__/fx-coverage.test.ts` добавить в конец блока `describe("покрытие эффектами", …)` проверки подключения:

```ts
	test("экраны подключают реакции на действия", () => {
		const read = (name: string) => readFileSync(path.join(COMPONENTS, name), "utf8");
		const auth = read("Auth.tsx");
		expect(auth).toContain('emitCenter(shakeRef.current, "success")');
		expect(auth).toContain('flashAttr(shakeRef.current, "data-fx-error"');
		expect(read("App.tsx")).toContain("emitBalance(");
		const generate = read("Generate.tsx");
		expect(generate).toContain('setStageAttr("data-mode"');
		expect(generate).toContain('setStageAttr("data-busy"');
		expect(generate).toContain("emitResultAt(");
		expect(generate).toContain("<ReasoningSlider");
		expect(read("Admin.tsx")).toContain("emitOutcome(");
		expect(read("CodexAccess.tsx")).toContain("emitOutcome(");
	});

	test("в слайдере «Рассуждение» нет подписей про скорость", () => {
		const generate = readFileSync(path.join(COMPONENTS, "Generate.tsx"), "utf8");
		expect(generate).not.toContain("Дольше, но продуманнее");
		expect(generate).not.toContain("Быстрее");
	});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `bun test src/lib/__tests__/fx-coverage.test.ts`
Expected: FAIL (в экранах ещё нет вызовов эффектов; в `Generate.tsx` есть «Быстрее»? — после Task 11 подписи уже убраны, этот тест проходит, остальные падают)

- [ ] **Step 3: Реализация**

Маркер заголовка (замена одинаковой `SparkStar`):

```tsx
// src/components/CrystalMark.tsx
import { useId } from "react";
import { type DecorKind, decorSvg, PALETTES } from "@/lib/fx/decor";

/** Детальный кристалл-маркер для заголовков разделов (грани, градиенты, блик). */
export function CrystalMark({
	kind = "gem",
	palette = 2,
	className,
}: {
	kind?: DecorKind;
	palette?: number;
	className?: string;
}) {
	const id = `cm${useId().replace(/:/g, "")}_`;
	return (
		<svg
			viewBox="0 0 100 100"
			aria-hidden="true"
			className={className}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: разметка строится из собственных констант, пользовательских данных в ней нет
			dangerouslySetInnerHTML={{ __html: decorSvg(kind, PALETTES[palette] ?? PALETTES[2]!, id) }}
		/>
	);
}
```

Правки экранов — скриптом (каждая замена проверяется `assert`, при расхождении текста скрипт остановится):

```bash
uv run - <<'EOF'
import pathlib

def edit(path, pairs):
    p = pathlib.Path(path)
    s = p.read_text()
    for old, new in pairs:
        assert old in s, (path, old[:70])
        s = s.replace(old, new, 1)
    p.write_text(s)

# ── Auth: итог входа/регистрации, встряска карточки, разделитель
edit("src/components/Auth.tsx", [
    ('import { useState } from "react";',
     'import { useRef, useState } from "react";'),
    ('import { Label } from "@/components/ui/label";',
     'import { Label } from "@/components/ui/label";\nimport { emitCenter, flashAttr } from "@/lib/fx/dom";'),
    ('\tconst [loading, setLoading] = useState(false);\n',
     '\tconst [loading, setLoading] = useState(false);\n\tconst shakeRef = useRef<HTMLDivElement>(null);\n'),
    ('\t\t\tonLogin(data.user);',
     '\t\t\temitCenter(shakeRef.current, "success");\n\t\t\tonLogin(data.user);'),
    ('\t\t\tsetError(err.message);',
     '\t\t\tsetError(err.message);\n\t\t\tflashAttr(shakeRef.current, "data-fx-error", 400);\n\t\t\temitCenter(shakeRef.current, "error");'),
    ('\t\t\t\t\t<form onSubmit={handleSubmit} className="mt-8 space-y-5">',
     '\t\t\t\t\t<div ref={shakeRef}>\n\t\t\t\t\t<form onSubmit={handleSubmit} className="mt-8 space-y-5">'),
    ('\t\t\t\t\t</form>\n',
     '\t\t\t\t\t</form>\n\t\t\t\t\t</div>\n'),
    ('<div className="mt-8 border-t border-border pt-6">',
     '<div className="fx-divider mt-8 border-t border-border pt-6">'),
    ('className="flex items-start gap-2.5 text-sm text-destructive"',
     'className="animate-pop-in flex items-start gap-2.5 text-sm text-destructive"'),
])

# ── App: баланс (монеты и подпрыгивание)
edit("src/components/App.tsx", [
    ('import { cn } from "@/lib/utils";',
     'import { emitBalance } from "@/lib/fx/dom";\nimport { cn } from "@/lib/utils";'),
    ('\tconst [rolesReady, setRolesReady] = useState(false);\n',
     '''\tconst [rolesReady, setRolesReady] = useState(false);
\tconst prevBalance = useRef<number | null>(null);
\tconst badgeRef = useRef<HTMLDivElement>(null);

\t// изменение баланса: монеты взлетают (плюс) или осыпаются (минус)
\tuseEffect(() => {
\t\tif (balance === null) return;
\t\tconst prev = prevBalance.current;
\t\tprevBalance.current = balance;
\t\tif (prev === null || prev === balance) return;
\t\trequestAnimationFrame(() => emitBalance(badgeRef.current, balance - prev));
\t}, [balance]);
'''),
    ('className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums"',
     'key={balance}\n\t\t\t\t\t\t\t\tref={badgeRef}\n\t\t\t\t\t\t\t\tclassName="fx-bump flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums"'),
])

# ── Generate: режим и ожидание влияют на фон, готовый результат — залпы и рамка
edit("src/components/Generate.tsx", [
    ('import { ReasoningSlider } from "./ReasoningSlider";',
     'import { CrystalMark } from "./CrystalMark";\nimport { ReasoningSlider } from "./ReasoningSlider";'),
    ('import { imageExtension } from "@/lib/image-format";',
     'import { emitResultAt, setStageAttr } from "@/lib/fx/dom";\nimport { imageExtension } from "@/lib/image-format";'),
    ('\tuseEffect(() => {\n\t\taliveRef.current = true;',
     '''\tconst resultRef = useRef<HTMLDivElement>(null);

\t// фон отражает режим и ожидание
\tuseEffect(() => {
\t\tsetStageAttr("data-mode", activeMode === "turbo" ? "turbo" : "image");
\t\treturn () => setStageAttr("data-mode", null);
\t}, [activeMode]);

\tuseEffect(() => {
\t\tsetStageAttr("data-busy", loading ? "" : null);
\t\treturn () => setStageAttr("data-busy", null);
\t}, [loading]);

\t// готовая картинка: залпы из углов рамки
\tuseEffect(() => {
\t\tif (!result) return;
\t\tconst frame = requestAnimationFrame(() => emitResultAt(resultRef.current));
\t\treturn () => cancelAnimationFrame(frame);
\t}, [result?.id]);

\tuseEffect(() => {
\t\taliveRef.current = true;'''),
    # кнопка генерации — «заряжается»
    ('type="button"\n\t\t\t\t\t\t\t\t\tsize="icon-lg"',
     'type="button"\n\t\t\t\t\t\t\t\t\tdata-fx="submit"\n\t\t\t\t\t\t\t\t\tsize="icon-lg"'),
    # результат
    ('<div className="animate-pop-in relative mt-10">\n\t\t\t\t\t<StickerBurst',
     '<div key={result.image_url} className="animate-pop-in relative mt-10">\n\t\t\t\t\t<StickerBurst'),
    ('<div className="group relative overflow-hidden rounded-[22px]">\n\t\t\t\t\t\t<img\n\t\t\t\t\t\t\tsrc={result.image_url}',
     '<div\n\t\t\t\t\t\tref={resultRef}\n\t\t\t\t\t\tclassName="fx-rim animate-fx-reveal group relative overflow-hidden rounded-[22px] p-[3px]"\n\t\t\t\t\t>\n\t\t\t\t\t\t<img\n\t\t\t\t\t\t\tsrc={result.image_url}'),
    ('className="block w-full transition-transform duration-500 group-hover:scale-[1.015]"',
     'className="block w-full rounded-[19px] transition-transform duration-500 group-hover:scale-[1.015]"'),
    # галерея
    ('\t\t\t\t\t\t\t\tkey={img.id}\n',
     '\t\t\t\t\t\t\t\tkey={img.id}\n\t\t\t\t\t\t\t\tstyle={{ "--i": Math.min(idx, 12) } as React.CSSProperties}\n'),
    ('className="group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left',
     'className="fx-tile fx-stagger group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left'),
    # лайтбокс
    ('className="max-h-[70dvh] w-auto max-w-full rounded-[22px] border border-border"',
     'className="animate-fx-reveal max-h-[70dvh] w-auto max-w-full rounded-[22px] border border-border"'),
    # ошибка
    ('className="mt-5 flex items-start gap-2.5 text-sm text-destructive"',
     'className="animate-pop-in mt-5 flex items-start gap-2.5 text-sm text-destructive"'),
])

# ── QuotaBar: полоса заливается с бликом
edit("src/components/QuotaBar.tsx", [
    ('"h-full rounded-full transition-all",',
     '"fx-fill relative h-full overflow-hidden rounded-full transition-all",'),
])

# ── Admin и Вход Codex: итог действия вспыхивает на нажатой кнопке
edit("src/components/Admin.tsx", [
    ('import { Button } from "@/components/ui/button";',
     'import { Button } from "@/components/ui/button";\nimport { emitOutcome } from "@/lib/fx/dom";'),
    ('\t\t\tif (res.ok) {\n\t\t\t\tsetNewKeyName("");\n\t\t\t\tsetNewKeyValue("");',
     '\t\t\temitOutcome(res.ok);\n\t\t\tif (res.ok) {\n\t\t\t\tsetNewKeyName("");\n\t\t\t\tsetNewKeyValue("");'),
    ('\t\t\tif (res.ok) {\n\t\t\t\tsetNewLlmKeyName("");',
     '\t\t\temitOutcome(res.ok);\n\t\t\tif (res.ok) {\n\t\t\t\tsetNewLlmKeyName("");'),
    ('const res = await fetch(`/api/admin/keys/${id}`, { method: "POST" });',
     'const res = await fetch(`/api/admin/keys/${id}`, { method: "POST" });\n\t\t\temitOutcome(res.ok);'),
    ('const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });',
     'const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });\n\t\t\temitOutcome(res.ok);'),
    ('\t\t\tif (res.ok) {\n\t\t\t\tsetCreditUserId("");',
     '\t\t\temitOutcome(res.ok);\n\t\t\tif (res.ok) {\n\t\t\t\tsetCreditUserId("");'),
])
EOF
```

Продолжение той же правки: `CodexAccess.tsx`, маркеры заголовков и графики:

```bash
uv run - <<'EOF'
import pathlib, re

def edit(path, pairs):
    p = pathlib.Path(path)
    s = p.read_text()
    for old, new in pairs:
        assert old in s, (path, old[:70])
        s = s.replace(old, new, 1)
    p.write_text(s)

head = open("src/components/CodexAccess.tsx").read().split("\n")[0:25]
imp = next((l for l in head if 'from "@/components/ui/button"' in l), None)
assert imp, "не найден импорт Button в CodexAccess.tsx"
edit("src/components/CodexAccess.tsx", [
    (imp, imp + '\nimport { emitOutcome } from "@/lib/fx/dom";'),
    ('const result: CodexCheckResult | { error: string } = await res.json();',
     'const result: CodexCheckResult | { error: string } = await res.json();\n\t\t\temitOutcome("ok" in result && result.ok);'),
    ('await fetch("/api/admin/codex", { method: "DELETE" });',
     'await fetch("/api/admin/codex", { method: "DELETE" });\n\t\t\temitOutcome(true);'),
])

# маркеры заголовков: одинаковая SparkStar → детальные кристаллы
gen = pathlib.Path("src/components/Generate.tsx")
s = gen.read_text()
s = s.replace('<SparkStar className="h-4 w-4" />', '<CrystalMark kind="gem" className="size-5" />', 1)
s = s.replace('<SparkStar className="h-4 w-4" />', '<CrystalMark kind="cluster" palette={1} className="size-5" />', 1)
gen.write_text(s)
adm = pathlib.Path("src/components/Admin.tsx")
a = adm.read_text()
a = a.replace('<SparkStar className="h-6 w-6" />', '<CrystalMark kind="star" className="size-7" />', 1)
marker = 'import { emitOutcome } from "@/lib/fx/dom";'
assert marker in a, "сначала выполните первую правку Admin.tsx"
a = a.replace(marker, marker + '\nimport { CrystalMark } from "./CrystalMark";', 1)
adm.write_text(a)
EOF
grep -rn "SparkStar" src --include=*.tsx | grep -v "export function SparkStar"
```

`SparkStar` остаётся в `graphics.tsx` (её использует `PopLogo`), но из импортов `Generate.tsx` и `Admin.tsx` её надо убрать, если в разметке этих файлов она больше не встречается (биом подсветит неиспользуемый импорт; `bun run lint:fix` уберёт его).

CSS эффектов экранов — в конец `src/index.css`:

```css
/* ── Эффекты экранов ───────────────────────────────────────────────── */
@keyframes fx-reveal {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fx-reveal {
  animation: fx-reveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* радужная рамка готовой картинки: крутится три оборота и замирает */
.fx-rim {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.fx-rim::before {
  content: "";
  position: absolute;
  inset: -60%;
  z-index: -2;
  background: conic-gradient(from 0deg, #6c5cff, #ff5ca8, #ffd54a, #6c5cff);
  animation: fx-spin 8s linear 3;
}

.fx-rim::after {
  content: "";
  position: absolute;
  inset: 3px;
  z-index: -1;
  border-radius: 19px;
  background: var(--color-background);
}

/* каскад плиток галереи */
.fx-stagger {
  animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(var(--i, 0) * 45ms);
}

/* блик и уголок-самоцвет у плитки */
.fx-tile::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(110deg, transparent 35%, rgb(255 240 168 / 0.28) 50%, transparent 65%);
  transform: translateX(-120%);
  pointer-events: none;
}

.fx-tile:hover::before {
  transform: translateX(120%);
  transition: transform 0.7s ease;
}

.fx-tile::after {
  content: "";
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 10px;
  height: 10px;
  background: linear-gradient(135deg, #fff0a8, #ffd54a 55%, #c28a10);
  transform: rotate(45deg) scale(0);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.fx-tile:hover::after,
.fx-tile:focus-visible::after {
  transform: rotate(45deg) scale(1);
}

/* баланс подпрыгивает при изменении (перемонтируется по key) */
@keyframes fx-bump {
  40% {
    transform: scale(1.18);
  }
}

.fx-bump {
  animation: fx-bump 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* полосы квот заливаются слева направо с бликом */
@keyframes fx-fill {
  from {
    transform: scaleX(0);
  }
}

@keyframes fx-glint {
  to {
    transform: translateX(100%);
  }
}

.fx-fill {
  transform-origin: left;
  animation: fx-fill 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.fx-fill::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgb(255 240 168 / 0.55) 50%, transparent 70%);
  transform: translateX(-100%);
  animation: fx-glint 1.1s ease 0.5s 1 forwards;
}

/* разделитель: цветная нить вместо серой линии */
.fx-divider {
  border-image: linear-gradient(
      90deg,
      transparent,
      rgb(255 92 168 / 0.6),
      rgb(255 213 74 / 0.6),
      rgb(108 92 255 / 0.6),
      transparent
    )
    1;
}

/* карточки: свечение кромки при наведении */
.pop-card {
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.pop-card:hover {
  border-color: rgb(108 92 255 / 0.45);
  box-shadow: 0 18px 50px -24px rgb(108 92 255 / 0.5);
}

@media (prefers-reduced-motion: reduce) {
  .animate-fx-reveal,
  .fx-rim::before,
  .fx-stagger,
  .fx-bump,
  .fx-fill,
  .fx-fill::after {
    animation: none;
  }

  .fx-tile::before,
  .fx-tile::after {
    display: none;
  }
}
```

- [ ] **Step 4: Запустить тесты, типы, сборку**

```bash
bun test src/lib/__tests__/fx-coverage.test.ts
bun run typecheck && bun run build.ts && bun scripts/fx-smoke.ts
```
Expected: PASS; типы без ошибок; смоук `ok: …`.

- [ ] **Step 5: Коммит**

```bash
bun run lint:fix && bun run lint
git add -A src
git commit -m "Спецэффекты: реакции входа, баланса, генерации, галереи и админки; кристаллы-маркеры заголовков" -m "$TRAILER"
```

---

### Task 13: Замеры в Chromium и визуальная проверка

**Files:**
- Create: `scripts/fx-perf.ts`
- Create: `scripts/fx-shots.ts`
- Modify: `package.json` (скрипты `fx:perf`, `fx:shots`)

**Interfaces:**
- Consumes: `openPage` (Task 7), `window.__fxStats` / `window.__fxBus` (Task 7), `Stage` (Task 10), `ReasoningSlider` (Task 11).
- Produces: `bun run fx:perf` — печатает таблицу проверок и завершается кодом 1 при нарушении бюджета; `bun run fx:shots` — складывает скриншоты в `captures/fx/` (каталог в `.gitignore`).

- [ ] **Step 1: Скрипт замеров**

```ts
// scripts/fx-perf.ts
import { openPage } from "./fx-harness";

/**
 * Приёмка бюджета эффектов (спецификация): простой, пик, засыпание, слои,
 * reduced-motion. Перед запуском: `bun run build.ts`.
 */
const rows: Array<{ name: string; value: string; ok: boolean }> = [];
function check(name: string, value: number, ok: boolean, unit = ""): void {
	rows.push({ name, value: `${Math.round(value * 100) / 100}${unit}`, ok });
}

const h = await openPage({ mode: "auth", viewport: { width: 1440, height: 900 } });
const { page } = h;
try {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Performance.enable");
	await page.evaluate(() => {
		const w = window as any;
		w.__raf = 0;
		const orig = w.requestAnimationFrame.bind(window);
		w.requestAnimationFrame = (cb: FrameRequestCallback) => {
			w.__raf++;
			return orig(cb);
		};
	});
	const metric = async (name: string) =>
		((await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === name)?.value ?? 0);
	const stats = () => page.evaluate(() => ({ ...(window as any).__fxStats }));
	const raf = () => page.evaluate(() => (window as any).__raf as number);

	// 1. Простой: ни кадров, ни raf, почти нет скриптов
	await page.waitForTimeout(1500);
	const s0 = await metric("ScriptDuration");
	const r0 = await raf();
	const f0 = (await stats()).frames as number;
	await page.waitForTimeout(3000);
	check("простой: вызовов requestAnimationFrame за 3 с", (await raf()) - r0, (await raf()) - r0 === 0);
	check("простой: кадров canvas за 3 с", ((await stats()).frames as number) - f0, ((await stats()).frames as number) === f0);
	const idleScript = ((await metric("ScriptDuration")) - s0) * 1000;
	check("простой: скрипты за 3 с", idleScript, idleScript < 30, " мс");

	// 2. Слои: разница с включённым и скрытым Stage
	const layerEvents: number[] = [];
	cdp.on("LayerTree.layerTreeDidChange", (e: any) => layerEvents.push(e.layers?.length ?? 0));
	await cdp.send("LayerTree.enable");
	await page.evaluate(() => ((document.querySelector('[data-slot="stage"]') as HTMLElement).style.display = "none"));
	await page.waitForTimeout(600);
	const without = layerEvents[layerEvents.length - 1] ?? 0;
	await page.evaluate(() => ((document.querySelector('[data-slot="stage"]') as HTMLElement).style.display = ""));
	await page.waitForTimeout(600);
	const withStage = layerEvents[layerEvents.length - 1] ?? 0;
	check("слоёв фона (с Stage минус без)", withStage - without, withStage - without <= 8);

	// 3. Пик: быстрая печать + залпы + движение мыши
	const before = await stats();
	await page.click("#email");
	const typing = page.keyboard.type("x".repeat(240), { delay: 8 });
	const salutes = (async () => {
		for (let i = 0; i < 4; i++) {
			await page.waitForTimeout(400);
			await page.evaluate(() => (window as any).__fxBus.emit({ type: "success", x: 0, y: 0 }));
		}
	})();
	const mouse = (async () => {
		for (let i = 0; i < 100; i++) {
			await page.mouse.move(100 + i * 10, 200 + (i % 7) * 30);
			await page.waitForTimeout(15);
		}
	})();
	await Promise.all([typing, salutes, mouse]);
	const after = await stats();
	const frames = (after.frames as number) - (before.frames as number);
	const avg = ((after.totalMs as number) - (before.totalMs as number)) / Math.max(1, frames);
	check("пик: кадров отрисовано", frames, frames > 30);
	check("пик: среднее время кадра (шаг + отрисовка)", avg, avg <= 4, " мс");
	check("пик: максимум кадра", after.maxMs as number, (after.maxMs as number) <= 16, " мс");

	// 4. После пика цикл засыпает
	await page.waitForTimeout(2500);
	const a = (await stats()).frames as number;
	const ra = await raf();
	await page.waitForTimeout(800);
	check("после пика: цикл уснул (кадров за 0,8 с)", ((await stats()).frames as number) - a, ((await stats()).frames as number) === a);
	check("после пика: raf за 0,8 с", (await raf()) - ra, (await raf()) === ra);
} finally {
	await h.close();
}

// 5. reduced-motion: частиц нет, фон вспыхивает статично
const rm = await openPage({ mode: "auth", reducedMotion: true });
try {
	await rm.page.click("#email");
	await rm.page.keyboard.type("hello", { delay: 30 });
	await rm.page.waitForTimeout(300);
	const frames = await rm.page.evaluate(() => (window as any).__fxStats.frames as number);
	check("reduced-motion: кадров canvas при печати", frames, frames === 0);
	await rm.page.getByRole("button", { name: "Продолжить" }).click();
	const pulsed = await rm.page
		.waitForFunction(() => document.querySelector('[data-slot="stage"]')?.hasAttribute("data-fx-pulse") ?? false, null, { timeout: 1500 })
		.then(() => true)
		.catch(() => false);
	check("reduced-motion: статичная вспышка на нажатие", pulsed ? 1 : 0, pulsed);
} finally {
	await rm.close();
}

for (const r of rows) console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.value}`);
if (rows.some((r) => !r.ok)) process.exit(1);
console.log("бюджет эффектов выдержан");
```

```ts
// scripts/fx-shots.ts
import { mkdirSync } from "node:fs";
import { openPage } from "./fx-harness";

/** Скриншоты для визуальной проверки и PR: вход, главная, слайдер по уровням. */
const out = process.env.FX_SHOTS_DIR ?? "captures/fx";
mkdirSync(out, { recursive: true });

const auth = await openPage({ mode: "auth" });
try {
	await auth.page.waitForTimeout(800);
	await auth.page.screenshot({ path: `${out}/auth-idle.png` });
	await auth.page.click("#email");
	await auth.page.keyboard.type("hello@gen42", { delay: 30 });
	await auth.page.waitForTimeout(120);
	await auth.page.screenshot({ path: `${out}/auth-typing.png` });
} finally {
	await auth.close();
}

const app = await openPage({ mode: "app", viewport: { width: 1280, height: 900 } });
try {
	await app.page.waitForTimeout(800);
	await app.page.screenshot({ path: `${out}/app-image.png` });
	await app.page.getByRole("tab", { name: "Турбо" }).click();
	await app.page.waitForTimeout(900);
	await app.page.screenshot({ path: `${out}/app-turbo.png` });
	const slider = app.page.getByRole("slider");
	await slider.focus();
	for (let level = 0; level < 4; level++) {
		await app.page.keyboard.press(level === 0 ? "Home" : "ArrowRight");
		await app.page.waitForTimeout(250);
		await app.page.screenshot({ path: `${out}/slider-level-${level}.png`, clip: { x: 200, y: 330, width: 880, height: 220 } });
	}
	await app.page.fill("#prompt", "кот в короне");
	await app.page.keyboard.type(" и шуба", { delay: 25 });
	await app.page.waitForTimeout(100);
	await app.page.screenshot({ path: `${out}/app-typing.png` });
} finally {
	await app.close();
}
console.log(`скриншоты: ${out}`);
```

В `package.json` → `scripts` добавить:

```json
"fx:perf": "bun run build.ts && bun scripts/fx-perf.ts",
"fx:shots": "bun run build.ts && bun scripts/fx-shots.ts"
```

- [ ] **Step 2: Запустить замеры**

Run: `bun run fx:perf`
Expected: все строки с `✓`, в конце «бюджет эффектов выдержан». Если строка с `✗`:
- «простой: …» — найти источник: `requestAnimationFrame` вызывает кто-то, кроме движка (параллакс `applyMove` вызывается только при движении мыши; убедиться, что в простое мышь не двигалась);
- «пик: среднее время кадра» > 4 мс — снять профиль (`cdp.send("Profiler.start")`) и сократить стоимость кадра: уменьшить `CELL`-копию (`drawImage` с меньшим размером), `margin` dirty-rect, число частиц в `emitSalute`; бюджет не ослаблять;
- «слоёв фона» > 8 — убрать лишний `will-change`/`translate`-слой.

- [ ] **Step 3: Снять скриншоты и просмотреть**

Run: `bun run fx:shots`
Затем открыть и просмотреть в `captures/fx/`: `auth-idle.png`, `auth-typing.png`, `app-image.png`, `app-turbo.png`, `slider-level-0..3.png`, `app-typing.png` (инструмент `Read` показывает изображения). Проверить: декор виден по всему экрану без пустых зон; текст читаем; блёстки идут из каретки; на слайдере четыре уровня визуально различимы, подписей кроме «Рассуждение» нет. Замечания исправить в этой же задаче (CSS/размеры/цвета), повторить `fx:perf` и `fx:shots`.

- [ ] **Step 4: Коммит**

```bash
bun run lint:fix && bun run lint
git add scripts/fx-perf.ts scripts/fx-shots.ts package.json
git commit -m "Спецэффекты: замеры бюджета эффектов в Chromium и скриншоты для визуальной проверки" -m "$TRAILER"
```

---

### Task 14: Документация, итоговая проверка и PR

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/superpowers/specs/2026-10-11-special-effects-design.md`

**Interfaces:**
- Consumes: всё из Tasks 1–13.
- Produces: актуальные `AGENTS.md`/`README.md`; PR в `main` (без мержа).

- [ ] **Step 1: Обновить `AGENTS.md`**

В раздел «Стиль UI» добавить пункт (после «Дизайн-система…»):

```markdown
- Спецэффекты (спецификация `docs/superpowers/specs/2026-10-11-special-effects-design.md`): любое действие пользователя даёт визуальный отклик на всех экранах. Движок — `src/lib/fx/` (пул частиц на типизированных массивах, запечённый атлас спрайтов, цикл `requestAnimationFrame`, который просыпается по событию и засыпает без частиц; в цикле нет выделений памяти). Холст — `FxCanvas`, фон — `Stage` (mesh, три слоя глубины из SVG-тайлов `src/lib/fx/tile.ts`, зона покоя под текстом, свет за курсором), смонтированы один раз в `App`. Элементы управления помечаются `data-fx` (`press | toggle | item | link | submit | level | field`); примитивы shadcn ставят его сами, а тест-страж `src/lib/__tests__/fx-coverage.test.ts` падает на «голом» `<button>/<a>/<input>/<textarea>/<select>` без `data-fx`. Новый вид события — в `src/lib/fx/bus.ts` (тип), `dispatch.ts` (эмиттер) и тест. Блёстки из каретки — `src/lib/fx/caret.ts`. Итог асинхронного действия на кнопке — `emitOutcome(ok)`. Постоянно анимировать можно только `transform`/`translate`/`opacity`; `filter`, `mix-blend-mode`, `backdrop-filter`, анимация теней и `@property` в постоянном фоне запрещены (проверяет `fx-stage.test.ts`). Читаемость текста: яркость декора и «зона покоя» связаны тестом контраста (≥ 4,5:1), менять одно без другого нельзя. Бюджет проверяется `bun run fx:perf` (простой: 0 кадров и 0 вызовов raf; пик: в среднем ≤ 4 мс на кадр; слоёв фона ≤ 8); скриншоты — `bun run fx:shots`. `prefers-reduced-motion`: частиц, дрейфа и параллакса нет, вместо них статичная вспышка `data-fx-pulse`. Слайдер «Рассуждение» (`ReasoningSlider`): видны только заголовок и слайдер, уровень читается по кристаллу-бегунку, засечкам и вспышкам; `aria-valuetext` с названием уровня сохраняется
```

В раздел «Команды» добавить:

```
bun run fx:perf      # замеры бюджета эффектов в Chromium (после bun run build.ts)
bun run fx:shots     # скриншоты экранов и слайдера в captures/fx/
```

- [ ] **Step 2: Обновить `README.md`**

В раздел «Структура» в дерево `src/` добавить строку после `lib/prompts/`:

```
  lib/fx/          # спецэффекты: пул частиц, движок, атлас, каретка, привязки, фон-тайлы
```

После раздела «Стиль «42»» добавить:

```markdown
### Спецэффекты

Интерфейс «живой»: общий фон `Stage`, блёстки из каретки при печати, вспышки на нажатиях, салют при входе, залпы при готовой картинке, особый слайдер «Рассуждение». Движок рассчитан так, чтобы почти не нагружать устройство (предрасчёт и запечённые спрайты, цикл спит в простое), независимо от мощности. Подробности и правила добавления эффектов — в `docs/superpowers/specs/2026-10-11-special-effects-design.md` и `AGENTS.md`. Проверка бюджета: `bun run fx:perf`.
```

- [ ] **Step 3: Привести спецификацию в соответствие с реализацией** — в конец `docs/superpowers/specs/2026-10-11-special-effects-design.md` добавить раздел:

```markdown
## Уточнения при реализации

- Фон разрежен по замечанию владельца («слишком узорчатый»): 22/12/6 объектов и 30/14/6 пылинок на тайл вместо 40/24/12 и 60/30/14, объекты мельче; блёстки каретки мельче (радиус 4/6/8 px). Покрытие по-прежнему равномерное: тест требует минимум два объекта в каждой клетке 4×3.
- Пыль и наклейки собраны в один SVG-тайл на каждую из трёх глубин: слоёв фона 3 (+ mesh, зона покоя, свет, вспышка), в приёмке «не более 8».
- Непрозрачность слоёв: дальний 0,3, средний 0,45, ближний 0,6 (вместо «60–90%»): выше нельзя без падения контраста текста. Зона покоя: затемнение 0,55 в центре и не меньше 0,3 везде; тест `fx-stage.test.ts` считает контраст самого яркого цвета декора под самой слабой зоной (≥ 4,5:1) и сверяет числа с `index.css`.
- Цикл кадров не выделяет память: прямоугольники dirty-rect переиспользуются (`bounds`/`unionInto` пишут в готовый объект), рендерер считает исходный прямоугольник спрайта арифметикой.
- Меню аккаунта, выбор модели и вкладки реагируют общей вспышкой нажатия (`data-fx`), отдельного «веера искр» у меню нет.
- Итог асинхронных действий админки (добавить/проверить/удалить ключ, начислить кредиты, проверить/выйти из Codex) вспыхивает на нажатой кнопке (`emitOutcome`); «Войти» в Codex реагирует только нажатием и ожиданием.
- Разделители из бусин с бегущим бликом заменены цветной нитью (`fx-divider`): отдельных разделителей в интерфейсе почти нет.
```

- [ ] **Step 4: Итоговая проверка со свежими свидетельствами**

```bash
bun test
bun run lint
bun run typecheck
bun run build
bun run fx:perf
```
Expected: все тесты зелёные (запомнить число), `lint` и `typecheck` без замечаний, сборка успешна, `fx:perf` — «бюджет эффектов выдержан». Прогнать скилл `verification-before-completion` и только после вывода команд заявлять о готовности. Если дополнительно менялась серверная часть или зависимости (кроме dev-зависимости `playwright-core`) — `vercel build --prod`; здесь серверная часть не менялась.

- [ ] **Step 5: Коммит, пуш, PR**

```bash
git add -A AGENTS.md README.md docs
git commit -m "Спецэффекты: документация и уточнения спецификации" -m "$TRAILER"
git push -u origin claude/github-issue-17-w7b2eq
```

Затем:
1. Подготовить скриншоты «до/после» через скилл `before-and-after`: «до» — сборка `main` (`git worktree add ../gen42-main origin/main`, `ln -s $PWD/node_modules ../gen42-main/node_modules`, `bun run build.ts` там, `FX_SHOTS_DIR=…/before` с `dist` из `main` через опцию `dist` у `openPage`), «после» — `captures/fx/`.
2. Проверить шаблон PR (`.github/pull_request_template.md` и аналоги); если есть — повторить его заголовки, пропустив разделы про секреты и окружение.
3. Создать PR (`mcp__github__create_pull_request`, base `main`, head `claude/github-issue-17-w7b2eq`), заголовок «Спецэффекты и анимации в едином стиле», в описании: «Closes #17», что изменилось для пользователя (фон, блёстки из каретки, реакции на действия, слайдер), скриншоты до/после; **без** строк про линтер, типы и тесты; в конце строки атрибуции:
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)` и `https://claude.ai/code/session_013hZ8T6WPS3CEH12uHr6s3b`.
4. Предложить владельцу следить за PR (`subscribe_pr_activity`), довести CI до зелёного в этой же ветке; мерж в `main` — только с явного разрешения владельца.
