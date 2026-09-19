import { auth } from "../lib/auth";
import {
	deductCredits,
	getCredits,
	InsufficientCreditsError,
	refundCredits,
} from "../lib/credits";
import { sql } from "../lib/db";
import { enhancePrompt } from "../lib/enhance";
import { describeGenerationError } from "../lib/generation-error";
import {
	generateImage,
	getZeroGPUQuota,
	KeyExhaustedError,
	QueueTimeoutError,
} from "../lib/hf";
import { imageExtension, normalizeContentType } from "../lib/image-format";
import {
	AllKeysExhaustedError,
	getAvailableKey,
	updateKeyQuota,
} from "../lib/keys";
import {
	getImageModel,
	IDEOGRAM_MODE,
	IDEOGRAM_STEPS,
	publicImageModels,
	resolveImageEngine,
} from "../lib/models";
import { checkRateLimit } from "../lib/rate-limit";
import { getImageUrl, uploadImage } from "../lib/storage";

const MAX_ATTEMPTS = 5;

/**
 * Неуспешная попытка тоже попадает в историю: исходный промпт, что успели
 * получить от LLM и причина. Кредиты возвращены, поэтому cost = 0.
 * Ошибка записи не должна подменять ответ пользователю.
 */
async function recordFailedGeneration(params: {
	userId: string;
	prompt: string;
	negativePrompt?: string;
	engine: string;
	model?: string;
	width?: number;
	height?: number;
	steps?: number;
	seed?: number;
	enhanced: Awaited<ReturnType<typeof enhancePrompt>> | null;
	apiKeyId: string | null;
	durationMs: number;
	error: unknown;
}): Promise<void> {
	const { enhanced } = params;
	const isIdeogram = params.engine === "ideogram";
	try {
		await sql`
      INSERT INTO generations
        (id, user_id, prompt, enhanced_prompt, negative_prompt, model, width,
         height, steps, seed, status, error_message, duration_ms, api_key_id,
         llm_key_id, llm_model, llm_tokens, enhance_ms, style_version, engine,
         cost)
      VALUES
        (${crypto.randomUUID()}, ${params.userId}, ${params.prompt},
         ${enhanced?.prompt ?? null}, ${params.negativePrompt || null},
         ${isIdeogram ? IDEOGRAM_MODE : params.model || "Turbo"},
         ${params.width || 1024}, ${params.height || 1024},
         ${isIdeogram ? IDEOGRAM_STEPS : params.steps || 8},
         ${Number.isInteger(params.seed) ? (params.seed as number) : null},
         'failed',
         ${describeGenerationError(params.error)}, ${params.durationMs},
         ${params.apiKeyId}, ${enhanced?.keyId ?? null},
         ${enhanced?.model ?? null},
         ${(enhanced?.inputTokens ?? 0) + (enhanced?.outputTokens ?? 0) || null},
         ${enhanced?.durationMs ?? null}, ${enhanced?.styleVersion ?? null},
         ${params.engine}, 0)
    `;
	} catch (err) {
		console.error("Не удалось записать неуспешную генерацию:", err);
	}
}

export const generateRoutes = {
	"/api/models": {
		// публичный каталог движков: без секретов, можно кэшировать
		GET: () =>
			Response.json(publicImageModels(), {
				headers: { "Cache-Control": "public, max-age=300" },
			}),
	},

	"/api/generate": {
		POST: async (req: Request) => {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			if (!checkRateLimit(session.user.id, 10, 60_000)) {
				return Response.json(
					{ error: "Слишком много запросов, подождите минуту" },
					{ status: 429 },
				);
			}

			const body = await req.json();
			const { prompt, negativePrompt, model, width, height, steps, seed } =
				body;
			const engine = resolveImageEngine(body.engine);
			const { cost } = getImageModel(engine);

			if (!prompt || prompt.length > 1000) {
				return Response.json({ error: "Некорректный промпт" }, { status: 400 });
			}

			let creditSpent = false;
			let currentKey: Awaited<ReturnType<typeof getAvailableKey>> | null = null;
			let enhanced: Awaited<ReturnType<typeof enhancePrompt>> | null = null;
			const requestStart = Date.now();

			try {
				await deductCredits(session.user.id, cost);
				creditSpent = true;

				enhanced = await enhancePrompt(prompt);
				if (enhanced.fallback) {
					console.warn(
						`Обогащение промпта упало в fallback: ${enhanced.error ?? "unknown"}`,
					);
				}

				const startTime = Date.now();
				const triedKeyIds = new Set<string>();
				let result: Awaited<ReturnType<typeof generateImage>> | null = null;

				for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
					try {
						currentKey = await getAvailableKey("huggingface", {
							excludeIds: [...triedKeyIds],
						});
						triedKeyIds.add(currentKey.id);
						result = await generateImage(
							{
								engine,
								prompt: enhanced.prompt,
								negativePrompt,
								model,
								width,
								height,
								steps,
								seed,
							},
							currentKey.key,
						);
						break;
					} catch (err) {
						if (err instanceof QueueTimeoutError && currentKey) {
							console.warn(
								`Ключ ${currentKey.name}: очередь ZeroGPU, повторяю`,
							);
							const quota = await getZeroGPUQuota(currentKey.key);
							if (quota) {
								await updateKeyQuota(currentKey.id, quota, {
									lastError: err.message,
								});
							}
							// таймаут очереди — транзиентный: тот же ключ можно взять снова,
							// если после списания секунд у него ещё есть квота
							triedKeyIds.delete(currentKey.id);
							continue;
						}
						if (err instanceof KeyExhaustedError && currentKey) {
							console.warn(
								`Ключ ${currentKey.name} исчерпан (${err.status}), переключаюсь`,
							);
							const quota = await getZeroGPUQuota(currentKey.key);
							if (quota) {
								await updateKeyQuota(currentKey.id, quota, {
									lastError: err.message,
								});
							}
							currentKey = null;
							continue;
						}
						throw err;
					}
				}

				if (!result) {
					throw new AllKeysExhaustedError();
				}

				const duration = Date.now() - startTime;

				const imageResponse = await fetch(result.imageUrl);
				if (!imageResponse.ok) {
					throw new Error(
						`Не удалось скачать изображение: ${imageResponse.status}`,
					);
				}
				const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
				const contentType = normalizeContentType(
					imageResponse.headers.get("content-type"),
				);
				const imageKey = `generations/${session.user.id}/${Date.now()}.${imageExtension(contentType)}`;
				await uploadImage(imageKey, imageBuffer, contentType);

				const generationId = crypto.randomUUID();
				const storedModel =
					engine === "ideogram" ? IDEOGRAM_MODE : model || "Turbo";
				const storedSteps = engine === "ideogram" ? IDEOGRAM_STEPS : steps || 8;
				await sql`
          INSERT INTO generations
            (id, user_id, prompt, enhanced_prompt, negative_prompt, model, width,
             height, steps, seed, image_key, status, duration_ms, api_key_id,
             llm_key_id, llm_model, llm_tokens, enhance_ms, style_version,
             engine, cost)
          VALUES
            (${generationId}, ${session.user.id}, ${prompt}, ${enhanced.prompt},
             ${negativePrompt || null}, ${storedModel}, ${width || 1024},
             ${height || 1024}, ${storedSteps}, ${result.seed}, ${imageKey},
             'completed', ${duration}, ${currentKey!.id}, ${enhanced.keyId},
             ${enhanced.model},
             ${(enhanced.inputTokens ?? 0) + (enhanced.outputTokens ?? 0) || null},
             ${enhanced.durationMs}, ${enhanced.styleVersion},
             ${engine}, ${cost})
        `;
				const quota = await getZeroGPUQuota(currentKey!.key);
				if (quota) {
					await updateKeyQuota(currentKey!.id, quota);
				}

				const presignedUrl = await getImageUrl(imageKey);

				return Response.json({
					id: generationId,
					image_url: presignedUrl,
					seed: result.seed,
					duration,
					engine,
					cost,
				});
			} catch (error: any) {
				if (creditSpent) {
					await refundCredits(session.user.id, cost);
				}
				await recordFailedGeneration({
					userId: session.user.id,
					prompt,
					negativePrompt,
					engine,
					model,
					width,
					height,
					steps,
					seed,
					enhanced,
					apiKeyId: currentKey?.id ?? null,
					durationMs: Date.now() - requestStart,
					error,
				});
				if (currentKey) {
					const quota = await getZeroGPUQuota(currentKey.key);
					if (quota) {
						await updateKeyQuota(currentKey.id, quota);
					}
				}

				if (error instanceof InsufficientCreditsError) {
					return Response.json(
						{ error: "Недостаточно кредитов" },
						{ status: 402 },
					);
				}
				if (error instanceof AllKeysExhaustedError) {
					return Response.json(
						{ error: "Все ключи исчерпаны, попробуйте позже" },
						{ status: 503 },
					);
				}
				console.error("Generation error:", error);
				return Response.json(
					{ error: "Internal server error" },
					{ status: 500 },
				);
			}
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
				})),
			);

			return Response.json(withUrls);
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
