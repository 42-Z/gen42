import { auth } from "../lib/auth";
import { addCredits } from "../lib/credits";
import { sql } from "../lib/db";
import { getZeroGPUQuota } from "../lib/hf";
import {
	hasConfirmedQuota,
	isKeyQuotaStale,
	isValidKeyForProvider,
	keyPrefixFor,
	updateKeyQuota,
} from "../lib/keys";
import { callPoolside } from "../lib/poolside";

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
		GET: (req: Request) =>
			adminResponse(async () => {
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
		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);

				const { user_id, amount } = await req.json();
				if (!user_id || typeof amount !== "number" || amount === 0) {
					return Response.json(
						{ error: "Invalid parameters" },
						{ status: 400 },
					);
				}

				const balance = await addCredits(user_id, amount);
				return Response.json({ success: true, balance });
			}),
	},

	"/api/admin/keys": {
		GET: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);

				const url = new URL(req.url);
				const provider = url.searchParams.get("provider") ?? "huggingface";
				if (provider !== "huggingface" && provider !== "poolside") {
					return Response.json(
						{ error: "Неизвестный провайдер" },
						{ status: 400 },
					);
				}

				const keys = await sql`
        SELECT id, name, key, provider, is_active, hf_base, hf_current, hf_resets_at,
               hf_checked_at, hf_runs_remaining, hf_runs_limit, hf_runs_resets_at,
               rl_limit, rl_remaining, rl_checked_at, requests_total,
               tokens_total, last_error, created_at
        FROM api_keys
        WHERE provider = ${provider}
        ORDER BY created_at DESC
      `;

				if (provider === "huggingface") {
					const stale = keys.filter((k: any) => isKeyQuotaStale(k));
					await Promise.all(
						stale.map(async (k: any) => {
							try {
								const quota = await getZeroGPUQuota(k.key);
								if (quota) {
									await updateKeyQuota(k.id, quota);
									Object.assign(k, {
										hf_base: quota.base,
										hf_current: quota.current,
										hf_resets_at: quota.resetsAt,
										hf_runs_remaining: quota.runs?.remaining ?? null,
										hf_runs_limit: quota.runs?.limit ?? null,
										hf_runs_resets_at: quota.runs?.resetsAt ?? null,
										hf_checked_at: new Date(),
									});
								}
							} catch (e) {
								console.error(`Auto-refresh quota failed for ${k.name}:`, e);
							}
						}),
					);
				}

				return Response.json(
					keys.map((k: any) => ({ ...k, key: `${k.key.slice(0, 8)}…` })),
				);
			}),

		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);

				const { name, key, provider = "huggingface" } = await req.json();
				if (!name || !isValidKeyForProvider(provider, key ?? "")) {
					const prefix = keyPrefixFor(provider);
					return Response.json(
						{
							error: prefix
								? `Нужны name и корректный ${prefix}-ключ`
								: "Неизвестный провайдер",
						},
						{ status: 400 },
					);
				}

				try {
					const [newKey] = await sql`
          INSERT INTO api_keys (id, name, key, provider)
          VALUES (${crypto.randomUUID()}, ${name}, ${key}, ${provider})
          RETURNING id, name, provider, is_active, hf_base, hf_current, hf_resets_at,
                    hf_checked_at, hf_runs_remaining, hf_runs_limit, hf_runs_resets_at,
                    rl_limit, rl_remaining, requests_total, tokens_total,
                    created_at
        `;
					return Response.json(newKey);
				} catch (e: any) {
					if (e?.code === "ERR_POSTGRES_CONSTRAINT") {
						return Response.json(
							{ error: "Ключ уже добавлен" },
							{ status: 409 },
						);
					}
					throw e;
				}
			}),
	},

	"/api/admin/keys/:id": {
		DELETE: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);

				const { id } = (req as any).params;
				await sql`DELETE FROM api_keys WHERE id = ${id}`;
				return Response.json({ success: true });
			}),

		POST: (req: Request) =>
			adminResponse(async () => {
				await checkAdmin(req);

				const { id } = (req as any).params;
				const keys = await sql`
          SELECT key, provider FROM api_keys WHERE id = ${id}
        `;
				if (keys.length === 0) {
					return Response.json({ error: "Ключ не найден" }, { status: 404 });
				}

				if (keys[0]!.provider === "poolside") {
					try {
						const result = await callPoolside({
							system: "ping",
							user: "ping",
							apiKey: keys[0]!.key,
							timeoutMs: 15_000,
							maxOutputTokens: 8,
						});
						await sql`
              UPDATE api_keys
              SET is_active = TRUE,
                  last_error = NULL,
                  rl_limit = ${result.rateLimit.limit},
                  rl_remaining = ${result.rateLimit.remaining},
                  rl_checked_at = NOW()
              WHERE id = ${id}
            `;
						return Response.json({ success: true, provider: "poolside" });
					} catch (e) {
						const message =
							e instanceof Error ? e.message : "Не удалось проверить ключ";
						return Response.json({ error: message }, { status: 502 });
					}
				}

				const quota = await getZeroGPUQuota(keys[0]!.key);
				if (!quota) {
					return Response.json(
						{ error: "Не удалось получить квоту с HF" },
						{ status: 502 },
					);
				}

				await updateKeyQuota(id, quota);

				const runs = quota.runs;
				if (
					!hasConfirmedQuota({
						current: quota.current,
						runsRemaining: runs?.remaining ?? null,
					})
				) {
					const details = [
						runs?.limit != null && runs?.remaining != null
							? `прогоны ${runs.limit - runs.remaining}/${runs.limit}`
							: null,
						quota.base != null && quota.current != null
							? `секунды ${Math.round(quota.current)}/${quota.base}`
							: null,
					]
						.filter(Boolean)
						.join(", ");
					return Response.json(
						{
							error: `Квота ZeroGPU исчерпана (${details}), ключ включится только после сброса`,
						},
						{ status: 409 },
					);
				}

				await sql`
          UPDATE api_keys
          SET is_active = TRUE, last_error = NULL
          WHERE id = ${id}
        `;
				return Response.json({ success: true, quota });
			}),
	},

	"/api/admin/stats": {
		GET: (req: Request) =>
			adminResponse(async () => {
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
					totalGenerations: Number(totals!.total_generations),
					todayGenerations: Number(totals!.today_generations),
					avgDurationMs: Number(totals!.avg_duration_ms),
					topUsers,
					keyUsage,
				});
			}),
	},
};
