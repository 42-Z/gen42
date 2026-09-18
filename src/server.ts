import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "bun";
import { adminRoutes } from "./api/admin";
import { authRoutes } from "./api/auth";
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

const server = serve({
	routes: {
		"/api/auth/*": async (req) => authRoutes["/api/auth/*"](req),

		"/api/generate": generateRoutes["/api/generate"],
		"/api/generations": generateRoutes["/api/generations"],
		"/api/me": generateRoutes["/api/me"],
		"/api/models": generateRoutes["/api/models"],

		"/api/admin/users": adminRoutes["/api/admin/users"],
		"/api/admin/credits": adminRoutes["/api/admin/credits"],
		"/api/admin/keys": adminRoutes["/api/admin/keys"],
		"/api/admin/keys/:id": adminRoutes["/api/admin/keys/:id"],
		"/api/admin/stats": adminRoutes["/api/admin/stats"],
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
