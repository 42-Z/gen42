import {
	type AcceptedImage,
	createUltraAgent,
	runUltraAgent,
} from "../../src/lib/ultra/agent-definition";
import { UltraError } from "../../src/lib/ultra/errors";
import { toFailure } from "../../src/lib/ultra/failure";
import type { UltraReasoning } from "../../src/lib/ultra/reasoning";
import {
	checkImageStep,
	completeStep,
	drawStep,
	failStep,
	listFolderStep,
	prepareStep,
	readFileStep,
} from "./steps";

export interface UltraWorkflowInput {
	id: string;
	userId: string;
	prompt: string;
	/** Нет у прогонов, запущенных до выбора уровня: агент берёт `high` */
	reasoning?: UltraReasoning;
	/** Папка файлов, приложенных пользователем к этому запуску */
	attachmentScope?: string;
}

/**
 * Запуск «Ультра»: подготовка, цикл агента (вызовы модели и инструменты это шаги),
 * рисование отдельным шагом, запись результата. Любая ошибка запускает
 * компенсацию (`failStep`: возврат кредитов) и пробрасывается дальше, чтобы
 * прогон записался неуспешным. Код воркфлоу детерминирован: всё, что обращается к
 * внешнему миру, живёт в шагах.
 */
export async function ultraWorkflow(
	input: UltraWorkflowInput,
): Promise<{ ok: true; imageKey: string }> {
	"use workflow";
	const startedAt = Date.now();
	let accepted: AcceptedImage | null = null;
	try {
		const id = input.id;
		const attachments = {
			id,
			userId: input.userId,
			...(input.attachmentScope
				? { attachmentScope: input.attachmentScope }
				: {}),
		};
		const prepared = await prepareStep({
			...attachments,
			prompt: input.prompt,
		});
		const agent = createUltraAgent({
			system: prepared.system,
			reasoning: input.reasoning,
			generationId: id,
			executors: {
				listFolder: (args) => listFolderStep({ ...attachments, ...args }),
				readFile: (args) => readFileStep({ ...attachments, ...args }),
				checkImage: (args) => checkImageStep({ ...attachments, ...args }),
			},
		});
		// span агентского цикла здесь невозможен: flow-бандл Workflow не принимает
		// node-пакеты (braintrust тянет node:fs/path) — трассировка живёт в шагах и шаге draw
		const run = await runUltraAgent(agent, prepared.message);
		accepted = run.accepted;
		if (!accepted) {
			throw new UltraError(
				"agent_no_generation",
				"Агент завершил работу, не вызвав generateImage",
			);
		}

		const drawn = await drawStep({
			id,
			userId: input.userId,
			...(input.attachmentScope
				? { attachmentScope: input.attachmentScope }
				: {}),
			prompt: accepted.prompt,
			images: accepted.images,
		});
		if (!drawn.ok) {
			throw new UltraError(drawn.failure.code, drawn.failure.message, {
				details: {
					prompt: drawn.failure.prompt ?? accepted.prompt,
					inputImages: drawn.failure.inputImages,
				},
			});
		}

		await completeStep({
			id: input.id,
			userId: input.userId,
			...(input.attachmentScope
				? { attachmentScope: input.attachmentScope }
				: {}),
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
			userId: input.userId,
			...(input.attachmentScope
				? { attachmentScope: input.attachmentScope }
				: {}),
			failure: toFailure(error, {
				prompt: accepted?.prompt ?? null,
				inputImages: accepted?.images ?? [],
			}),
			durationMs: Date.now() - startedAt,
		});
		throw error;
	}
}
