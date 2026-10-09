import { start } from "workflow/api";
import { turboWorkflow } from "../../../workflows/turbo/index";
import {
	chargeGeneration,
	failGeneration,
	startGeneration,
} from "../generations";
import { CODEX_IMAGE_MODEL } from "./codex-images";
import { TURBO_AGENT_MODEL } from "./constants";
import type { StartTurboDeps } from "./start";

/** Боевые зависимости запуска Турбо; импортируются только публичным сервером */
export const startTurboDeps: StartTurboDeps = {
	startRecord: (record) =>
		startGeneration({
			...(record.id ? { id: record.id } : {}),
			userId: record.userId,
			prompt: record.prompt,
			engine: "turbo",
			model: CODEX_IMAGE_MODEL,
			width: 1024,
			height: 1024,
			steps: 0,
		}),

	chargeCredits: (params) => chargeGeneration(params),

	startWorkflow: async (input) => {
		await start(turboWorkflow, [input]);
	},

	failRecord: async (params) => {
		await failGeneration({
			id: params.id,
			error: params.error,
			durationMs: params.durationMs,
			llmModel: TURBO_AGENT_MODEL,
		});
	},

	now: Date.now,
};
