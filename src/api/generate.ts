import { auth } from "../lib/auth";
import { getCredits } from "../lib/credits";
import { sql } from "../lib/db";
import { isClientId } from "../lib/generation-id";
import { generationJson as serializeGeneration } from "../lib/generation-json";
import { TOO_MANY_REQUESTS_ERROR } from "../lib/generation-limits";
import {
	type GenerationRecord,
	getActiveGeneration,
	getGeneration,
	listRunningGenerations,
} from "../lib/generations";
import { imageExtension, normalizeContentType } from "../lib/image-format";
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
import { getOrCreatePreview, getOrCreateThumb } from "../lib/thumbnails";
import { isUltraAvailable } from "../lib/ultra/codex-auth";
import { parseUltraReasoning } from "../lib/ultra/reasoning";
import { startUltra } from "../lib/ultra/start";
import { startUltraDeps } from "../lib/ultra/start-deps";
import { generationAsset } from "./generation-assets";

/** Запись истории для клиента: картинка пресайнится только для завершённых */
async function generationJson(record: GenerationRecord) {
	return serializeGeneration(
		record,
		record.status === "completed" && record.imageKey
			? await getImageUrl(record.imageKey)
			: null,
	);
}

const assetAuth = {
	userId: async (req: Request) =>
		(await auth.api.getSession({ headers: req.headers }))?.user.id ?? null,
	record: getGeneration,
};

function webpResponse(bytes: Uint8Array | null): Response | null {
	return bytes
		? new Response(new Blob([new Uint8Array(bytes)]), {
				headers: { "Content-Type": "image/webp" },
			})
		: null;
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
				// папка вложений приходит от клиента; без неё агент видит только библиотеку
				if (
					body.attachmentScope !== undefined &&
					!isClientId(body.attachmentScope)
				) {
					return Response.json(
						{ error: "Некорректная папка вложений" },
						{ status: 400 },
					);
				}
				const outcome = await startUltra(
					{
						userId: session.user.id,
						prompt,
						reasoning,
						...(typeof body.id === "string" ? { id: body.id } : {}),
						...(isClientId(body.attachmentScope)
							? { attachmentScope: body.attachmentScope }
							: {}),
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

			const rows = await sql<GenerationRecord[]>`
        SELECT id, user_id AS "userId", prompt, engine, model, seed, width, height, steps,
               reasoning, cost, image_key AS "imageKey", status, error_message AS "errorMessage",
               duration_ms AS "durationMs", created_at AS "createdAt"
        FROM generations
        WHERE user_id = ${session.user.id} AND status = 'completed'
          AND image_key IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 50
      `;

			const withUrls = await Promise.all(rows.map(generationJson));

			return Response.json(withUrls);
		},
	},

	"/api/generations/:id/thumb": {
		GET: (req: Request) =>
			generationAsset(req, (req as any).params.id, {
				...assetAuth,
				load: async (key) => webpResponse(await getOrCreateThumb(key)),
			}),
	},

	"/api/generations/:id/preview": {
		GET: (req: Request) =>
			generationAsset(req, (req as any).params.id, {
				...assetAuth,
				load: async (key) => webpResponse(await getOrCreatePreview(key)),
			}),
	},

	"/api/generations/:id/download": {
		GET: (req: Request) =>
			generationAsset(req, (req as any).params.id, {
				...assetAuth,
				load: async (key) => {
					// Свежая подпись и поток, а не копия в памяти браузера. Оригинал не перекодируется.
					const original = await fetch(await getImageUrl(key));
					if (!original.ok) return null;
					const type = normalizeContentType(
						original.headers.get("content-type"),
					);
					return new Response(original.body, {
						headers: {
							"Content-Type": type,
							"Content-Disposition": `attachment; filename="gen42-${encodeURIComponent((req as any).params.id)}.${imageExtension(type)}"`,
						},
					});
				},
			}),
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
