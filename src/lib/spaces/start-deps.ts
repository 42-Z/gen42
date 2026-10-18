import { start } from "workflow/api";
import { spaceImageWorkflow } from "../../../workflows/spaces/index";
import {
	chargeGeneration,
	failGeneration,
	startGeneration,
} from "../generations";
import type { StartRunDeps } from "../start-run";
import type { SpaceRequest } from "./request";

/** Боевые зависимости запуска Krea 2 / Ideogram 4; импортируются только публичным сервером */
export function spaceStartDeps(
	userId: string,
	request: SpaceRequest,
): StartRunDeps {
	return {
		startRecord: () =>
			startGeneration({
				...(request.id ? { id: request.id } : {}),
				userId,
				prompt: request.prompt,
				negativePrompt: request.negativePrompt,
				engine: request.engine,
				model: request.recordModel,
				width: request.width,
				height: request.height,
				steps: request.recordSteps,
			}),

		chargeCredits: (params) => chargeGeneration(params),

		startWorkflow: async (id) => {
			await start(spaceImageWorkflow, [
				{
					id,
					userId,
					engine: request.engine,
					prompt: request.prompt,
					negativePrompt: request.negativePrompt,
					model: request.model,
					width: request.width,
					height: request.height,
					steps: request.steps,
					seed: request.seed,
				},
			]);
		},

		failRecord: async (params) => {
			await failGeneration({
				id: params.id,
				error: params.error,
				durationMs: params.durationMs,
			});
		},

		now: Date.now,
	};
}
