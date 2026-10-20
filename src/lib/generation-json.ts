import { publicGenerationError } from "./generation-error";
import type { GenerationRecord } from "./generations";

/** Один публичный контракт для списка истории, опроса и восстановления серии. */
export function generationJson(
	record: GenerationRecord,
	originalUrl: string | null,
) {
	const completed = record.status === "completed" && Boolean(record.imageKey);
	const base = `/api/generations/${encodeURIComponent(record.id)}`;
	return {
		id: record.id,
		status: record.status,
		prompt: record.prompt,
		engine: record.engine,
		model: record.model,
		seed: record.seed,
		width: record.width,
		height: record.height,
		steps: record.steps,
		reasoning: record.reasoning ?? null,
		cost: record.cost,
		image_url: completed ? originalUrl : null,
		preview_url: completed ? `${base}/preview` : null,
		thumb_url: completed ? `${base}/thumb` : null,
		error:
			record.status === "failed"
				? publicGenerationError(record.errorMessage)
				: null,
		duration: record.durationMs,
		created_at: record.createdAt,
	};
}
