import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "bun";
import { adminRoutes } from "./api/admin";
import { authRoutes } from "./api/auth";
import { codexAdminRoutes } from "./api/codex-admin";
import { cronRoutes } from "./api/cron";
import { generateRoutes } from "./api/generate";

const DIST_DIR = join(process.cwd(), "dist");

async function serveStatic(url: URL): Promise<Response | null> {
	let pathname = url.pathname;
	if (pathname === "/") pathname = "/index.html";

	const filePath = join(DIST_DIR, pathname);
	if (existsSync(filePath)) {
		return new Response(Bun.file(filePath));
	}

	const indexPath = join(DIST_DIR, "index.html");
	if (existsSync(indexPath)) {
		return new Response(Bun.file(indexPath));
	}

	return null;
}

/** Набор маршрутов зависит от окружения; необязательный ключ типы `routes` Bun не принимают */
type WorkflowRoutes = Record<
	string,
	{ POST: (request: Request) => Promise<Response> }
>;

/**
 * Локально обработчик очереди Workflow живёт в этом же сервере (Local World
 * доставляет сообщения на его порт). На Vercel это отдельная закрытая функция,
 * поэтому в продакшене маршрут не монтируется.
 */
async function workflowDevRoutes(): Promise<WorkflowRoutes> {
	if (process.env.NODE_ENV === "production") return {};
	// путь в переменной: tsc не разбирает сгенерированный бандл на мегабайты
	const flowModule = "../.well-known/workflow/v1/flow.mjs";
	try {
		const flow = (await import(flowModule)) as {
			POST: (request: Request) => Promise<Response>;
		};
		return { "/.well-known/workflow/v1/flow": { POST: flow.POST } };
	} catch (error) {
		console.warn(
			"Обработчик Workflow не найден, выполните `bun run workflow:build`:",
			error,
		);
		return {};
	}
}

const server = serve({
	routes: {
		...(await workflowDevRoutes()),
		"/api/auth/*": async (req) => authRoutes["/api/auth/*"](req),

		"/api/generate": generateRoutes["/api/generate"],
		"/api/generations": generateRoutes["/api/generations"],
		"/api/generations/active": generateRoutes["/api/generations/active"],
		"/api/generations/:id": generateRoutes["/api/generations/:id"],
		"/api/me": generateRoutes["/api/me"],
		"/api/models": generateRoutes["/api/models"],

		"/api/admin/users": adminRoutes["/api/admin/users"],
		"/api/admin/credits": adminRoutes["/api/admin/credits"],
		"/api/admin/keys": adminRoutes["/api/admin/keys"],
		"/api/admin/keys/:id": adminRoutes["/api/admin/keys/:id"],
		"/api/admin/stats": adminRoutes["/api/admin/stats"],

		"/api/admin/codex": codexAdminRoutes["/api/admin/codex"],
		"/api/admin/codex/login": codexAdminRoutes["/api/admin/codex/login"],
		"/api/admin/codex/check": codexAdminRoutes["/api/admin/codex/check"],

		"/api/cron/daily-credits": cronRoutes["/api/cron/daily-credits"],
	},

	fetch: async (req) => {
		const url = new URL(req.url);

		if (url.pathname.startsWith("/api/")) {
			return new Response("Not found", { status: 404 });
		}

		const staticResponse = await serveStatic(url);
		if (staticResponse) return staticResponse;

		return new Response("Not found", { status: 404 });
	},

	error(error) {
		console.error("Unhandled server error:", error);
		return new Response("Internal Server Error", { status: 500 });
	},

	development: process.env.NODE_ENV !== "production" && {
		hmr: true,
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
