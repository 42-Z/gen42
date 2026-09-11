import { auth } from "../lib/auth";
import { sql } from "../lib/db";
import {
  getAvailableKey,
  deactivateKey,
  incrementKeyUsage,
  AllKeysExhaustedError,
} from "../lib/keys";
import { deductCredit, refundCredit, InsufficientCreditsError } from "../lib/credits";
import { generateImage, KeyExhaustedError } from "../lib/hf";
import { uploadImage, getImageUrl } from "../lib/storage";
import { checkRateLimit } from "../lib/rate-limit";

const MAX_ATTEMPTS = 5;

export const generateRoutes = {
  "/api/generate": {
    POST: async (req: Request) => {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (!checkRateLimit(session.user.id, 10, 60_000)) {
        return Response.json({ error: "Слишком много запросов, подождите минуту" }, { status: 429 });
      }

      const body = await req.json();
      const { prompt, negativePrompt, model, width, height, steps, seed } = body;

      if (!prompt || prompt.length > 1000) {
        return Response.json({ error: "Некорректный промпт" }, { status: 400 });
      }

      let creditSpent = false;
      let currentKey: Awaited<ReturnType<typeof getAvailableKey>> | null = null;

      try {
        await deductCredit(session.user.id);
        creditSpent = true;

        const startTime = Date.now();
        let result: Awaited<ReturnType<typeof generateImage>> | null = null;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            currentKey = await getAvailableKey();
            result = await generateImage(
              { prompt, negativePrompt, model, width, height, steps, seed },
              currentKey.key,
            );
            break;
          } catch (err) {
            if (err instanceof KeyExhaustedError && currentKey) {
              console.warn(`Ключ ${currentKey.name} исчерпан (${err.status}), переключаюсь`);
              await deactivateKey(currentKey.id);
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
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const imageKey = `generations/${session.user.id}/${Date.now()}.png`;
        await uploadImage(imageKey, imageBuffer, "image/png");

        const generationId = crypto.randomUUID();
        await sql`
          INSERT INTO generations
            (id, user_id, prompt, negative_prompt, model, width, height, steps,
             seed, image_key, status, duration_ms, api_key_id)
          VALUES
            (${generationId}, ${session.user.id}, ${prompt}, ${negativePrompt || null},
             ${model || "Turbo"}, ${width || 1024}, ${height || 1024}, ${steps || 8},
             ${result.seed}, ${imageKey}, 'completed', ${duration}, ${currentKey!.id})
        `;
        await incrementKeyUsage(currentKey!.id);

        const presignedUrl = await getImageUrl(imageKey);

        return Response.json({
          id: generationId,
          image_url: presignedUrl,
          seed: result.seed,
          duration,
        });
      } catch (error: any) {
        if (creditSpent) {
          await refundCredit(session.user.id);
        }
        if (currentKey) {
          await incrementKeyUsage(currentKey.id);
        }

        if (error instanceof InsufficientCreditsError) {
          return Response.json({ error: "Недостаточно кредитов" }, { status: 402 });
        }
        if (error instanceof AllKeysExhaustedError) {
          return Response.json(
            { error: "Все ключи исчерпаны, попробуйте позже" },
            { status: 503 },
          );
        }        console.error("Generation error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
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
      return Response.json({
        user: { id: session.user.id, email: session.user.email, name: session.user.name },
        is_admin: session.user.email === process.env.ADMIN_EMAIL,
      });
    },
  },
};
