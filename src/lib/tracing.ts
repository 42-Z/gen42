import {
	braintrustAISDKTelemetry,
	initLogger,
	traced,
	type Span,
	type StartSpanArgs,
} from "braintrust";
import * as ai from "ai";

let initialized = false;

function requireKey(): string {
	const key = process.env.BRAINTRUST_API_KEY;
	if (!key) {
		throw new Error(
			"BRAINTRUST_API_KEY не задан: трассировка и evaluation живут в Braintrust, работа без ключа не предусмотрена",
		);
	}
	return key;
}

/**
 * Идемпотентная инициализация трассировки. Без BRAINTRUST_API_KEY — ошибка:
 * приложение и eval-файлы без Braintrust не работают. Сбой инициализации
 * не роняет работу приложения (лог + продолжение).
 */
export function initTracing(): void {
	requireKey();
	if (initialized) return;
	initialized = true;
	try {
		initLogger({ projectName: process.env.BRAINTRUST_PROJECT ?? "Gen42" });
		ai.registerTelemetry(braintrustAISDKTelemetry());
	} catch (error) {
		console.warn("[tracing] инициализация не удалась:", error);
	}
}

/** Span вокруг работы. Ошибки работы проходят наружу; без ключа работа не начинается. */
export async function traceSpan<T>(
	name: string,
	args: {
		type?: StartSpanArgs["type"];
		input?: unknown;
		metadata?: Record<string, unknown>;
	},
	work: (span: Span) => Promise<T>,
): Promise<T> {
	requireKey();
	return traced(async (span) => work(span), {
		name,
		type: args.type ?? "function",
		...(args.input !== undefined ? { input: args.input } : {}),
		...(args.metadata ? { metadata: args.metadata } : {}),
	});
}
