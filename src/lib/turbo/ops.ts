import { toGeneratorQuotes } from "../prompts/style-hints";
import { CodexImageError, type EditImageResult } from "./codex-images";
import { TurboError } from "./errors";
import type { Library, ReadFileResult, ResolvedImage } from "./library";
import { makePreview } from "./preview";
import type { CheckImageOutput } from "./tool-defs";

export type EditFn = (params: {
	prompt: string;
	images: ResolvedImage[];
	signal?: AbortSignal;
}) => Promise<EditImageResult>;

/** Чтение файла для агента: изображения приходят уменьшенными копиями */
export async function readForAgent(
	library: Library,
	path: string,
): Promise<ReadFileResult> {
	const result = await library.readFile(path);
	if (!result.ok || result.kind !== "image") return result;
	const preview = await makePreview(
		new Uint8Array(Buffer.from(result.base64, "base64")),
	);
	return {
		...result,
		mediaType: preview.mediaType,
		base64: Buffer.from(preview.bytes).toString("base64"),
	};
}

/** Проверка аргументов generateImage: ничего не рисует, ошибку возвращает агенту */
export async function checkImageArguments(
	library: Library,
	input: { prompt: string; images: string[] },
): Promise<CheckImageOutput> {
	if (input.prompt.trim().length === 0) {
		return { ok: false, retryable: true, error: "Пустой промпт" };
	}
	const resolved = await library.resolveImages(input.images);
	if (!resolved.ok) {
		return { ok: false, retryable: true, error: resolved.error };
	}
	return { ok: true };
}

export interface DrawnImage {
	png: Uint8Array;
	/** Размер, который выбрал сервер (например «1024x1536») */
	size: string | null;
	/** Промпт, ушедший генератору (с прямыми кавычками) */
	prompt: string;
	inputImages: string[];
}

/** Рисование по выбранным путям (оригиналы из библиотеки); сбой — TurboError с кодом */
export async function drawImage(
	deps: { library: Library; edit: EditFn },
	input: { prompt: string; images: string[]; signal?: AbortSignal },
): Promise<DrawnImage> {
	const resolved = await deps.library.resolveImages(input.images);
	if (!resolved.ok) {
		throw new TurboError("generation_rejected", resolved.error, {
			details: { prompt: input.prompt, inputImages: input.images },
		});
	}
	const inputImages = resolved.images.map((image) => image.path);
	// ёлочки и «умные» кавычки генератор рисует буквально: к нему промпт уходит с
	// прямыми кавычками, как и в обычном обогащении
	const finalPrompt = toGeneratorQuotes(input.prompt);
	try {
		const result = await deps.edit({
			prompt: finalPrompt,
			images: resolved.images,
			...(input.signal ? { signal: input.signal } : {}),
		});
		return {
			png: result.png,
			size: result.size,
			prompt: finalPrompt,
			inputImages,
		};
	} catch (error) {
		const unauthorized =
			error instanceof CodexImageError &&
			(error.status === 401 || error.status === 403);
		// сигнал оборвал запрос к Codex Images: это срок рисования, а не отказ
		// генератора (editImage пробрасывает AbortError как есть)
		const timedOut =
			Boolean(input.signal?.aborted) && !(error instanceof CodexImageError);
		throw new TurboError(
			timedOut
				? "agent_timeout"
				: unauthorized
					? "codex_auth_required"
					: "generation_rejected",
			error instanceof Error ? error.message : String(error),
			{
				cause: error,
				details: { prompt: input.prompt, inputImages },
			},
		);
	}
}
