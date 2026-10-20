interface AssetRecord {
	status: string;
	imageKey: string | null;
}

interface AssetDeps {
	userId(req: Request): Promise<string | null>;
	/** Читает запись только заданного владельца. */
	record(userId: string, id: string): Promise<AssetRecord | null>;
	load(key: string): Promise<Response | null>;
}

/** Единая проверка владельца для миниатюры, просмотра и скачивания оригинала. */
export async function generationAsset(
	req: Request,
	id: string,
	deps: AssetDeps,
): Promise<Response> {
	const error = (message: string, status: number) =>
		Response.json(
			{ error: message },
			{
				status,
				headers: { "Cache-Control": "no-store" },
			},
		);
	const userId = await deps.userId(req);
	if (!userId) return error("Unauthorized", 401);
	const record = await deps.record(userId, id);
	if (record?.status !== "completed" || !record.imageKey)
		return error("Не найдено", 404);
	const response = await deps.load(record.imageKey).catch((cause) => {
		console.error("Не удалось загрузить изображение:", cause);
		return null;
	});
	if (!response?.ok) return error("Не найдено", 404);
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "private, max-age=31536000, immutable");
	headers.set("Vary", "Cookie");
	headers.set("X-Content-Type-Options", "nosniff");
	return new Response(response.body, { headers });
}
