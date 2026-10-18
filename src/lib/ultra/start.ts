import { InsufficientCreditsError } from "../credits";
import { ULTRA_MODEL } from "../models";
import { ULTRA_PUBLIC_ERROR } from "./errors";
import { ULTRA_DEFAULT_REASONING, type UltraReasoning } from "./reasoning";

export interface StartUltraDeps {
	/** Строка `running` до списания: обновление страницы находит процесс по ней */
	startRecord(record: {
		id?: string;
		userId: string;
		prompt: string;
	}): Promise<string>;
	/** Списание за генерацию; бросает InsufficientCreditsError при нехватке */
	chargeCredits(params: {
		id: string;
		userId: string;
		cost: number;
	}): Promise<void>;
	startWorkflow(input: {
		id: string;
		userId: string;
		prompt: string;
		reasoning: UltraReasoning;
	}): Promise<void>;
	/** Закрывает строку и возвращает кредиты одной транзакцией */
	failRecord(params: {
		id: string;
		error: unknown;
		durationMs: number;
	}): Promise<void>;
	now(): number;
}

export type StartUltraOutcome =
	| {
			status: 202;
			body: { id: string; engine: "ultra"; cost: number };
	  }
	| { status: 402 | 502; body: { error: string } };

async function safely(label: string, action: () => Promise<void>) {
	try {
		await action();
	} catch (error) {
		console.error(`${label}:`, error);
	}
}

/**
 * Принимает запуск «Ультры» в работу: строка `running`, списание, старт воркфлоу.
 * Картинку делает воркфлоу; страница ждёт её опросом `/api/generations/:id`.
 * Сбой до старта закрывает строку с возвратом кредитов.
 */
export async function startUltra(
	input: {
		userId: string;
		prompt: string;
		id?: string;
		reasoning?: UltraReasoning;
	},
	deps: StartUltraDeps,
): Promise<StartUltraOutcome> {
	const { userId, prompt } = input;
	// уровень записывается во вход воркфлоу явно: прогон не зависит от того, что
	// станет умолчанием позже
	const reasoning = input.reasoning ?? ULTRA_DEFAULT_REASONING;
	const cost = ULTRA_MODEL.cost;
	const started = deps.now();
	let id = "";

	try {
		id = await deps.startRecord({
			...(input.id ? { id: input.id } : {}),
			userId,
			prompt,
		});
		await deps.chargeCredits({ id, userId, cost });
		await deps.startWorkflow({ id, userId, prompt, reasoning });
		return { status: 202, body: { id, engine: "ultra", cost } };
	} catch (error) {
		if (id) {
			// запись закрывает строку и возвращает кредиты одной транзакцией; если она не
			// удалась, это сделает ленивое закрытие зависших
			await safely("Не удалось записать неуспешный запуск Ультры", () =>
				deps.failRecord({ id, error, durationMs: deps.now() - started }),
			);
		}
		if (error instanceof InsufficientCreditsError) {
			return { status: 402, body: { error: "Недостаточно кредитов" } };
		}
		console.error("Ultra start error:", error);
		return { status: 502, body: { error: ULTRA_PUBLIC_ERROR } };
	}
}
