import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { workflowTransform } from "../workflow-transform";

/**
 * Сборка для Vercel в формате Build Output API v3 (vercel.com/docs/build-output-api/v3).
 * Запускается после `workflow build --target vercel-build-output-api` и `build.ts`
 * (см. скрипт `build:vercel`), когда в `.vercel/output` уже лежат функции Workflow,
 * а во фронтенде `dist/`.
 *
 * Зачем собственная сборка вместо пресета Bun: сборщик пресета сам компилирует
 * серверный код и не применяет плагин Workflow из bunfig.toml, поэтому `start()` не
 * получает идентификатор воркфлоу («invalid workflow function»). Здесь сервер
 * собирается `Bun.build` с тем же плагином, что и в разработке.
 *
 * Результат:
 * - `functions/index.func` — сайт: бандл сервера плюс `dist/` рядом;
 * - `functions/.well-known/workflow/v1/flow.func` — закрытый потребитель очереди
 *   Workflow (триггер `experimentalTriggers` уже записал `workflow build`);
 * - `config.json` — маршруты; крон из vercel.json (`crons`) Vercel добавляет сам.
 */

const OUTPUT = ".vercel/output";
const SITE = `${OUTPUT}/functions/index.func`;
const WORKFLOW = `${OUTPUT}/functions/.well-known/workflow/v1`;
// Hobby: максимум для функции
const MAX_DURATION = 300;
// Шаги Workflow используют Bun.S3Client и Bun.Image, поэтому функции Workflow
// тоже на Bun; архитектура та же, на которой работает сайт
const RUNTIME = "bun1.4.x";
const ARCHITECTURE = "x86_64";

await mkdir(`${SITE}/dist`, { recursive: true });
const server = await Bun.build({
	entrypoints: ["src/server.ts"],
	outdir: SITE,
	naming: "server.js",
	target: "bun",
	plugins: [workflowTransform],
	define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!server.success) {
	for (const log of server.logs) console.error(log);
	process.exit(1);
}
await cp("dist", `${SITE}/dist`, { recursive: true });
await writeFile(
	`${SITE}/.vc-config.json`,
	JSON.stringify(
		{
			runtime: RUNTIME,
			handler: "server.js",
			launcherType: "Nodejs",
			architecture: ARCHITECTURE,
			shouldAddHelpers: false,
			shouldAddSourcemapSupport: false,
			maxDuration: MAX_DURATION,
		},
		null,
		2,
	),
);

for (const dir of [
	`${WORKFLOW}/flow.func`,
	`${WORKFLOW}/webhook/[token].func`,
]) {
	const file = `${dir}/.vc-config.json`;
	const config = JSON.parse(await readFile(file, "utf8")) as Record<
		string,
		unknown
	>;
	await writeFile(
		file,
		JSON.stringify(
			{ ...config, runtime: RUNTIME, architecture: ARCHITECTURE },
			null,
			2,
		),
	);
}

// Маршрут вебхука Workflow пишет `workflow build`; остальное отдаёт сервер сайта
const { routes: workflowRoutes } = JSON.parse(
	await readFile(`${OUTPUT}/config.json`, "utf8"),
) as { routes: unknown[] };
await writeFile(
	`${OUTPUT}/config.json`,
	JSON.stringify(
		{
			version: 3,
			routes: [
				...workflowRoutes,
				{ handle: "filesystem" },
				{
					src: "/(.*)",
					dest: "/",
					transforms: [{ type: "request.path", op: "set", args: "/$1" }],
				},
			],
		},
		null,
		2,
	),
);
console.log(`Build Output API готов: ${OUTPUT}`);
