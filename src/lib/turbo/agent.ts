import { createHash } from "node:crypto";
import {
	isStepCount,
	type LanguageModel,
	ToolChoiceViolationError,
	ToolLoopAgent,
} from "ai";
import { buildUserMessage } from "../prompts/anchors";
import {
	extractCapsPhrases,
	extractQuotedTexts,
	requestsText,
} from "../prompts/style-hints";
import { TURBO_MAX_STEPS, TURBO_TIMEOUT_MS } from "./constants";
import { TurboError } from "./errors";
import type { Library } from "./library";
import {
	createTurboRun,
	createTurboTools,
	type EditFn,
	isRunFinished,
} from "./tools";

export interface RunTurboDeps {
	model: LanguageModel;
	library: Library;
	edit: EditFn;
	/** Системная инструкция из дерева библиотеки этого запроса */
	buildSystem: (tree: string) => string;
	maxSteps?: number;
	timeoutMs?: number;
}

export interface TurboResult {
	png: Uint8Array;
	/** Итоговый промпт, который агент отдал генератору */
	prompt: string;
	inputImages: string[];
	/** Вызовы инструментов по шагам прогона: видно, какие папки и изображения агент открывал */
	toolCalls: { toolName: string; input: unknown }[];
	/** Размер, который выбрал сервер */
	size: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	durationMs: number;
	/** Хеш инструкции без дерева: по нему сравниваются итерации */
	systemVersion: string;
}

export function systemVersionOf(template: string): string {
	return createHash("sha256").update(template).digest("hex").slice(0, 16);
}

function statusOf(error: unknown): number | null {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const candidate = current as {
			statusCode?: unknown;
			lastError?: unknown;
			cause?: unknown;
		};
		if (typeof candidate.statusCode === "number") return candidate.statusCode;
		current = candidate.lastError ?? candidate.cause;
	}
	return null;
}

function isAuthFailure(error: unknown): boolean {
	const status = statusOf(error);
	if (status === 401 || status === 403) return true;
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const code = (current as { code?: unknown }).code;
		if (
			code === "auth_required" ||
			code === "refresh_failed" ||
			code === "workspace_mismatch"
		) {
			return true;
		}
		current =
			(current as { lastError?: unknown; cause?: unknown }).lastError ??
			(current as { cause?: unknown }).cause;
	}
	return false;
}

/** Всё, что пришло из агента, превращает в TurboError с понятным кодом */
export function classifyAgentError(
	error: unknown,
	signal: AbortSignal,
): TurboError {
	if (error instanceof TurboError) return error;
	// модель ответила без вызова инструмента при toolChoice "required"
	if (ToolChoiceViolationError.isInstance(error)) {
		return new TurboError(
			"agent_no_generation",
			"Агент завершил работу, не вызвав generateImage",
			{ cause: error },
		);
	}
	const message = error instanceof Error ? error.message : String(error);
	const name = (error as { name?: string } | null)?.name;
	if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
		return new TurboError("agent_timeout", message, { cause: error });
	}
	if (isAuthFailure(error)) {
		return new TurboError("codex_auth_required", message, { cause: error });
	}
	return new TurboError("agent_failed", message, { cause: error });
}

/**
 * Сообщение пользователя для агента: запрос, признак текста и точные цитаты.
 * Случайных якорей канона здесь нет: они тянули каждый кадр к одному набору
 * (золото, трактор, дирижабль), а идею агент должен придумывать сам.
 */
export function buildAgentMessage(userInput: string): string {
	const exactTexts = extractQuotedTexts(userInput);
	const textRequested = requestsText(userInput) || exactTexts.length > 0;
	// лозунги капсом приходят так же, как в обычном обогащении: их обещает канон
	return buildUserMessage(userInput, null, {
		textRequested,
		exactTexts,
		textCandidates: textRequested ? extractCapsPhrases(userInput) : [],
	});
}

export async function runTurbo(
	userInput: string,
	deps: RunTurboDeps,
): Promise<TurboResult> {
	const started = Date.now();
	const run = createTurboRun();
	const signal = AbortSignal.timeout(deps.timeoutMs ?? TURBO_TIMEOUT_MS);

	try {
		const tree = await deps.library.describeTree();
		const system = deps.buildSystem(tree);
		const agent = new ToolLoopAgent({
			model: deps.model,
			instructions: system,
			tools: createTurboTools({ library: deps.library, edit: deps.edit, run }),
			reasoning: "high",
			// агент либо вызывает инструмент, либо заканчивает; ответа текстом без
			// generateImage (редкий сбой модели) не бывает: ToolChoice из документации AI SDK
			toolChoice: "required",
			stopWhen: [
				() => isRunFinished(run),
				isStepCount(deps.maxSteps ?? TURBO_MAX_STEPS),
			],
		});
		const result = await agent.generate({
			prompt: buildAgentMessage(userInput),
			abortSignal: signal,
		});

		if (run.png && run.prompt) {
			return {
				png: run.png,
				prompt: run.prompt,
				inputImages: run.inputImages,
				toolCalls: result.steps.flatMap((step) =>
					step.toolCalls.map(({ toolName, input }) => ({ toolName, input })),
				),
				size: run.size,
				inputTokens: result.usage.inputTokens ?? null,
				outputTokens: result.usage.outputTokens ?? null,
				durationMs: Date.now() - started,
				systemVersion: systemVersionOf(deps.buildSystem("")),
			};
		}
		if (run.failure) throw run.failure;
		if (signal.aborted) {
			throw new TurboError("agent_timeout", "Время запуска вышло");
		}
		throw new TurboError(
			"agent_no_generation",
			"Агент завершил работу, не вызвав generateImage",
		);
	} catch (error) {
		// провал внутри generateImage важнее обёртки, в которую его мог завернуть SDK
		if (run.failure) throw run.failure;
		throw classifyAgentError(error, signal);
	}
}
