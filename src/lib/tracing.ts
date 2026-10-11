import * as ai from "ai";
import {
	braintrustAISDKTelemetry,
	initExperiment,
	initLogger,
	NOOP_SPAN,
	type Span,
	type StartSpanArgs,
	traced,
} from "braintrust";

let initialized = false;

/**
 * Идемпотентная инициализация трассировки. Без BRAINTRUST_API_KEY — no-op;
 * сбой инициализации не роняет работу приложения.
 */
export function initTracing(): void {
	if (initialized) return;
	initialized = true;
	if (!process.env.BRAINTRUST_API_KEY) return;
	try {
		initLogger({ projectName: process.env.BRAINTRUST_PROJECT ?? "Gen42" });
		ai.registerTelemetry(braintrustAISDKTelemetry());
	} catch (error) {
		console.warn("[tracing] инициализация не удалась:", error);
	}
}

/** Span вокруг работы. Без ключа работа идёт с NOOP_SPAN; ошибки работы проходят наружу. */
export async function traceSpan<T>(
	name: string,
	args: {
		type?: StartSpanArgs["type"];
		input?: unknown;
		metadata?: Record<string, unknown>;
	},
	work: (span: Span) => Promise<T>,
): Promise<T> {
	if (!process.env.BRAINTRUST_API_KEY) return work(NOOP_SPAN);
	return traced(async (span) => work(span), {
		name,
		type: args.type ?? "function",
		...(args.input !== undefined ? { input: args.input } : {}),
		...(args.metadata ? { metadata: args.metadata } : {}),
	});
}

export interface EvalRunRecord {
	input: string;
	output: string | null;
	metadata: Record<string, unknown>;
}

export function evalExperimentName(suite: string, stamp: string): string {
	return `${suite}-${stamp}`;
}

/** Прогон eval-скрипта одним экспериментом. Без ключа — no-op; сбой не роняет прогон. */
export async function logEvalRun(params: {
	suite: string;
	stamp: string;
	records: EvalRunRecord[];
}): Promise<void> {
	if (!process.env.BRAINTRUST_API_KEY) return;
	try {
		const experiment = initExperiment(
			process.env.BRAINTRUST_PROJECT ?? "Gen42",
			{
				experiment: evalExperimentName(params.suite, params.stamp),
				setCurrent: false,
			},
		);
		for (const record of params.records) {
			experiment.log({
				input: record.input,
				output: record.output,
				scores: {},
				metadata: record.metadata,
			});
		}
		await experiment.flush();
	} catch (error) {
		console.warn("[tracing] эксперимент не отправлен:", error);
	}
}
