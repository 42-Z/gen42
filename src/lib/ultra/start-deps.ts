import { start } from "workflow/api";
import { ultraWorkflow } from "../../../workflows/ultra/index";
import {
	chargeGeneration,
	failGeneration,
	startGeneration,
} from "../generations";
import { CODEX_IMAGE_MODEL } from "./codex-images";
import { ULTRA_AGENT_MODEL } from "./constants";
import type { StartUltraDeps } from "./start";

/** Боевые зависимости запуска «Ультра»; импортируются только публичным сервером */
export const startUltraDeps: StartUltraDeps = {
	startRecord: (record) =>
		startGeneration({
			...(record.id ? { id: record.id } : {}),
			userId: record.userId,
			prompt: record.prompt,
			engine: "ultra",
			model: CODEX_IMAGE_MODEL,
			reasoning: record.reasoning,
			width: 1024,
			height: 1024,
			steps: 0,
		}),

	chargeCredits: (params) => chargeGeneration(params),

	startWorkflow: async (input) => {
		await start(ultraWorkflow, [input]);
	},

	failRecord: async (params) => {
		await failGeneration({
			id: params.id,
			error: params.error,
			durationMs: params.durationMs,
			llmModel: ULTRA_AGENT_MODEL,
		});
	},

	now: Date.now,
};
