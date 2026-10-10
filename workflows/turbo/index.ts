import {
	type AcceptedImage,
	createTurboAgent,
	runTurboAgent,
} from "../../src/lib/turbo/agent-definition";
import { TurboError } from "../../src/lib/turbo/errors";
import { toFailure } from "../../src/lib/turbo/failure";
import type { TurboReasoning } from "../../src/lib/turbo/reasoning";
import {
	checkImageStep,
	completeStep,
	drawStep,
	failStep,
	listFolderStep,
	prepareStep,
	readFileStep,
} from "./steps";

export interface TurboWorkflowInput {
	id: string;
	userId: string;
	prompt: string;
	/** Нет у прогонов, запущенных до выбора уровня: агент берёт `high` */
	reasoning?: TurboReasoning;
}

/**
 * Запуск Турбо: подготовка, цикл агента (вызовы модели и инструменты это шаги),
 * рисование отдельным шагом, запись результата. Любая ошибка запускает
 * компенсацию (`failStep`: возврат кредитов) и пробрасывается дальше, чтобы
 * прогон записался неуспешным. Код воркфлоу детерминирован: всё, что обращается к
 * внешнему миру, живёт в шагах.
 */
export async function turboWorkflow(
	input: TurboWorkflowInput,
): Promise<{ ok: true; imageKey: string }> {
	"use workflow";
	const startedAt = Date.now();
	let accepted: AcceptedImage | null = null;
	try {
		const prepared = await prepareStep({ prompt: input.prompt });
		const agent = createTurboAgent({
			system: prepared.system,
			reasoning: input.reasoning,
			executors: {
				listFolder: listFolderStep,
				readFile: readFileStep,
				checkImage: checkImageStep,
			},
		});
		const run = await runTurboAgent(agent, prepared.message);
		accepted = run.accepted;
		if (!accepted) {
			throw new TurboError(
				"agent_no_generation",
				"Агент завершил работу, не вызвав generateImage",
			);
		}

		const drawn = await drawStep({
			userId: input.userId,
			prompt: accepted.prompt,
			images: accepted.images,
		});
		if (!drawn.ok) {
			throw new TurboError(drawn.failure.code, drawn.failure.message, {
				details: {
					prompt: drawn.failure.prompt ?? accepted.prompt,
					inputImages: drawn.failure.inputImages,
				},
			});
		}

		await completeStep({
			id: input.id,
			enhancedPrompt: drawn.prompt,
			imageKey: drawn.key,
			size: drawn.size,
			inputImages: drawn.inputImages,
			tokens: run.tokens,
			durationMs: Date.now() - startedAt,
			systemVersion: prepared.systemVersion,
		});
		return { ok: true, imageKey: drawn.key };
	} catch (error) {
		await failStep({
			id: input.id,
			failure: toFailure(error, {
				prompt: accepted?.prompt ?? null,
				inputImages: accepted?.images ?? [],
			}),
			durationMs: Date.now() - startedAt,
		});
		throw error;
	}
}
