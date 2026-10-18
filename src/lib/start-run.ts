import { InsufficientCreditsError } from "./credits";
import {
	TOO_MANY_REQUESTS_ERROR,
	TooManyRunningError,
} from "./generation-limits";
import type { ImageEngine } from "./models";
import { ULTRA_PUBLIC_ERROR } from "./ultra/errors";

export interface StartRunDeps {
	/** Строка `running` до списания; бросает `TooManyRunningError` на потолке идущих */
	startRecord(): Promise<string>;
	/** Списание за генерацию; бросает InsufficientCreditsError при нехватке */
	chargeCredits(params: {
		id: string;
		userId: string;
		cost: number;
	}): Promise<void>;
	startWorkflow(id: string): Promise<void>;
	/** Закрывает строку и возвращает кредиты одной транзакцией */
	failRecord(params: {
		id: string;
		error: unknown;
		durationMs: number;
	}): Promise<void>;
	now(): number;
}

export type StartRunOutcome =
	| {
			status: 202;
			body: { id: string; engine: ImageEngine; cost: number };
	  }
	| { status: 402 | 429 | 502; body: { error: string } };

async function safely(label: string, action: () => Promise<void>) {
	try {
		await action();
	} catch (error) {
		console.error(`${label}:`, error);
	}
}

/**
 * Принимает запуск любого движка в работу: строка `running`, списание, старт
 * воркфлоу. Картинку делает воркфлоу; страница ждёт её опросом
 * `/api/generations/:id`. Сбой после создания строки закрывает её с возвратом
 * кредитов.
 */
export async function startRun(
	input: { userId: string; engine: ImageEngine; cost: number },
	deps: StartRunDeps,
): Promise<StartRunOutcome> {
	const { userId, engine, cost } = input;
	const started = deps.now();
	let id = "";

	try {
		id = await deps.startRecord();
		await deps.chargeCredits({ id, userId, cost });
		await deps.startWorkflow(id);
		return { status: 202, body: { id, engine, cost } };
	} catch (error) {
		if (id) {
			// запись закрывает строку и возвращает кредиты одной транзакцией; если она не
			// удалась, это сделает ленивое закрытие зависших
			await safely("Не удалось записать неуспешный запуск", () =>
				deps.failRecord({ id, error, durationMs: deps.now() - started }),
			);
		}
		if (error instanceof TooManyRunningError) {
			return { status: 429, body: { error: TOO_MANY_REQUESTS_ERROR } };
		}
		if (error instanceof InsufficientCreditsError) {
			return { status: 402, body: { error: "Недостаточно кредитов" } };
		}
		console.error("Run start error:", error);
		return { status: 502, body: { error: ULTRA_PUBLIC_ERROR } };
	}
}
