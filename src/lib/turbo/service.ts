import { InsufficientCreditsError } from "../credits";
import { TURBO_MODEL } from "../models";
import type { TurboResult } from "./agent";
import { TURBO_AGENT_MODEL } from "./constants";
import { TURBO_PUBLIC_ERROR, TurboError } from "./errors";

export interface StartTurboRecord {
	/** Желаемый id (обычно клиентский); фактический возвращает startRecord */
	id?: string;
	userId: string;
	/** Исходный запрос пользователя */
	prompt: string;
}

export interface CompletedTurboRecord {
	id: string;
	userId: string;
	/** Исходный запрос пользователя */
	prompt: string;
	/** Итоговый промпт агента */
	enhancedPrompt: string;
	imageKey: string;
	inputImages: string[];
	width: number;
	height: number;
	durationMs: number;
	agentTokens: number | null;
	systemVersion: string;
}

export interface FailedTurboRecord {
	id: string;
	userId: string;
	prompt: string;
	/** Что успело получиться до сбоя */
	enhancedPrompt: string | null;
	inputImages: string[];
	durationMs: number;
	error: unknown;
}

export interface TurboServiceDeps {
	/** Списание за генерацию; бросает InsufficientCreditsError при нехватке */
	chargeCredits(params: {
		id: string;
		userId: string;
		cost: number;
	}): Promise<void>;
	run(prompt: string): Promise<TurboResult>;
	storeImage(
		userId: string,
		png: Uint8Array,
	): Promise<{ key: string; url: string }>;
	/** Строка `running` до запуска агента: генерация переживает обновление страницы */
	startRecord(record: StartTurboRecord): Promise<string>;
	recordCompleted(record: CompletedTurboRecord): Promise<void>;
	/** Закрывает строку и возвращает кредиты — одной транзакцией */
	recordFailed(record: FailedTurboRecord): Promise<void>;
	/** Вход Codex умер: пометить в админке и скрыть Турбо */
	onAuthFailure(error: TurboError): Promise<void>;
	now(): number;
}

export type TurboOutcome =
	| {
			status: 200;
			body: {
				id: string;
				image_url: string;
				seed: null;
				duration: number;
				engine: "turbo";
				cost: number;
			};
	  }
	| { status: 402 | 502; body: { error: string } };

const DEFAULT_SIZE = { width: 1024, height: 1024 };

/** «1024x1536» → размеры; всё непонятное — стандартный квадрат */
export function parseImageSize(size: string | null): {
	width: number;
	height: number;
} {
	const match = size?.match(/^(\d{2,5})x(\d{2,5})$/);
	if (!match) return DEFAULT_SIZE;
	return { width: Number(match[1]), height: Number(match[2]) };
}

async function safely(label: string, action: () => Promise<void>) {
	try {
		await action();
	} catch (error) {
		console.error(`${label}:`, error);
	}
}

/**
 * Одна генерация в режиме «Турбо»: списание, запуск агента, сохранение картинки,
 * запись в историю. Любой сбой закрывает строку с возвратом кредитов, пишется
 * как `failed`, а пользователь получает одно общее сообщение.
 */
export async function generateTurbo(
	input: { userId: string; prompt: string; id?: string },
	deps: TurboServiceDeps,
): Promise<TurboOutcome> {
	const { userId, prompt } = input;
	const cost = TURBO_MODEL.cost;
	const started = deps.now();
	let id = "";

	try {
		// строка `running` до списания и работы: обновление страницы находит её
		id = await deps.startRecord({
			...(input.id ? { id: input.id } : {}),
			userId,
			prompt,
		});
		await deps.chargeCredits({ id, userId, cost });

		const result = await deps.run(prompt);
		const stored = await deps.storeImage(userId, result.png);
		const durationMs = deps.now() - started;
		await deps.recordCompleted({
			id,
			userId,
			prompt,
			enhancedPrompt: result.prompt,
			imageKey: stored.key,
			inputImages: result.inputImages,
			...parseImageSize(result.size),
			durationMs,
			agentTokens:
				result.inputTokens === null && result.outputTokens === null
					? null
					: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
			systemVersion: result.systemVersion,
		});

		return {
			status: 200,
			body: {
				id,
				image_url: stored.url,
				seed: null,
				duration: durationMs,
				engine: "turbo",
				cost,
			},
		};
	} catch (error) {
		const details = error instanceof TurboError ? error.details : {};
		// запись закрывает строку и возвращает кредиты одной транзакцией;
		// если она не удалась, это сделает ленивое закрытие зависших
		await safely("Не удалось записать неуспешную генерацию Турбо", () =>
			deps.recordFailed({
				id,
				userId,
				prompt,
				enhancedPrompt: details.prompt ?? null,
				inputImages: details.inputImages ?? [],
				durationMs: deps.now() - started,
				error,
			}),
		);

		if (error instanceof InsufficientCreditsError) {
			return { status: 402, body: { error: "Недостаточно кредитов" } };
		}
		if (error instanceof TurboError && error.code === "codex_auth_required") {
			await safely("Не удалось пометить вход Codex", () =>
				deps.onAuthFailure(error),
			);
		}
		console.error(`Turbo error (${TURBO_AGENT_MODEL}):`, error);
		return { status: 502, body: { error: TURBO_PUBLIC_ERROR } };
	}
}
