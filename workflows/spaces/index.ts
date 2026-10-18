import type { EnhanceResult } from "../../src/lib/enhance";
import { runWithRotation } from "../../src/lib/spaces/attempts";
import {
	SPACE_MAX_ATTEMPTS,
	SPACE_RUN_DEADLINE_MS,
} from "../../src/lib/spaces/constants";
import { toSpaceFailure } from "../../src/lib/spaces/run-error";
import type { SpaceRunInput } from "../../src/lib/spaces/types";
import { completeStep, enhanceStep, failStep, generateStep } from "./steps";

/**
 * Запуск Krea 2 / Ideogram 4: обогащение промпта, попытки Space с ротацией ключей HF
 * (каждая попытка шаг), запись результата. Любая ошибка запускает компенсацию
 * (`failStep`: возврат кредитов) и пробрасывается дальше, чтобы прогон записался
 * неуспешным. Код воркфлоу детерминирован: всё, что обращается к внешнему миру,
 * живёт в шагах.
 */
export async function spaceImageWorkflow(
	input: SpaceRunInput,
): Promise<{ ok: true; imageKey: string }> {
	"use workflow";
	const startedAt = Date.now();
	let enhanced: EnhanceResult | null = null;
	try {
		enhanced = await enhanceStep({
			id: input.id,
			engine: input.engine,
			prompt: input.prompt,
		});
		const prompt = enhanced.prompt;
		const generateStartedAt = Date.now();
		const drawn = await runWithRotation(
			(excludeKeyIds) =>
				generateStep({
					generationId: input.id,
					userId: input.userId,
					engine: input.engine,
					prompt,
					negativePrompt: input.negativePrompt,
					model: input.model,
					width: input.width,
					height: input.height,
					steps: input.steps,
					seed: input.seed,
					excludeKeyIds,
				}),
			{
				startedAt,
				now: () => Date.now(),
				maxAttempts: SPACE_MAX_ATTEMPTS,
				deadlineMs: SPACE_RUN_DEADLINE_MS,
			},
		);
		await completeStep({
			id: input.id,
			imageKey: drawn.imageKey,
			seed: drawn.seed,
			width: input.width,
			height: input.height,
			apiKeyId: drawn.apiKeyId,
			durationMs: Date.now() - generateStartedAt,
			enhanced,
		});
		return { ok: true, imageKey: drawn.imageKey };
	} catch (error) {
		await failStep({
			id: input.id,
			failure: toSpaceFailure(error),
			seed: Number.isInteger(input.seed) ? (input.seed as number) : null,
			durationMs: Date.now() - startedAt,
			enhanced,
		});
		throw error;
	}
}
