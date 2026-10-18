import { auth } from "../lib/auth";
import { getCredits } from "../lib/credits";
import { sql } from "../lib/db";
import { publicGenerationError } from "../lib/generation-error";
import { TOO_MANY_REQUESTS_ERROR } from "../lib/generation-limits";
import {
	type GenerationRecord,
	getActiveGeneration,
	getGeneration,
	listRunningGenerations,
} from "../lib/generations";
import {
	getImageModel,
	publicImageModels,
	resolveImageEngine,
} from "../lib/models";
import { checkRateLimit } from "../lib/rate-limit";
import { parseSpaceRequest } from "../lib/spaces/request";
import { spaceStartDeps } from "../lib/spaces/start-deps";
import { startRun } from "../lib/start-run";
import { getImageUrl } from "../lib/storage";
import { getOrCreateThumb } from "../lib/thumbnails";
import { isUltraAvailable } from "../lib/ultra/codex-auth";
import { parseUltraReasoning } from "../lib/ultra/reasoning";
import { startUltra } from "../lib/ultra/start";
import { startUltraDeps } from "../lib/ultra/start-deps";

/** Запись истории для клиента: картинка пресайнится только для завершённых */
async function generationJson(record: GenerationRecord) {
	return {
		id: record.id,
		status: record.status,
		prompt: record.prompt,
		engine: record.engine,
		model: record.model,
		seed: record.seed,
		cost: record.cost,
		image_url:
			record.status === "completed" && record.imageKey
				? await getImageUrl(record.imageKey)
				: null,
		error:
			record.status === "failed"
				? publicGenerationError(record.errorMessage)
				: null,
		duration: record.durationMs,
		created_at: record.createdAt,
	};
}

export const generateRoutes = {
	"/api/models": {
		// каталог движков без секретов; «Ультра» в нём только пока рабочий вход Codex
		GET: async () => {
			const ultra = await isUltraAvailable().catch(() => false);
			return Response.json(publicImageModels({ ultra }), {
				headers: { "Cache-Control": "private, max-age=60" },
			});
		},
	},

	"/api/generate": {
		POST: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			if (!checkRateLimit(session.user.id, 10, 60_000)) {
				return Response.json(
					{ error: TOO_MANY_REQUESTS_ERROR },
					{ status: 429 },
				);
			}

			const body = await req.json();
			const { prompt } = body;
			// Старые вкладки могут прислать прежний id `turbo`; сервер принимает его как `ultra`.
			const isUltraRequest = body.engine === "ultra" || body.engine === "turbo";
			const ultraAvailable =
				isUltraRequest && (await isUltraAvailable().catch(() => false));
			const engine = resolveImageEngine(body.engine, ultraAvailable);

			if (typeof prompt !== "string" || !prompt || prompt.length > 1000) {
				return Response.json({ error: "Некорректный промпт" }, { status: 400 });
			}

			if (engine === "ultra") {
				// неизвестный уровень отклоняется, а не заменяется молча другим
				const reasoning = parseUltraReasoning(body.reasoning);
				if (!reasoning) {
					return Response.json(
						{ error: "Некорректный уровень рассуждения" },
						{ status: 400 },
					);
				}
				const outcome = await startUltra(
					{
						userId: session.user.id,
						prompt,
						reasoning,
						...(typeof body.id === "string" ? { id: body.id } : {}),
					},
					startUltraDeps,
				);
				return Response.json(outcome.body, { status: outcome.status });
			}

			// Krea 2 и Ideogram 4 тоже идут воркфлоу: запуск принимается в работу и сразу
			// отвечает 202, результат приходит опросом `/api/generations/:id`
			const request = parseSpaceRequest(body, engine);
			const outcome = await startRun(
				{
					userId: session.user.id,
					engine,
					cost: getImageModel(engine).cost,
				},
				spaceStartDeps(session.user.id, request),
			);
			return Response.json(outcome.body, { status: outcome.status });
		},
	},

	"/api/generations": {
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			const rows = await sql`
        SELECT id, prompt, model, seed, image_key, created_at
        FROM generations
        WHERE user_id = ${session.user.id} AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 50
      `;

			const withUrls = await Promise.all(
				rows.map(async (row: any) => ({
					...row,
					image_url: row.image_key ? await getImageUrl(row.image_key) : null,
					// стабильный адрес превью: браузер кеширует его, в отличие от каждый раз новой подписи S3
					thumb_url: row.image_key ? `/api/generations/${row.id}/thumb` : null,
				})),
			);

			return Response.json(withUrls);
		},
	},

	"/api/generations/:id/thumb": {
		// уменьшенная копия для сетки галереи; содержимое записи не меняется, поэтому кеш вечный
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			const { id } = (req as any).params;
			const record = await getGeneration(session.user.id, id);
			if (record?.status !== "completed" || !record.imageKey) {
				return Response.json({ error: "Не найдено" }, { status: 404 });
			}
			const thumb = await getOrCreateThumb(record.imageKey).catch((error) => {
				console.error("Thumbnail error:", error);
				return null;
			});
			if (!thumb) {
				return Response.json({ error: "Не найдено" }, { status: 404 });
			}
			return new Response(new Blob([new Uint8Array(thumb)]), {
				headers: {
					"Content-Type": "image/webp",
					"Cache-Control": "private, max-age=31536000, immutable",
				},
			});
		},
	},

	"/api/generations/active": {
		// идущая генерация пользователя: страница находит её после обновления
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			const record = await getActiveGeneration(session.user.id);
			return Response.json(record ? await generationJson(record) : null);
		},
	},

	"/api/generations/running": {
		// все идущие генерации пользователя: страница восстанавливает серию рамок
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			const records = await listRunningGenerations(session.user.id);
			return Response.json(await Promise.all(records.map(generationJson)));
		},
	},

	"/api/generations/:id": {
		// статус одной генерации: им опрашивается идущий процесс
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			const { id } = (req as any).params;
			const record = await getGeneration(session.user.id, id);
			if (!record) {
				return Response.json({ error: "Не найдено" }, { status: 404 });
			}
			return Response.json(await generationJson(record));
		},
	},

	"/api/me": {
		GET: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ user: null, is_admin: false });
			}
			const balance = await getCredits(session.user.id);
			return Response.json({
				user: {
					id: session.user.id,
					email: session.user.email,
					name: session.user.name,
				},
				is_admin: session.user.email === process.env.ADMIN_EMAIL,
				balance,
			});
		},
	},
};
