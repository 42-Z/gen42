import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import tailwind from "bun-plugin-tailwind";
import { chromium } from "playwright-core";
import { TINY_PNG } from "../src/lib/__tests__/helpers/ultra-fakes";
import { checkResultViewer } from "./checks/result-viewer";

const out = `captures/result-viewer-${Date.now()}`;
await mkdir(out, { recursive: true });
const originalName = [...new Bun.Glob("*.png").scanSync("docs/42_images")][0];
const originalBytes = originalName
	? await Bun.file(`docs/42_images/${originalName}`).bytes()
	: TINY_PNG;
const built = await Bun.build({
	entrypoints: ["index.html"],
	outdir: `${out}/site`,
	plugins: [tailwind],
	target: "browser",
	define: { "process.env.NODE_ENV": '"production"' },
});
if (!built.success) throw new AggregateError(built.logs, "Сборка интерфейса");
const root = path.resolve(`${out}/site`);
const server = Bun.serve({
	port: 0,
	fetch(req) {
		const url = new URL(req.url);
		if (/^\/api\/generations\/[^/]+\/download$/.test(url.pathname)) {
			return new Response(originalBytes, {
				headers: {
					"Content-Type": "image/png",
					"Content-Disposition": 'attachment; filename="gen42-original.png"',
				},
			});
		}
		const file = Bun.file(
			path.join(root, url.pathname === "/" ? "index.html" : url.pathname),
		);
		return new Response(file);
	},
});
const browser = await chromium.launch({
	executablePath: await findChromium(),
	args: ["--no-sandbox"],
});
try {
	await checkResultViewer(
		browser,
		`http://localhost:${server.port}`,
		out,
		originalBytes,
	);
} finally {
	await browser.close();
	server.stop(true);
}
console.log(`Скриншоты: ${out}`);

async function findChromium(): Promise<string> {
	const cache = path.join(homedir(), ".cache/ms-playwright");
	const installed = [
		...new Bun.Glob("chromium-*/chrome-linux*/chrome").scanSync({
			cwd: cache,
		}),
	].map((file) => path.join(cache, file));
	const candidates = [
		process.env.CHROMIUM_PATH,
		"/opt/pw-browsers/chromium",
		...installed,
	].filter((value): value is string => Boolean(value));
	for (const candidate of candidates) {
		if (await Bun.file(candidate).exists()) return candidate;
	}
	throw new Error("Chromium не найден: задайте CHROMIUM_PATH");
}
