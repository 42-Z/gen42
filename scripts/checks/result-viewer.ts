import assert from "node:assert/strict";
import type { Browser } from "playwright-core";
import { TINY_PNG } from "../../src/lib/__tests__/helpers/ultra-fakes";

/** Изолированный сценарий реального интерфейса: просмотр, оригинал и медленная загрузка. */
export async function checkResultViewer(
	browser: Browser,
	base: string,
	out: string,
	downloadBytes: Uint8Array,
) {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 960 },
	});
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
	const image = [...new Bun.Glob("*.png").scanSync("docs/42_images")][0];
	const bytes = image
		? await Bun.file(`docs/42_images/${image}`).bytes()
		: TINY_PNG;
	let originalRequests = 0;
	let releasePreview: (() => void) | undefined;
	let requestedPreview: (() => void) | undefined;
	let holdPreview = false;
	let generated = false;
	const record = {
		id: "viewer-history",
		status: "completed",
		prompt: "Пятёрка устраивает праздник на крыше",
		engine: "ultra",
		model: "gpt-image-2",
		width: 1536,
		height: 1024,
		reasoning: "xhigh",
		duration: 123456,
		steps: 0,
		cost: 10,
		seed: null,
		image_url: "/original.png",
		thumb_url: "/thumb.png",
		preview_url: "/preview.png",
		created_at: "2026-10-18T10:00:00Z",
		error: null,
	};
	await context.route("**/*", async (route) => {
		const p = new URL(route.request().url()).pathname;
		const json = (body: unknown, status = 200) =>
			route.fulfill({ status, json: body });
		if (/fonts\.(googleapis|gstatic)\.com/.test(route.request().url()))
			return route.abort();
		if (p === "/api/auth/get-session")
			return json({ user: { id: "u1", name: "A", email: "a@b.c" } });
		if (p === "/api/me") return json({ balance: 42, is_admin: false });
		if (p === "/api/models")
			return json([
				{ id: "krea", label: "Krea 2", cost: 1 },
				{ id: "ultra", label: "Ультра", cost: 10 },
			]);
		if (p === "/api/generations")
			return json([
				record,
				{
					...record,
					id: "older",
					engine: "krea",
					model: "Turbo",
					width: 1024,
					height: 1024,
					steps: 8,
					reasoning: null,
				},
			]);
		if (p === "/api/generations/running") return json([]);
		if (p === "/api/generate") {
			generated = true;
			return json({ id: "viewer-new", engine: "ultra", cost: 10 }, 202);
		}
		if (p === "/api/generations/viewer-new")
			return json({ ...record, id: "viewer-new", preview_url: "/slow.png" });
		if (/^\/api\/generations\/[^/]+\/download$/.test(p))
			return route.continue();
		if (p === "/original.png") {
			originalRequests++;
			return route.fulfill({
				body: Buffer.from(bytes),
				headers: {
					"Content-Type": "image/png",
					"Content-Disposition": 'attachment; filename="gen42-original.png"',
				},
			});
		}
		if (["/thumb.png", "/preview.png", "/slow.png"].includes(p)) {
			if (p === "/slow.png" && holdPreview) {
				requestedPreview?.();
				await new Promise<void>((resolve) => {
					releasePreview = resolve;
				});
			}
			return route.fulfill({
				contentType: "image/png",
				body: Buffer.from(bytes),
			});
		}
		if (p.startsWith("/api/")) return json({ error: "Не найдено" }, 404);
		return route.continue();
	});
	try {
		await page.goto(base);
		const history = page.getByRole("region", { name: "Недавние" });
		const trigger = history.getByRole("button").first();
		await trigger.click();
		const dialog = page.getByRole("dialog");
		await dialog.waitFor({ timeout: 3000 }).catch(async () => {
			const state = await page.evaluate(() => ({
				buttons: [...document.querySelectorAll("button")].map((button) => ({
					label: button.getAttribute("aria-label"),
					text: button.innerText,
				})),
				dialogNodes: document.querySelectorAll('[data-slot^="dialog"]').length,
				body: document.body.innerText.slice(-700),
			}));
			throw new Error(
				`Окно просмотра не открылось: ${JSON.stringify({ state, errors })}`,
			);
		});
		// Регрессия: старый просмотр содержал только картинку и навигацию.
		const promptText = dialog.getByText(record.prompt, { exact: true });
		await promptText.waitFor({ timeout: 3000 });
		assert.ok(
			Number(
				await promptText.evaluate((element) =>
					getComputedStyle(element).fontSize.replace("px", ""),
				),
			) >= 16,
			"исходный промпт получает типографический акцент",
		);
		assert.ok(
			Number(
				await dialog
					.getByText("2:03", { exact: true })
					.evaluate((element) =>
						getComputedStyle(element).fontSize.replace("px", ""),
					),
			) >= 24,
			"время выделено как главный показатель",
		);
		assert.match(await dialog.innerText(), /1536\s*×\s*1024/);
		assert.match(await dialog.innerText(), /2:03/);
		assert.match(await dialog.innerText(), /gpt-image-2/);
		assert.match(await dialog.innerText(), /Очень высокое/);
		assert.equal(
			await dialog
				.getByRole("button", { name: "Скачать", exact: true })
				.getAttribute("data-variant"),
			"default",
			"скачивание — главная action-кнопка просмотра",
		);
		assert.equal(
			await dialog
				.getByRole("button", { name: /Предыдущее|Следующее/ })
				.count(),
			0,
		);
		assert.doesNotMatch(await dialog.innerText(), /1\s*\/\s*2/);
		await page.waitForFunction(async () => {
			const img = document.querySelector<HTMLImageElement>(
				'[role="dialog"] img',
			);
			if (!img?.complete || img.naturalWidth === 0) return false;
			await img.decode();
			return (
				document
					.querySelector("[data-generation-viewer] [data-sheet]")
					?.getAttribute("aria-busy") === "false"
			);
		});
		assert.equal(originalRequests, 0, "просмотр не скачивает оригинал");
		await page.screenshot({ path: `${out}/viewer-desktop.png` });
		const downloadFixture = await page.evaluate(async (id) => {
			const response = await fetch(`/api/generations/${id}/download`);
			return {
				status: response.status,
				contentDisposition: response.headers.get("Content-Disposition"),
				bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
			};
		}, record.id);
		assert.equal(downloadFixture.status, 200);
		assert.equal(
			downloadFixture.contentDisposition,
			'attachment; filename="gen42-original.png"',
		);
		assert.deepEqual(downloadFixture.bytes, [...downloadBytes]);
		const download = page.waitForEvent("download");
		await dialog.getByRole("button", { name: "Скачать", exact: true }).click();
		const file = await download;
		assert.equal(file.suggestedFilename(), "gen42-original.png");
		const downloaded = await Bun.file((await file.path())!).bytes();
		assert.deepEqual(
			downloaded,
			downloadBytes,
			"скачанный оригинал не перекодирован",
		);
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "hidden" });
		assert.equal(
			await trigger.evaluate((el) => document.activeElement === el),
			true,
		);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ reducedMotion: "reduce" });
		await trigger.click();
		await dialog.waitFor();
		await page.waitForFunction(async () => {
			const image = document.querySelector<HTMLImageElement>(
				'[role="dialog"] img',
			);
			if (!image?.complete || image.naturalWidth === 0) return false;
			await image.decode();
			return (
				document
					.querySelector("[data-generation-viewer] [data-sheet]")
					?.getAttribute("aria-busy") === "false"
			);
		});
		const motion = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((animation) => {
					const target = (animation.effect as KeyframeEffect | null)?.target;
					return (
						target instanceof Element &&
						target.closest(
							'[data-slot="dialog-content"], [data-slot="dialog-overlay"]',
						)
					);
				})
				.map((animation) => {
					const target = (animation.effect as KeyframeEffect).target as Element;
					const style = getComputedStyle(target);
					return {
						target: `${target.tagName.toLowerCase()}.${target.getAttribute("class") ?? ""}`,
						kind: animation.constructor.name,
						animationName: style.animationName,
						transition: style.transitionProperty,
					};
				}),
		);
		assert.equal(
			motion.length,
			0,
			`окно не анимируется при reduced motion: ${JSON.stringify(motion)}`,
		);
		await page.screenshot({ path: `${out}/viewer-mobile.png` });
		assert.equal(
			await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
			true,
			"нет горизонтальной прокрутки",
		);
		await page.keyboard.press("Escape");
		await history.getByRole("button").nth(1).click();
		await dialog.waitFor();
		assert.match(await dialog.innerText(), /Изображение/);
		assert.match(await dialog.innerText(), /Krea 2/);
		assert.match(await dialog.innerText(), /Turbo/);
		assert.match(await dialog.innerText(), /1024\s*×\s*1024/);
		assert.match(await dialog.innerText(), /Шаги\s*8/);
		assert.doesNotMatch(
			await dialog.innerText(),
			/Очень высокое|Высокое|Среднее|Максимальное/,
		);
		await page.keyboard.press("Escape");
		await page.setViewportSize({ width: 1280, height: 960 });
		holdPreview = true;
		const slowStarted = new Promise<void>((resolve) => {
			requestedPreview = resolve;
		});
		await page
			.getByRole("textbox", { name: "Промпт", exact: true })
			.fill("новый кадр");
		await page.getByRole("button", { name: /Сгенерировать/ }).click();
		await slowStarted;
		assert.equal(generated, true);
		assert.equal(
			await page.locator(".frame-flow").getAttribute("data-on"),
			"true",
			"ожидание продолжается до загрузки изображения",
		);
		assert.equal(
			await page
				.locator('[data-slot="result-frame"]')
				.getAttribute("aria-busy"),
			"true",
		);
		holdPreview = false;
		releasePreview?.();
		await page.waitForFunction(async () => {
			const image = document.querySelector<HTMLImageElement>(
				'[data-slot="result-frame"] img',
			);
			if (!image?.complete || image.naturalWidth === 0) return false;
			await image.decode();
			return (
				document.querySelector(".frame-flow")?.getAttribute("data-on") ===
				"false"
			);
		});
		assert.equal(
			await page.locator('[data-slot="result-frame"] img').getAttribute("src"),
			"/slow.png",
		);
		assert.equal(
			originalRequests,
			0,
			"после генерации тоже показывается оптимизированная копия",
		);
		assert.deepEqual(errors, []);
		console.log(
			"Просмотр: история, настройки, оригинал, телефон, загрузка и свежий результат — без ошибок.",
		);
	} finally {
		releasePreview?.();
		await context.close();
	}
}
