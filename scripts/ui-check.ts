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
		`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='a' cx='30%' cy='30%'><stop offset='0' stop-color='#fde047'/><stop offset='1' stop-color='#1f2a44'/></radialGradient></defs><rect width='100' height='100' fill='url(#a)'/></svg>`,
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
				{ id: "turbo", label: "Турбо", cost: 10 },
			]);
		if (p === "/api/generations") return json(state.history);
		if (p === "/api/generations/active") return json({ error: "none" }, 404);
		if (p === "/api/generate") {
			await Bun.sleep(opts.waitMs ?? 2500);
			state.history = [REC];
			return json(REC);
		}
		if (p === "/api/admin/stats")
			return json({ users: 3, generations: 12, credits: 90 });
		if (p.startsWith("/api/admin/")) return json([]);
		return json({});
	});
}
const state: { history: unknown[] } = { history: [] };

const rows: Array<{ name: string; value: string; ok: boolean }> = [];
function check(name: string, value: number, ok: boolean, unit = ""): void {
	rows.push({ name, value: `${Math.round(value * 100) / 100}${unit}`, ok });
}
const shot = (page: Page, name: string) =>
	page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const animations = (page: Page) =>
	page.evaluate(() => document.getAnimations().length);
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
	o: { signedIn: boolean; video?: boolean; reduced?: boolean; hash?: string },
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
	cdp.on("LayerTree.layerTreeDidChange", (e: { layers?: unknown[] }) => {
		layers = e.layers?.length ?? layers;
	});
	await cdp.send("LayerTree.enable");
	await page.waitForSelector("#prompt");
	await pause(page, 1800);
	check(
		"простой: активных анимаций (дрейф фона)",
		await animations(page),
		(await animations(page)) <= 1,
	);
	const raf0 = await rafCount(page);
	await pause(page, 2000);
	check(
		"простой: вызовов requestAnimationFrame за 2 с",
		(await rafCount(page)) - raf0,
		(await rafCount(page)) === raf0,
	);
	check("простой: слоёв композитора", layers, layers <= IDLE_LAYERS);
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
	check(
		"после всего: вызовов requestAnimationFrame за 1 с",
		(await rafCount(page)) - raf1,
		(await rafCount(page)) === raf1,
	);

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
