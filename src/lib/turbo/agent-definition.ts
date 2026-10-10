import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, type LanguageModel, type StopCondition } from "ai";
import { CodexAgentModel } from "./codex-agent-model";
import {
	TURBO_AGENT_MODEL,
	TURBO_AGENT_TIMEOUT_MS,
	TURBO_MAX_REJECTED_CHECKS,
	TURBO_MAX_STEPS,
} from "./constants";
import { TURBO_DEFAULT_REASONING, type TurboReasoning } from "./reasoning";
import { createTurboTools, type TurboToolExecutors } from "./tool-defs";

/** Что агент принял к рисованию: итоговый промпт и пути изображений */
export interface AcceptedImage {
	prompt: string;
	images: string[];
}

type TurboTools = ReturnType<typeof createTurboTools>;

/** Минимум от шага цикла, который нужен условиям остановки и разбору итога */
interface StepLike {
	toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
	toolResults: { toolCallId: string; toolName: string; output: unknown }[];
}

function outputOk(output: unknown): boolean | undefined {
	return (output as { ok?: boolean } | null)?.ok;
}

/** Первый принятый вызов generateImage в порядке выполнения */
export function pickAccepted(steps: readonly StepLike[]): AcceptedImage | null {
	for (const step of steps) {
		for (const result of step.toolResults) {
			if (
				result.toolName !== "generateImage" ||
				outputOk(result.output) !== true
			) {
				continue;
			}
			const call = step.toolCalls.find(
				(candidate) => candidate.toolCallId === result.toolCallId,
			);
			const input = call?.input as
				| { prompt?: unknown; images?: unknown }
				| undefined;
			if (typeof input?.prompt === "string" && Array.isArray(input.images)) {
				return { prompt: input.prompt, images: input.images.map(String) };
			}
		}
	}
	return null;
}

function countRejected(steps: readonly StepLike[]): number {
	return steps
		.flatMap((step) => step.toolResults)
		.filter(
			(result) =>
				result.toolName === "generateImage" &&
				outputOk(result.output) === false,
		).length;
}

/** Остановка сразу после принятия generateImage: картинку рисует следующий шаг воркфлоу */
export const acceptedImage: StopCondition<TurboTools> = ({ steps }) =>
	pickAccepted(steps) !== null;

/** Агент трижды подряд не справился с аргументами: дальше крутить цикл бессмысленно */
export const tooManyRejections: StopCondition<TurboTools> = ({ steps }) =>
	countRejected(steps) >= TURBO_MAX_REJECTED_CHECKS;

export const TURBO_STOP_WHEN = [
	acceptedImage,
	tooManyRejections,
	isStepCount(TURBO_MAX_STEPS),
];

/**
 * Единое определение агента Турбо: его используют и воркфлоу (исполнители это
 * шаги), и скрипт eval (обычные функции).
 */
export function createTurboAgent(params: {
	model?: LanguageModel;
	system: string;
	executors: TurboToolExecutors;
	/** Источник случайности инструмента random; по умолчанию Math.random */
	random?: () => number;
	/** Уровень рассуждения: выбирает пользователь; без него (старые запуски) `high` */
	reasoning?: TurboReasoning | undefined;
}) {
	return new WorkflowAgent({
		model: params.model ?? new CodexAgentModel(TURBO_AGENT_MODEL),
		instructions: params.system,
		tools: createTurboTools(params.executors, params.random),
		reasoning: params.reasoning ?? TURBO_DEFAULT_REASONING,
		// агент либо вызывает инструмент, либо заканчивает; ответа текстом без
		// generateImage не бывает: нарушение toolChoice приходит ошибкой
		toolChoice: "required",
	});
}

export type TurboAgent = ReturnType<typeof createTurboAgent>;

export interface TurboAgentRun {
	accepted: AcceptedImage | null;
	/** Вход плюс выход всех вызовов модели; null, если провайдер не сообщил */
	tokens: number | null;
	/** Вызовы инструментов по шагам: видно, какие папки и изображения открывал агент */
	toolCalls: { toolName: string; input: unknown }[];
	/** Что выпало в вызовах random: варианты и выбранный, в порядке вызовов */
	randomPicks: { options: string[]; value: string }[];
}

/** Удачные вызовы random с их вариантами */
export function collectRandomPicks(
	steps: readonly StepLike[],
): { options: string[]; value: string }[] {
	return steps.flatMap((step) =>
		step.toolResults.flatMap((result) => {
			const output = result.output as { ok?: boolean; value?: unknown } | null;
			if (
				result.toolName !== "random" ||
				output?.ok !== true ||
				typeof output.value !== "string"
			) {
				return [];
			}
			const call = step.toolCalls.find(
				(candidate) => candidate.toolCallId === result.toolCallId,
			);
			const options = (call?.input as { options?: unknown } | undefined)
				?.options;
			return [
				{
					options: Array.isArray(options) ? options.map(String) : [],
					value: output.value,
				},
			];
		}),
	);
}

export async function runTurboAgent(
	agent: TurboAgent,
	message: string,
	options: { timeoutMs?: number } = {},
): Promise<TurboAgentRun> {
	const result = await agent.generate({
		prompt: message,
		stopWhen: TURBO_STOP_WHEN,
		timeout: options.timeoutMs ?? TURBO_AGENT_TIMEOUT_MS,
	});
	const { inputTokens, outputTokens } = result.totalUsage;
	return {
		accepted: pickAccepted(result.steps),
		tokens:
			inputTokens === undefined && outputTokens === undefined
				? null
				: (inputTokens ?? 0) + (outputTokens ?? 0),
		toolCalls: result.steps.flatMap((step) =>
			step.toolCalls.map(({ toolName, input }) => ({ toolName, input })),
		),
		randomPicks: collectRandomPicks(result.steps),
	};
}
