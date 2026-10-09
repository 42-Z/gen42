import { buildTurboSystem } from "../../src/lib/prompts/turbo.system";
import { buildAgentMessage, systemVersionOf } from "../../src/lib/turbo/agent";
import {
	TURBO_AGENT_MODEL,
	TURBO_DRAW_TIMEOUT_MS,
} from "../../src/lib/turbo/constants";
import { TurboError } from "../../src/lib/turbo/errors";
import { type TurboFailure, toFailure } from "../../src/lib/turbo/failure";
import type {
	ListFolderResult,
	ReadFileResult,
} from "../../src/lib/turbo/library";
import {
	checkImageArguments,
	drawImage,
	readForAgent,
} from "../../src/lib/turbo/ops";
import { parseImageSize } from "../../src/lib/turbo/size";
import type { CheckImageOutput } from "../../src/lib/turbo/tool-defs";
import { getTurboRuntime } from "../../src/lib/turbo/workflow-runtime";

/**
 * Шаги воркфлоу Турбо: тонкие обёртки над кодом из src/lib/turbo. Каждый шаг
 * выполняется в полном рантайме с отдельным лимитом функции; аргументы и
 * результаты только сериализуемые (строки, числа, простые объекты).
 */

export async function prepareStep(input: { prompt: string }): Promise<{
	system: string;
	message: string;
	systemVersion: string;
}> {
	"use step";
	const tree = await getTurboRuntime().library.describeTree();
	return {
		system: buildTurboSystem(tree),
		message: buildAgentMessage(input.prompt),
		// хеш инструкции без дерева: по нему сравниваются итерации
		systemVersion: systemVersionOf(buildTurboSystem("")),
	};
}

export async function listFolderStep(input: {
	path: string;
}): Promise<ListFolderResult> {
	"use step";
	return getTurboRuntime().library.listFolder(input.path);
}

export async function readFileStep(input: {
	path: string;
}): Promise<ReadFileResult> {
	"use step";
	return readForAgent(getTurboRuntime().library, input.path);
}

export async function checkImageStep(input: {
	prompt: string;
	images: string[];
}): Promise<CheckImageOutput> {
	"use step";
	return checkImageArguments(getTurboRuntime().library, input);
}

export type DrawStepResult =
	| {
			ok: true;
			key: string;
			size: string | null;
			prompt: string;
			inputImages: string[];
	  }
	| { ok: false; failure: TurboFailure };

/**
 * Рисование и сохранение: PNG уходит в хранилище прямо здесь, в журнал воркфлоу
 * попадает только ключ. Без повторов: у Codex Images нет ключа идемпотентности,
 * повтор потратил бы лимит подписки второй раз.
 */
export async function drawStep(input: {
	userId: string;
	prompt: string;
	images: string[];
}): Promise<DrawStepResult> {
	"use step";
	const runtime = getTurboRuntime();
	let drawn: Awaited<ReturnType<typeof drawImage>>;
	try {
		drawn = await drawImage(
			{ library: runtime.library, edit: runtime.edit },
			{
				prompt: input.prompt,
				images: input.images,
				signal: AbortSignal.timeout(TURBO_DRAW_TIMEOUT_MS),
			},
		);
	} catch (error) {
		return {
			ok: false,
			failure: toFailure(error, {
				prompt: input.prompt,
				inputImages: input.images,
			}),
		};
	}
	try {
		const key = `generations/${input.userId}/${runtime.now()}.png`;
		await runtime.storeImage(key, drawn.png);
		return {
			ok: true,
			key,
			size: drawn.size,
			prompt: drawn.prompt,
			inputImages: drawn.inputImages,
		};
	} catch (error) {
		return {
			ok: false,
			failure: toFailure(
				new TurboError(
					"agent_failed",
					`Не удалось сохранить картинку: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: error },
				),
				{ prompt: drawn.prompt, inputImages: drawn.inputImages },
			),
		};
	}
}
drawStep.maxRetries = 0;

export interface CompleteStepInput {
	id: string;
	enhancedPrompt: string;
	imageKey: string;
	size: string | null;
	inputImages: string[];
	tokens: number | null;
	durationMs: number;
	systemVersion: string;
}

export async function completeStep(input: CompleteStepInput): Promise<void> {
	"use step";
	const closed = await getTurboRuntime().completeGeneration({
		id: input.id,
		imageKey: input.imageKey,
		seed: null,
		...parseImageSize(input.size),
		enhancedPrompt: input.enhancedPrompt,
		durationMs: input.durationMs,
		llmModel: TURBO_AGENT_MODEL,
		llmTokens: input.tokens,
		enhanceMs: input.durationMs,
		styleVersion: input.systemVersion,
		inputImages: input.inputImages,
	});
	if (!closed) {
		console.error(
			`Генерация ${input.id} уже закрыта, картинка ${input.imageKey} осталась без записи`,
		);
	}
}

/**
 * Компенсация: закрывает строку и возвращает кредиты одной транзакцией по условию
 * `status = 'running'`, поэтому возврат бывает ровно один раз, даже если шаг
 * повторится.
 */
export async function failStep(input: {
	id: string;
	failure: TurboFailure;
	durationMs: number;
}): Promise<void> {
	"use step";
	const runtime = getTurboRuntime();
	const { failure } = input;
	console.error(
		`Turbo error (${TURBO_AGENT_MODEL}): ${failure.code}: ${failure.message}`,
	);
	await runtime.failGeneration({
		id: input.id,
		error: new TurboError(failure.code, failure.message),
		enhancedPrompt: failure.prompt,
		durationMs: input.durationMs,
		llmModel: TURBO_AGENT_MODEL,
		inputImages: failure.inputImages,
	});
	if (failure.code === "codex_auth_required") {
		// пометка входа мёртвым скрывает Турбо до «Проверить» или нового входа в админке
		try {
			await runtime.recordCodexError(`${failure.code}: ${failure.message}`);
		} catch (error) {
			console.error("Не удалось пометить вход Codex:", error);
		}
	}
}
