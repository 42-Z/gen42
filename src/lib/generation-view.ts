import { IMAGE_ENGINE_LABELS, type ImageEngine } from "./models";
import type { UltraPhase } from "./ultra/phase";
import type { UltraReasoning } from "./ultra/reasoning";

/** Общие сведения для истории, свежего результата и восстановленной серии. */
export interface GenerationInfo {
	engine?: string;
	model?: string;
	width?: number;
	height?: number;
	steps?: number;
	reasoning?: UltraReasoning | null;
	/** Стадия идущего прогона «Ультры» и время её смены (ISO) */
	phase?: UltraPhase | null;
	phase_at?: string | null;
	duration?: number | null;
	preview_url?: string | null;
	thumb_url?: string | null;
}

export interface GenerationView extends GenerationInfo {
	id: string;
	prompt: string;
	image_url: string;
	seed: number | null;
	status: "running" | "completed" | "failed";
	error: string | null;
	created_at: string;
	cost: number;
}

export const ULTRA_REASONING_LABELS: Record<UltraReasoning, string> = {
	medium: "Среднее",
	high: "Высокое",
	xhigh: "Очень высокое",
	max: "Максимальное",
};

export function generationEngineName(info: GenerationInfo): string | undefined {
	const engine = info.engine === "turbo" ? "ultra" : info.engine;
	return engine
		? (IMAGE_ENGINE_LABELS[engine as ImageEngine] ?? engine)
		: undefined;
}

export function generationModeName(info: GenerationInfo): string | undefined {
	const engine = info.engine === "turbo" ? "ultra" : info.engine;
	if (!engine) return undefined;
	return engine === "ultra" ? "Ультра" : "Изображение";
}

export function generationModelName(info: GenerationInfo): string | undefined {
	return info.model;
}

export function formatDuration(ms: number | null | undefined): string | null {
	if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
	const seconds = Math.round(ms / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
