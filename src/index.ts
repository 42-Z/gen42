import { serve } from "bun";
import index from "./index.html";
import { authRoutes } from "./api/auth";
import { generateRoutes } from "./api/generate";
import { adminRoutes } from "./api/admin";

const server = serve({
  routes: {
    "/api/auth/*": async (req) => authRoutes["/api/auth/*"](req),

    "/api/generate": generateRoutes["/api/generate"],
    "/api/generations": generateRoutes["/api/generations"],
    "/api/me": generateRoutes["/api/me"],

    "/api/admin/users": adminRoutes["/api/admin/users"],
    "/api/admin/credits": adminRoutes["/api/admin/credits"],
    "/api/admin/keys": adminRoutes["/api/admin/keys"],
    "/api/admin/keys/:id": adminRoutes["/api/admin/keys/:id"],
    "/api/admin/stats": adminRoutes["/api/admin/stats"],

    "/*": index,
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
