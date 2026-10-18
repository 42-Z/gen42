import { IDEOGRAM_MODE, IDEOGRAM_STEPS, type SpaceEngine } from "../models";

/** Нормализованное тело `POST /api/generate` для Krea 2 / Ideogram 4 */
export interface SpaceRequest {
	id?: string;
	engine: SpaceEngine;
	prompt: string;
	negativePrompt?: string;
	model: "Turbo" | "Raw";
	width: number;
	height: number;
	steps: number;
	seed: number | null;
	/** Что пишется в `generations.model` и `steps` (у Ideogram — пресет) */
	recordModel: string;
	recordSteps: number;
}

function positiveNumber(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: fallback;
}

export function parseSpaceRequest(
	body: Record<string, unknown>,
	engine: SpaceEngine,
): SpaceRequest {
	const model = body.model === "Raw" ? "Raw" : "Turbo";
	const steps = positiveNumber(body.steps, 8);
	const isIdeogram = engine === "ideogram";
	return {
		...(typeof body.id === "string" ? { id: body.id } : {}),
		engine,
		prompt: String(body.prompt),
		...(typeof body.negativePrompt === "string"
			? { negativePrompt: body.negativePrompt }
			: {}),
		model,
		width: positiveNumber(body.width, 1024),
		height: positiveNumber(body.height, 1024),
		steps,
		seed: Number.isInteger(body.seed) ? (body.seed as number) : null,
		recordModel: isIdeogram ? IDEOGRAM_MODE : model,
		recordSteps: isIdeogram ? IDEOGRAM_STEPS : steps,
	};
}
