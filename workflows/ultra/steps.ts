import { buildUltraSystem } from "../../src/lib/prompts/ultra.system";
import { buildAgentMessage, systemVersionOf } from "../../src/lib/ultra/agent";
import {
	ATTACHMENTS_FOLDER,
	attachmentsPrefix,
} from "../../src/lib/ultra/attachments";
import {
	ULTRA_AGENT_MODEL,
	ULTRA_DRAW_TIMEOUT_MS,
} from "../../src/lib/ultra/constants";
import { UltraError } from "../../src/lib/ultra/errors";
import { toFailure, type UltraFailure } from "../../src/lib/ultra/failure";
import type {
	Library,
	ListFolderResult,
	ReadFileResult,
} from "../../src/lib/ultra/library";
import {
	checkImageArguments,
	drawImage,
	readForAgent,
} from "../../src/lib/ultra/ops";
import type { UltraPhase } from "../../src/lib/ultra/phase";
import { parseImageSize } from "../../src/lib/ultra/size";
import type { CheckImageOutput } from "../../src/lib/ultra/tool-defs";
import { getUltraRuntime } from "../../src/lib/ultra/workflow-runtime";

/**
 * Шаги воркфлоу «Ультра»: тонкие обёртки над кодом из src/lib/ultra. Каждый шаг
 * выполняется в полном рантайме с отдельным лимитом функции; аргументы и
 * результаты только сериализуемые (строки, числа, простые объекты).
 */

/** Стадия для страницы; без id (eval, тесты) ничего не пишется */
function markPhase(id: string | undefined, phase: UltraPhase): Promise<void> {
	return id ? getUltraRuntime().setPhase(id, phase) : Promise.resolve();
}

/**
 * Библиотека шага: к общей добавляется папка вложений этого запуска. Пустой
 * scope значит, что пользователь ничего не прикладывал.
 */
function libraryFor(input: {
	userId?: string;
	attachmentScope?: string;
}): Library {
	const library = getUltraRuntime().library;
	return input.userId && input.attachmentScope
		? library.withAttachments(
				attachmentsPrefix(input.userId, input.attachmentScope),
				ATTACHMENTS_FOLDER,
			)
		: library;
}

function deleteAttachmentScope(input: {
	userId?: string;
	attachmentScope?: string;
}): Promise<void> {
	if (!input.userId || !input.attachmentScope) return Promise.resolve();
	return getUltraRuntime()
		.deleteAttachmentPrefix(
			attachmentsPrefix(input.userId, input.attachmentScope),
		)
		.catch((error) => {
			console.error("Не удалось удалить вложения:", error);
		});
}

export async function prepareStep(input: {
	id?: string;
	userId?: string;
	attachmentScope?: string;
	prompt: string;
}): Promise<{
	system: string;
	message: string;
	systemVersion: string;
}> {
	"use step";
	await markPhase(input.id, "prepare");
	const tree = await libraryFor(input).describeTree();
	const prepared = {
		system: buildUltraSystem(tree),
		message: buildAgentMessage(input.prompt),
		// хеш инструкции без дерева: по нему сравниваются итерации
		systemVersion: systemVersionOf(buildUltraSystem("")),
	};
	// дальше цикл агента: первый вызов модели всё равно поставит «думает»
	await markPhase(input.id, "thinking");
	return prepared;
}

export async function listFolderStep(input: {
	id?: string;
	userId?: string;
	attachmentScope?: string;
	path: string;
}): Promise<ListFolderResult> {
	"use step";
	await markPhase(input.id, "library");
	const result = await libraryFor(input).listFolder(input.path);
	await markPhase(input.id, "thinking");
	return result;
}

export async function readFileStep(input: {
	id?: string;
	userId?: string;
	attachmentScope?: string;
	path: string;
}): Promise<ReadFileResult> {
	"use step";
	await markPhase(input.id, "library");
	const result = await readForAgent(libraryFor(input), input.path);
	await markPhase(input.id, "thinking");
	return result;
}

export async function checkImageStep(input: {
	id?: string;
	userId?: string;
	attachmentScope?: string;
	prompt: string;
	images: string[];
}): Promise<CheckImageOutput> {
	"use step";
	await markPhase(input.id, "review");
	const result = await checkImageArguments(libraryFor(input), input);
	// отказ значит, что агент будет исправлять аргументы и думать дальше
	if (!result.ok) await markPhase(input.id, "thinking");
	return result;
}

export type DrawStepResult =
	| {
			ok: true;
			key: string;
			size: string | null;
			prompt: string;
			inputImages: string[];
	  }
	| { ok: false; failure: UltraFailure };

/**
 * Рисование и сохранение: PNG уходит в хранилище прямо здесь, в журнал воркфлоу
 * попадает только ключ. Без повторов: у Codex Images нет ключа идемпотентности,
 * повтор потратил бы лимит подписки второй раз.
 */
export async function drawStep(input: {
	id?: string;
	userId: string;
	attachmentScope?: string;
	prompt: string;
	images: string[];
}): Promise<DrawStepResult> {
	"use step";
	await markPhase(input.id, "draw");
	const runtime = getUltraRuntime();
	let drawn: Awaited<ReturnType<typeof drawImage>>;
	try {
		drawn = await drawImage(
			{ library: libraryFor(input), edit: runtime.edit },
			{
				prompt: input.prompt,
				images: input.images,
				signal: AbortSignal.timeout(ULTRA_DRAW_TIMEOUT_MS),
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
				new UltraError(
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
	userId?: string;
	attachmentScope?: string;
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
	try {
		const closed = await getUltraRuntime().completeGeneration({
			id: input.id,
			imageKey: input.imageKey,
			seed: null,
			...parseImageSize(input.size),
			enhancedPrompt: input.enhancedPrompt,
			durationMs: input.durationMs,
			llmModel: ULTRA_AGENT_MODEL,
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
	} finally {
		await deleteAttachmentScope(input);
	}
}

/**
 * Компенсация: закрывает строку и возвращает кредиты одной транзакцией по условию
 * `status = 'running'`, поэтому возврат бывает ровно один раз, даже если шаг
 * повторится.
 */
export async function failStep(input: {
	id: string;
	userId?: string;
	attachmentScope?: string;
	failure: UltraFailure;
	durationMs: number;
}): Promise<void> {
	"use step";
	const runtime = getUltraRuntime();
	const { failure } = input;
	try {
		console.error(
			`Ultra error (${ULTRA_AGENT_MODEL}): ${failure.code}: ${failure.message}`,
		);
		await runtime.failGeneration({
			id: input.id,
			error: new UltraError(failure.code, failure.message),
			enhancedPrompt: failure.prompt,
			durationMs: input.durationMs,
			llmModel: ULTRA_AGENT_MODEL,
			inputImages: failure.inputImages,
		});
		if (failure.code === "codex_auth_required") {
			// пометка входа мёртвым скрывает «Ультра» до «Проверить» или нового входа в админке
			try {
				await runtime.recordCodexError(`${failure.code}: ${failure.message}`);
			} catch (error) {
				console.error("Не удалось пометить вход Codex:", error);
			}
		}
	} finally {
		await deleteAttachmentScope(input);
	}
}
