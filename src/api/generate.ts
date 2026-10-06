import { auth } from "../lib/auth";
import { getCredits, InsufficientCreditsError } from "../lib/credits";
import { sql } from "../lib/db";
import { enhancePrompt } from "../lib/enhance";
import { publicGenerationError } from "../lib/generation-error";
import {
	chargeGeneration,
	completeGeneration,
	failGeneration,
	type GenerationRecord,
	getActiveGeneration,
	getGeneration,
	startGeneration,
} from "../lib/generations";
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
import { isTurboAvailable } from "../lib/turbo/codex-auth";
import { turboDeps } from "../lib/turbo/runtime";
import { generateTurbo } from "../lib/turbo/service";

const MAX_ATTEMPTS = 5;

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
		// каталог движков без секретов; Турбо в нём только пока рабочий вход Codex
		GET: async () => {
			const turbo = await isTurboAvailable().catch(() => false);
			return Response.json(publicImageModels({ turbo }), {
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
					{ error: "Слишком много запросов, подождите минуту" },
					{ status: 429 },
				);
			}

			const body = await req.json();
			const { prompt, negativePrompt, model, width, height, steps, seed } =
				body;
			// без рабочего входа Codex «turbo» ничем не отличается от неизвестного движка
			const turboAvailable =
				body.engine === "turbo" &&
				(await isTurboAvailable().catch(() => false));
			const engine = resolveImageEngine(body.engine, turboAvailable);

			if (!prompt || prompt.length > 1000) {
				return Response.json({ error: "Некорректный промпт" }, { status: 400 });
			}

			if (engine === "turbo") {
				const outcome = await generateTurbo(
					{
						userId: session.user.id,
						prompt,
						...(typeof body.id === "string" ? { id: body.id } : {}),
					},
					turboDeps,
				);
				return Response.json(outcome.body, { status: outcome.status });
			}

			const { cost } = getImageModel(engine);
			const isIdeogram = engine === "ideogram";
			const storedModel = isIdeogram ? IDEOGRAM_MODE : model || "Turbo";
			const storedSteps = isIdeogram ? IDEOGRAM_STEPS : steps || 8;
			const storedWidth = width || 1024;
			const storedHeight = height || 1024;

			let currentKey: Awaited<ReturnType<typeof getAvailableKey>> | null = null;
			let enhanced: Awaited<ReturnType<typeof enhancePrompt>> | null = null;
			const requestStart = Date.now();

			// строка `running` появляется до списания и всей работы: обновление
			// страницы находит по ней процесс и дожидается результата
			let generationId: string;
			try {
				generationId = await startGeneration({
					...(typeof body.id === "string" ? { id: body.id } : {}),
					userId: session.user.id,
					prompt,
					negativePrompt,
					engine,
					model: storedModel,
					width: storedWidth,
					height: storedHeight,
					steps: storedSteps,
				});
			} catch (error) {
				console.error("Generation error:", error);
				return Response.json(
					{ error: "Internal server error" },
					{ status: 500 },
				);
			}

			/**
			 * Сбой тоже закрывает строку: исходный промпт, что успели получить от LLM
			 * и причина. Кредиты возвращает сама запись — одной транзакцией с
			 * закрытием. Ошибка записи не подменяет ответ пользователю.
			 */
			const recordFailure = async (error: unknown) => {
				try {
					const closed = await failGeneration({
						id: generationId,
						error,
						seed: Number.isInteger(seed) ? (seed as number) : null,
						durationMs: Date.now() - requestStart,
						enhancedPrompt: enhanced?.prompt ?? null,
						apiKeyId: currentKey?.id ?? null,
						llmKeyId: enhanced?.keyId ?? null,
						llmModel: enhanced?.model ?? null,
						llmTokens:
							(enhanced?.inputTokens ?? 0) + (enhanced?.outputTokens ?? 0) ||
							null,
						enhanceMs: enhanced?.durationMs ?? null,
						styleVersion: enhanced?.styleVersion ?? null,
					});
					if (!closed) {
						console.warn(`Генерация ${generationId} уже закрыта другим путём`);
					}
				} catch (err) {
					console.error("Не удалось записать неуспешную генерацию:", err);
				}
			};

			try {
				await chargeGeneration({
					id: generationId,
					userId: session.user.id,
					cost,
				});

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

				const closed = await completeGeneration({
					id: generationId,
					imageKey,
					seed: result.seed,
					width: storedWidth,
					height: storedHeight,
					enhancedPrompt: enhanced.prompt,
					durationMs: duration,
					apiKeyId: currentKey!.id,
					llmKeyId: enhanced.keyId,
					llmModel: enhanced.model,
					llmTokens:
						(enhanced.inputTokens ?? 0) + (enhanced.outputTokens ?? 0) || null,
					enhanceMs: enhanced.durationMs,
					styleVersion: enhanced.styleVersion,
				});
				if (!closed) {
					console.warn(
						`Генерация ${generationId} закрыта другим путём — результат не в истории`,
					);
				}
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
				await recordFailure(error);
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
