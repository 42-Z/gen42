import { describe, expect, test } from "bun:test";
import path from "node:path";

const ROOT = path.join(import.meta.dir, "../../..");
const read = (file: string) => Bun.file(path.join(ROOT, file)).text();

describe("шрифты", () => {
	test("Gothic №60 подключён из репозитория и стоит первым в display", async () => {
		const css = await read("src/index.css");
		expect(css).toContain('font-family: "Gothic 60"');
		expect(css).toContain('url("./fonts/gothic60.woff2")');
		expect(css).toMatch(/--font-display:\s*"Gothic 60"/);
		expect(
			await Bun.file(path.join(ROOT, "src/fonts/gothic60.woff2")).exists(),
		).toBe(true);
	});

	test("искусственный жирный отключён: диапазон весов и font-synthesis", async () => {
		const css = await read("src/index.css");
		expect(css).toContain("font-weight: 100 900");
		expect(css).toContain("font-synthesis: none");
	});

	test("у display-шрифта есть трекинг и межсловный пробел (плотный набор слипается)", async () => {
		const css = await read("src/index.css");
		expect(css).toMatch(
			/\.font-display\s*\{[^}]*letter-spacing:\s*0\.0[4-8]em/,
		);
		expect(css).toMatch(/\.font-display\s*\{[^}]*word-spacing:/);
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
