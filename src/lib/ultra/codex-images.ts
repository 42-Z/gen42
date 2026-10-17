import { CHATGPT_CODEX_BASE_URL } from "openai-oauth-ai-provider/core";

/** Модель, качество и размер Codex считает рекомендацией: окончательно решает сервер */
export const CODEX_IMAGE_MODEL = "gpt-image-2";
export const CODEX_IMAGE_QUALITY = "medium";
export const CODEX_IMAGE_SIZE = "1024x1024";

export interface CodexImageInput {
	mediaType: string;
	bytes: Uint8Array;
}

export interface EditImageParams {
	/** fetch с подставленным входом подписки (`createAuthenticatedFetch`) */
	fetch: typeof globalThis.fetch;
	prompt: string;
	/** Входные изображения; Image 1…N в промпте — порядок этого массива */
	images: CodexImageInput[];
	signal?: AbortSignal;
}

export interface EditImageResult {
	png: Uint8Array;
	/** Фактические параметры, которые выбрал сервер */
	size: string | null;
	quality: string | null;
}

export class CodexImageError extends Error {
	constructor(
		message: string,
		public readonly status: number | null,
	) {
		super(message);
		this.name = "CodexImageError";
	}
}

const MAX_ERROR_BODY = 500;

function toDataUrl(image: CodexImageInput): string {
	return `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`;
}

interface ImageResponseBody {
	data?: { b64_json?: unknown }[];
	size?: unknown;
	quality?: unknown;
}

/**
 * Рисует картинку через Codex Images. Без входных изображений — `/images/generations`,
 * с ними — `/images/edits` (изображения уходят inline как data URL).
 */
export async function editImage(
	params: EditImageParams,
): Promise<EditImageResult> {
	const { images, prompt } = params;
	const base = {
		prompt,
		model: CODEX_IMAGE_MODEL,
		n: 1,
		quality: CODEX_IMAGE_QUALITY,
		size: CODEX_IMAGE_SIZE,
	};
	const path = images.length > 0 ? "images/edits" : "images/generations";
	const body =
		images.length > 0
			? {
					...base,
					images: images.map((image) => ({ image_url: toDataUrl(image) })),
				}
			: base;

	let response: Response;
	try {
		response = await params.fetch(`${CHATGPT_CODEX_BASE_URL}/${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(body),
			...(params.signal ? { signal: params.signal } : {}),
		});
	} catch (error) {
		if (params.signal?.aborted) throw error;
		throw new CodexImageError(
			`Не удалось обратиться к Codex Images: ${error instanceof Error ? error.message : String(error)}`,
			null,
		);
	}

	if (!response.ok) {
		const text = (await response.text().catch(() => "")).slice(
			0,
			MAX_ERROR_BODY,
		);
		throw new CodexImageError(
			`Codex Images ответил ${response.status}: ${text}`,
			response.status,
		);
	}

	let json: ImageResponseBody;
	try {
		json = (await response.json()) as ImageResponseBody;
	} catch (error) {
		// срок рисования вышел, пока читалось тело: это отмена, а не плохой ответ
		if (params.signal?.aborted) throw error;
		throw new CodexImageError("Codex Images вернул не JSON", response.status);
	}
	const b64 = json.data?.[0]?.b64_json;
	if (typeof b64 !== "string" || b64.length === 0) {
		throw new CodexImageError(
			"Codex Images не вернул изображение",
			response.status,
		);
	}
	return {
		png: new Uint8Array(Buffer.from(b64, "base64")),
		size: typeof json.size === "string" ? json.size : null,
		quality: typeof json.quality === "string" ? json.quality : null,
	};
}
