import {
	checkCodex,
	codexLoginStream,
	createCodexAuth,
	getCodexStatus,
} from "../lib/turbo/codex-auth";
import { adminResponse, checkAdmin } from "./admin";

/** Вход по коду живёт до подтверждения; функция Vercel — не больше 300 с */
const LOGIN_TIMEOUT_MS = 280_000;

export const codexAdminRoutes = {
	"/api/admin/codex": {
		GET: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				return Response.json(await getCodexStatus());
			}),

		DELETE: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				await createCodexAuth().logout();
				return Response.json({ success: true });
			}),
	},

	"/api/admin/codex/login": {
		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				const signal = AbortSignal.any([
					req.signal,
					AbortSignal.timeout(LOGIN_TIMEOUT_MS),
				]);
				return new Response(codexLoginStream(createCodexAuth(), signal), {
					headers: {
						"Content-Type": "application/x-ndjson; charset=utf-8",
						"Cache-Control": "no-store",
					},
				});
			}),
	},

	"/api/admin/codex/check": {
		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);
				const result = await checkCodex(createCodexAuth());
				return Response.json(result, { status: result.ok ? 200 : 502 });
			}),
	},
};
