export interface UploadedAttachment {
	name: string;
	kind: "image" | "text";
}

interface SignResponse {
	key: string;
	name: string;
	url: string;
}

const FALLBACK_ERROR = "Не удалось загрузить вложение";

async function errorMessage(res: Response): Promise<string> {
	const data = await res.json().catch(() => null);
	return data?.error || FALLBACK_ERROR;
}

async function request(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch {
		throw new Error(FALLBACK_ERROR);
	}
}

/**
 * Браузерная загрузка: подпись → PUT в S3 → проверка сервером. Тело уходит
 * массивом байт, чтобы браузер не добавлял Content-Type, которого нет в подписи.
 */
export async function uploadAttachment(
	file: File,
	scope: string,
): Promise<UploadedAttachment> {
	const signRes = await request("/api/attachments/sign", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ scope, name: file.name, size: file.size }),
	});
	if (!signRes.ok) throw new Error(await errorMessage(signRes));
	const sign = (await signRes.json()) as SignResponse;

	const put = await request(sign.url, {
		method: "PUT",
		body: await file.arrayBuffer(),
	});
	if (!put.ok) throw new Error(FALLBACK_ERROR);

	const doneRes = await request("/api/attachments/complete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ scope, key: sign.key }),
	});
	if (!doneRes.ok) throw new Error(await errorMessage(doneRes));
	const done = (await doneRes.json()) as {
		ok: true;
		file: UploadedAttachment;
	};
	return done.file;
}
