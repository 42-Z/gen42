import { timingSafeEqual } from "node:crypto";
import { grantDailyCredits } from "../lib/credits";

function hasValidSecret(req: Request): boolean {
	const secret = process.env.CRON_SECRET;
	if (!secret) {
		console.error("CRON_SECRET не настроен — запрос крон-роута отклонён");
		return false;
	}

	const provided = Buffer.from(req.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${secret}`);
	return (
		provided.length === expected.length && timingSafeEqual(provided, expected)
	);
}

export const cronRoutes = {
	"/api/cron/daily-credits": {
		GET: async (req: Request) => {
			if (!hasValidSecret(req)) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}

			const granted = await grantDailyCredits();
			console.log(`[cron] Ежедневные кредиты начислены: ${granted}`);
			return Response.json({ granted });
		},
	},
};
