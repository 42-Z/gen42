import { auth } from "../lib/auth";
import { sql } from "../lib/db";
import { addCredits } from "../lib/credits";
import { getZeroGPUQuota } from "../lib/hf";
import { updateKeyQuota } from "../lib/keys";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;

class AdminError extends Error {}

async function checkAdmin(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || session.user.email !== ADMIN_EMAIL) {
    throw new AdminError("Unauthorized");
  }
  return session;
}

function adminResponse<T>(fn: () => Promise<T>) {
  return fn().catch((err) => {
    if (err instanceof AdminError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Admin error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });
}

export const adminRoutes = {
  "/api/admin/users": {
    GET: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const users = await sql`
        SELECT u.id, u.email, u.name, u."createdAt" AS created_at, COALESCE(c.balance, 0) AS balance
        FROM "user" u
        LEFT JOIN credits c ON u.id = c.user_id
        ORDER BY u."createdAt" DESC
      `;
      return Response.json(users);
    }),
  },

  "/api/admin/credits": {
    POST: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const { user_id, amount } = await req.json();
      if (!user_id || typeof amount !== "number" || amount === 0) {
        return Response.json({ error: "Invalid parameters" }, { status: 400 });
      }

      const balance = await addCredits(user_id, amount);
      return Response.json({ success: true, balance });
    }),
  },

  "/api/admin/keys": {
    GET: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const keys = await sql`
        SELECT id, name, key, is_active,
               hf_base, hf_current, hf_resets_at, hf_checked_at, created_at
        FROM api_keys
        ORDER BY hf_current DESC NULLS LAST
      `;
      return Response.json(
        keys.map((k: any) => ({ ...k, key: `${k.key.slice(0, 8)}…` })),
      );
    }),

    POST: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const { name, key } = await req.json();
      if (!name || !key?.startsWith("hf_")) {
        return Response.json({ error: "Нужны name и корректный hf_-ключ" }, { status: 400 });
      }

      try {
        const [newKey] = await sql`
          INSERT INTO api_keys (id, name, key)
          VALUES (${crypto.randomUUID()}, ${name}, ${key})
          RETURNING id, name, is_active, hf_base, hf_current, hf_resets_at, hf_checked_at, created_at
        `;
        return Response.json(newKey);
      } catch (e: any) {
        if (e?.code === "ERR_POSTGRES_CONSTRAINT") {
          return Response.json({ error: "Ключ уже добавлен" }, { status: 409 });
        }
        throw e;
      }
    }),
  },

  "/api/admin/keys/:id": {
    DELETE: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const { id } = (req as any).params;
      await sql`DELETE FROM api_keys WHERE id = ${id}`;
      return Response.json({ success: true });
    }),

    POST: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const { id } = (req as any).params;
      const keys = await sql`SELECT key FROM api_keys WHERE id = ${id}`;
      if (keys.length === 0) {
        return Response.json({ error: "Ключ не найден" }, { status: 404 });
      }

      const quota = await getZeroGPUQuota(keys[0].key);
      if (!quota) {
        return Response.json({ error: "Не удалось получить квоту с HF" }, { status: 502 });
      }

      await updateKeyQuota(id, quota);
      return Response.json({ success: true, quota });
    }),
  },

  "/api/admin/stats": {
    GET: (req: Request) => adminResponse(async () => {
      await checkAdmin(req);

      const [[totals], topUsers, keyUsage] = await Promise.all([
        sql`
          SELECT
            COUNT(*) FILTER (WHERE TRUE) AS total_generations,
            COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('day', NOW())) AS today_generations,
            COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
          FROM generations
        `,
        sql`
          SELECT g.user_id, u.email, COUNT(*) AS count
          FROM generations g
          JOIN "user" u ON g.user_id = u.id
          GROUP BY g.user_id, u.email
          ORDER BY count DESC
          LIMIT 10
        `,
        sql`
          SELECT id, name, is_active, hf_base, hf_current, hf_resets_at
          FROM api_keys
          ORDER BY hf_current DESC NULLS LAST
        `,
      ]);

      return Response.json({
        totalGenerations: Number(totals.total_generations),
        todayGenerations: Number(totals.today_generations),
        avgDurationMs: Number(totals.avg_duration_ms),
        topUsers,
        keyUsage,
      });
    }),
  },
};
