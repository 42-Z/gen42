import { describe, expect, test } from "bun:test";
import path from "node:path";

const ROOT = path.join(import.meta.dir, "../../..");
const read = (file: string) => Bun.file(path.join(ROOT, file)).text();

describe("шрифты", () => {
	test("Gogh ExtraBold подключён из репозитория и стоит первым в display", async () => {
		const css = await read("src/index.css");
		expect(css).toContain('font-family: "Gogh"');
		expect(css).toContain('url("./fonts/gogh-extrabold.woff2")');
		expect(css).toMatch(/--font-display:\s*"Gogh"/);
		expect(
			await Bun.file(
				path.join(ROOT, "src/fonts/gogh-extrabold.woff2"),
			).exists(),
		).toBe(true);
	});

	test("файл display-шрифта — WOFF2 меньше 40 КБ (подмножество, а не вся семья)", async () => {
		const bytes = await Bun.file(
			path.join(ROOT, "src/fonts/gogh-extrabold.woff2"),
		).bytes();
		expect(bytes.length).toBeLessThan(40_000);
		// сигнатура WOFF2: «wOF2»
		expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("wOF2");
	});

	test("искусственный жирный отключён: диапазон весов и font-synthesis", async () => {
		const css = await read("src/index.css");
		expect(css).toContain("font-weight: 100 900");
		expect(css).toContain("font-synthesis: none");
	});

	test("у display-шрифта трекинг не отрицательный", async () => {
		const css = await read("src/index.css");
		expect(css).toMatch(
			/\.font-display\s*\{[^}]*letter-spacing:\s*0(?:\.\d+)?em/,
		);
	});

	test("display-элементы не сжимаются классом tracking-tight", async () => {
		for (const file of [
			"Auth",
			"Admin",
			"CodexAccess",
			"Generate",
			"graphics",
		]) {
			const src = await read(`src/components/${file}.tsx`);
			expect(src).not.toMatch(/font-display[^"`]*tracking-tight/);
		}
	});

	test("страница не грузит display-шрифт без кириллицы", async () => {
		const html = await read("index.html");
		expect(html).not.toContain("Bricolage");
		expect(html).toContain("Inter+Tight");
	});
});
