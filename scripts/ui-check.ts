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
const IDLE_LAYERS = 8;
const WAIT_LAYERS = 11;
/** Отрисовка кадров по трассировке (мс). Headless Chromium рисует программно, без GPU, — худший случай */
const IDLE_DRAW_MS_PER_3S = 150;
const WAIT_DRAW_MS_PER_1_2S = 400;

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
		const full = path.join(
			ROOT,
			url.pathname === "/" ? "index.html" : url.pathname,
		);
		if (!full.startsWith(ROOT))
			return new Response("not found", { status: 404 });
		const file = Bun.file(full);
		return (await file.exists())
			? new Response(file)
			: new Response("not found", { status: 404 });
	},
});

const ART =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		`<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024' viewBox='0 0 100 100'><defs><radialGradient id='a' cx='30%' cy='30%'><stop offset='0' stop-color='#fde047'/><stop offset='1' stop-color='#1f2a44'/></radialGradient></defs><rect width='100' height='100' fill='url(#a)'/></svg>`,
	);
const REC = {
	id: "g1",
	status: "completed",
	image_url: ART,
	thumb_url: ART,
	prompt: "кот в короне",
	seed: 7,
	engine: "krea",
	cost: 1,
	duration: 5,
};

/** Подставной API: ровно то, что читают экраны */
async function mockApi(
	page: Page,
	opts: { signedIn: boolean; waitMs?: number },
) {
	await page.route("**/api/**", async (route) => {
		const url = new URL(route.request().url());
		const p = url.pathname;
		const json = (body: unknown, status = 200) =>
			route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify(body),
			});
		if (p === "/api/auth/get-session")
			return json(
				opts.signedIn ? { user: { id: "u1", email: "a@b.c", name: "A" } } : {},
			);
		if (p === "/api/auth/sign-in/email")
			return json({ user: { id: "u1", email: "a@b.c" } });
		if (p === "/api/me") return json({ balance: 42, is_admin: true });
		if (p === "/api/models")
			return json([
				{ id: "krea", label: "Krea 2", cost: 1 },
				{ id: "ideogram", label: "Ideogram 4", cost: 3 },
				{ id: "turbo", label: "Ультра", cost: 10 },
			]);
		if (p === "/api/generations") return json(state.history);
		if (p === "/api/generations/active") return json({ error: "none" }, 404);
		if (p === "/api/generate") {
			state.startedAt = Date.now();
			await Bun.sleep(opts.waitMs ?? 4500);
			state.history = [REC];
			return json(REC);
		}
		// опрос записи после обновления страницы: идёт, пока не прошло время ожидания
		if (/^\/api\/generations\/[^/]+$/.test(p)) {
			const running = Date.now() - state.startedAt < (opts.waitMs ?? 4500);
			return json(
				running ? { id: "g1", status: "running", prompt: "кот в короне" } : REC,
			);
		}
		if (p === "/api/admin/stats")
			return json({ totalGenerations: 128, todayGenerations: 12 });
		if (p === "/api/admin/users")
			return json([{ id: "u1", email: "a@b.c", name: "A", balance: 42 }]);
		if (p === "/api/admin/keys")
			return json(
				url.searchParams.get("provider")
					? []
					: [
							{
								id: "k1",
								name: "Основной",
								key: "hf_…a1b2",
								is_active: true,
								hf_current: 540,
								hf_base: 600,
								hf_runs_remaining: 7,
								hf_runs_limit: 8,
							},
							{
								id: "k2",
								name: "Запасной",
								key: "hf_…c3d4",
								is_active: true,
								hf_current: 210,
								hf_base: 600,
								hf_runs_remaining: 3,
								hf_runs_limit: 8,
							},
							{
								id: "k3",
								name: "Старый",
								key: "hf_…e5f6",
								is_active: true,
								hf_current: 40,
								hf_base: 600,
								hf_runs_remaining: 0,
								hf_runs_limit: 8,
							},
						],
			);
		if (p.startsWith("/api/admin/keys/")) return json({ ok: true });
		if (p.startsWith("/api/admin/")) return json([]);
		return json({});
	});
}
const state: { history: unknown[]; startedAt: number } = {
	history: [],
	startedAt: 0,
};

const rows: Array<{ name: string; value: string; ok: boolean }> = [];
function check(name: string, value: number, ok: boolean, unit = ""): void {
	rows.push({ name, value: `${Math.round(value * 100) / 100}${unit}`, ok });
}
const shot = (page: Page, name: string) =>
	page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const animations = (page: Page) =>
	page.evaluate(
		() =>
			document.getAnimations().filter((a) => a.playState === "running").length,
	);
/** Что именно анимируется: тег, класс и имя анимации (для разбора красных строк) */
const describeAnimations = (page: Page) =>
	page.evaluate(() =>
		document
			.getAnimations()
			.filter((a) => a.playState === "running")
			.map((a) => {
				const t = (a.effect as KeyframeEffect | null)
					?.target as HTMLElement | null;
				const name =
					(a as CSSAnimation).animationName ??
					(a as CSSTransition).transitionProperty ??
					"waapi";
				return `${t?.tagName?.toLowerCase()}.${String(t?.className).slice(0, 40)} ${name}`;
			}),
	);
/**
 * Нагрузка за окно времени по трассировке Chrome (мс): растеризация, показ кадров,
 * стили/раскладка/отрисовка основного потока и скрипт. Это не FPS, а цена кадров:
 * анимации только на композиторе дают почти ноль.
 */
async function measureLoad(browser: Browser, page: Page, ms: number) {
	await browser.startTracing(page, {
		categories: ["devtools.timeline", "cc", "viz", "gpu"],
		screenshots: false,
	});
	await pause(page, ms);
	const buf = await browser.stopTracing();
	const events = (
		JSON.parse(buf.toString()) as {
			traceEvents: Array<{ name: string; ph: string; dur?: number }>;
		}
	).traceEvents;
	const sum = (re: RegExp) =>
		events
			.filter((e) => e.ph === "X" && re.test(e.name))
			.reduce((a, e) => a + (e.dur ?? 0), 0) / 1000;
	const out = {
		raster: sum(/^RasterTask$/),
		draw: sum(/^(Display::DrawAndSwap|DrawFrame)$/),
		style: sum(/^(UpdateLayoutTree|RecalcStyle)$/),
		layout: sum(/^Layout$/),
		paint: sum(/^(Paint|PrePaint|UpdateLayer|Layerize)$/),
		script: sum(/^(FunctionCall|EvaluateScript|FireAnimationFrame|TimerFire)$/),
	};
	if (process.env.TRACE_DEBUG) {
		const by = new Map<string, number>();
		for (const e of events)
			if (e.ph === "X")
				by.set(e.name, (by.get(e.name) ?? 0) + (e.dur ?? 0) / 1000);
		console.log(
			"  трассировка (топ):",
			[...by.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 14)
				.map(([n, v]) => `${n} ${v.toFixed(1)}`)
				.join("; "),
		);
	}
	return out;
}
const rafCount = (page: Page) =>
	page.evaluate(() => (window as unknown as { __raf: number }).__raf);

async function findChromium(): Promise<string> {
	for (const p of [
		process.env.CHROMIUM_PATH,
		"/opt/pw-browsers/chromium",
		"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
	].filter(Boolean) as string[]) {
		if (await Bun.file(p).exists()) return p;
	}
	throw new Error("Chromium не найден: задайте CHROMIUM_PATH");
}

async function open(
	browser: Browser,
	o: {
		signedIn: boolean;
		video?: boolean;
		reduced?: boolean;
		hash?: string;
		waitMs?: number;
	},
) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 960 },
		reducedMotion: o.reduced ? "reduce" : "no-preference",
		...(o.video
			? {
					recordVideo: {
						dir: path.join(OUT, "video"),
						size: { width: 1280, height: 960 },
					},
				}
			: {}),
	});
	const page = await context.newPage();
	page.on("pageerror", (e) => console.log("  ошибка страницы:", e.message));
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
	await page.addInitScript(() => {
		// дудлы по таймеру выключены, чтобы не попадать в окна замеров;
		// сценарий «дудлы» запускает их вручную событием
		try {
			localStorage.setItem("gen42-doodles", "off");
		} catch {}
		const w = window as unknown as { __raf: number };
		w.__raf = 0;
		const original = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (cb: FrameRequestCallback) => {
			w.__raf++;
			return original(cb);
		};
	});
	await mockApi(page, { signedIn: o.signedIn, waitMs: o.waitMs });
	await page.goto(`http://localhost:${server.port}/${o.hash ?? ""}`);
	return { context, page };
}

const browser = await chromium.launch({
	executablePath: await findChromium(),
	args: ["--no-sandbox"],
});
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
	const { context, page } = await open(browser, {
		signedIn: true,
		video: true,
	});
	const cdp = await context.newCDPSession(page);
	let layers = 0;
	let lastLayers: Array<{
		backendNodeId?: number;
		width: number;
		height: number;
	}> = [];
	cdp.on(
		"LayerTree.layerTreeDidChange",
		(e: { layers?: typeof lastLayers }) => {
			layers = e.layers?.length ?? layers;
			lastLayers = e.layers ?? lastLayers;
		},
	);
	/** Какие узлы держат слои (для разбора красных строк) */
	const describeLayers = async () => {
		await cdp.send("DOM.enable");
		await cdp.send("DOM.getDocument", { depth: 1 });
		const out: string[] = [];
		for (const l of lastLayers) {
			let name = "-";
			if (l.backendNodeId) {
				try {
					const d = (await cdp.send("DOM.describeNode", {
						backendNodeId: l.backendNodeId,
					})) as {
						node: { nodeName: string; attributes?: string[] };
					};
					const cls =
						d.node.attributes?.[d.node.attributes.indexOf("class") + 1] ?? "";
					name = `${d.node.nodeName.toLowerCase()}.${cls.slice(0, 40)}`;
				} catch {}
			}
			out.push(`${Math.round(l.width)}x${Math.round(l.height)} ${name}`);
		}
		return out;
	};
	await cdp.send("LayerTree.enable");
	await page.waitForSelector("#prompt");
	await pause(page, 1800);
	check(
		"простой: активных анимаций (дрейф фона)",
		await animations(page),
		(await animations(page)) <= 1,
	);
	if ((await animations(page)) > 1)
		console.log("  идут:", await describeAnimations(page));
	const raf0 = await rafCount(page);
	await pause(page, 2000);
	check(
		"простой: вызовов requestAnimationFrame за 2 с",
		(await rafCount(page)) - raf0,
		(await rafCount(page)) === raf0,
	);
	check("простой: слоёв композитора", layers, layers <= IDLE_LAYERS);
	{
		const t = await measureLoad(browser, page, 3000);
		console.log("  простой, нагрузка за 3 с, мс:", JSON.stringify(t));
		check(
			"простой: отрисовка кадров за 3 с",
			t.draw,
			t.draw <= IDLE_DRAW_MS_PER_3S,
			" мс",
		);
	}
	await shot(page, "03-main-idle");

	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
	const samples: number[] = [];
	for (let i = 0; i < 5; i++) {
		samples.push(
			await page.evaluate(() => {
				const el =
					document.querySelector("[data-slot=button][data-impulse]") ??
					document.querySelector("button")!;
				const t0 = performance.now();
				el.dispatchEvent(
					new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
				);
				const dt = performance.now() - t0;
				el.dispatchEvent(
					new PointerEvent("pointerup", { bubbles: true, isPrimary: true }),
				);
				return dt;
			}),
		);
		await pause(page, 1300);
	}
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
	const cost = [...samples].sort((a, b) => a - b)[2]!;
	check(
		"реакция на событие при замедлении ×4 (медиана из 5)",
		cost,
		cost <= COST_BUDGET_MS,
		" мс",
	);
	await pause(page, 600);

	await page.click("#prompt");
	await page.keyboard.type("кот в короне едет на тракторе", { delay: 55 });
	await shot(page, "04-typing");
	for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
	await shot(page, "05-erasing");
	await pause(page, 900);

	await page.getByRole("tab", { name: "Ультра" }).click();
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
	// волны старта и «принято» к этому моменту затухли: считаем слои ожидания
	await pause(page, 2600);
	check("ожидание: слоёв композитора", layers, layers <= WAIT_LAYERS);
	if (layers > WAIT_LAYERS) console.log("  слои:", await describeLayers());
	{
		const t = await measureLoad(browser, page, 1200);
		console.log("  ожидание, нагрузка за 1,2 с, мс:", JSON.stringify(t));
		check(
			"ожидание: отрисовка кадров за 1,2 с",
			t.draw,
			t.draw <= WAIT_DRAW_MS_PER_1_2S,
			" мс",
		);
	}
	await shot(page, "09-waiting");
	// занавес: кадр сразу после начала сдёргивания потока
	await page
		.waitForFunction(
			() =>
				(document.querySelector(".frame-flow") as HTMLElement | null)
					?.getAnimations()
					.some((a) =>
						(a.effect as KeyframeEffect | null)
							?.getKeyframes()
							.some((k) => "transform" in k),
					),
			undefined,
			{ timeout: 12000 },
		)
		.catch(() => undefined);
	await pause(page, 200);
	await shot(page, "10-curtain");
	// вспышка на пике «выдоха»: полоса и логотип оживают один раз после занавеса
	const flashed = await page
		.waitForFunction(
			() =>
				(
					document.querySelector('[data-flash="band"]') as HTMLElement | null
				)?.getAnimations().length,
			undefined,
			{ timeout: 12000 },
		)
		.then(() => true)
		.catch(() => false);
	check("вспышка: полоса шапки ожила", flashed ? 1 : 0, flashed);
	await pause(page, 250);
	await shot(page, "10b-flash");
	await pause(page, 1800);
	await shot(page, "11-done");
	// шапка залипает при прокрутке (без размытия) и остаётся окном листа
	await page.evaluate(() => window.scrollTo(0, 700));
	await pause(page, 500);
	const headTop = await page.evaluate(
		() => document.querySelector("header")?.getBoundingClientRect().top ?? -1,
	);
	check(
		"шапка при прокрутке: верх окна просмотра",
		headTop,
		headTop === 0,
		" px",
	);
	await shot(page, "11b-sticky-header");
	await page.evaluate(() => window.scrollTo(0, 0));
	await pause(page, 400);

	await page.locator("section[aria-label=Недавние] button").first().click();
	await pause(page, 700);
	await shot(page, "12-lightbox");
	await pause(page, 900);
	await shot(page, "12b-lightbox-late");
	await page.keyboard.press("Escape");
	await pause(page, 400);

	const raf1 = await rafCount(page);
	await pause(page, 1000);
	check(
		"после всего: вызовов requestAnimationFrame за 1 с",
		(await rafCount(page)) - raf1,
		(await rafCount(page)) === raf1,
	);

	await page.goto(`http://localhost:${server.port}/#/admin`);
	await pause(page, 1400);
	await shot(page, "13-admin");
	// строки таблицы входят волной (кадр сразу после монтирования выше), наведение — одно скользящее окно
	await page
		.locator("[data-slot=table-body] > [data-slot=table-row]")
		.nth(1)
		.hover();
	await pause(page, 500);
	await shot(page, "14-table-hover");
	await page
		.locator("[data-slot=table-body] > [data-slot=table-row]")
		.nth(2)
		.hover();
	await pause(page, 110);
	await shot(page, "14b-table-hover-moving");
	// меню аккаунта: открытие пружиной, наведённый пункт — скользящее окно
	await page.getByRole("button", { name: "Аккаунт" }).click();
	await pause(page, 600);
	await page.getByRole("menuitem").first().hover();
	await pause(page, 400);
	await shot(page, "15-account-menu");
	await page.keyboard.press("Escape");
	await page.mouse.click(10, 500);
	await pause(page, 300);

	const videoPath = await page.video()?.path();
	await context.close();
	if (videoPath) renameSync(videoPath, path.join(OUT, "demo.webm"));

	// ── обновление страницы во время ожидания: рамка сразу на второй ступени ──
	const rs = await open(browser, { signedIn: true, waitMs: 9000 });
	await rs.page.waitForSelector("#prompt");
	await rs.page.fill("#prompt", "кот в короне");
	await rs.page.getByRole("button", { name: /Сгенерировать/ }).click();
	await pause(rs.page, 1800);
	await rs.page.reload();
	await rs.page.waitForSelector(".frame-flow");
	await pause(rs.page, 350);
	const resumedOpacity = await rs.page.evaluate(() =>
		Number.parseFloat(
			(document.querySelector(".frame-flow") as HTMLElement).style.opacity,
		),
	);
	check(
		"после обновления: ступень ожидания (яркость потока)",
		resumedOpacity,
		resumedOpacity >= 0.4,
	);
	await shot(rs.page, "16-resumed");
	await rs.context.close();

	// ── дудлы: слово уступает место персонажу и возвращается, покой чистый ──
	const dd = await open(browser, { signedIn: true });
	await dd.page.waitForSelector("header .brand");
	await pause(dd.page, 900);
	const doodlesIdle = await dd.page.evaluate(
		() => document.querySelectorAll(".doodle").length,
	);
	check("дудлы: в покое рисунков в DOM", doodlesIdle, doodlesIdle === 0);
	for (const kind of ["pug", "hippo", "pig", "pyatyorka", "mellsher"]) {
		await dd.page.evaluate((k) => {
			document
				.querySelector("header .brand")
				?.dispatchEvent(new CustomEvent("doodle:play", { detail: k }));
		}, kind);
		await pause(dd.page, 1700);
		await shot(dd.page, `17-doodle-${kind}`);
		const during = await dd.page.evaluate(() => {
			const logo = document.querySelector("header .logo") as HTMLElement;
			const svg = document.querySelector("header .doodle") as SVGElement | null;
			const box = svg?.getBoundingClientRect();
			return {
				logoOpacity: Number.parseFloat(getComputedStyle(logo).opacity),
				cls: svg?.getAttribute("class") ?? "",
				top: box?.top ?? -1,
				bottom: box?.bottom ?? -1,
				headerBottom:
					document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
			};
		});
		check(
			`дудл ${kind}: слово ушло, персонаж в шапке`,
			during.logoOpacity,
			during.logoOpacity < 0.05 &&
				during.cls.includes(`dk-${kind}`) &&
				during.top >= 0 &&
				during.bottom <= during.headerBottom,
		);
		await dd.page.waitForFunction(
			() => !document.querySelector(".doodle"),
			null,
			{
				timeout: 6000,
			},
		);
		await pause(dd.page, 300);
	}
	const after = await dd.page.evaluate(() => ({
		marked: document
			.querySelector("header .brand")
			?.hasAttribute("data-doodle"),
		logoOpacity: Number.parseFloat(
			getComputedStyle(document.querySelector("header .logo") as HTMLElement)
				.opacity,
		),
	}));
	check(
		"дудлы: после показа слово вернулось",
		after.logoOpacity,
		after.logoOpacity === 1 && after.marked === false,
	);
	const afterAnimations = await animations(dd.page);
	check(
		"дудлы: после показа активных анимаций (дрейф фона)",
		afterAnimations,
		afterAnimations === 1,
	);
	await dd.context.close();

	// ── reduced-motion ──────────────────────────────────────────────────
	const rm = await open(browser, { signedIn: true, reduced: true });
	await rm.page.waitForSelector("#prompt");
	await pause(rm.page, 900);
	check(
		"reduced-motion: анимаций в покое",
		await animations(rm.page),
		(await animations(rm.page)) === 0,
	);
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
