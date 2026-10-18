import { ULTRA_MODEL } from "../models";
import { type StartRunOutcome, startRun } from "../start-run";
import { ULTRA_DEFAULT_REASONING, type UltraReasoning } from "./reasoning";

export interface StartUltraDeps {
	/** Строка `running` до списания: обновление страницы находит процесс по ней */
	startRecord(record: {
		id?: string;
		userId: string;
		prompt: string;
		reasoning: UltraReasoning;
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

export type StartUltraOutcome = StartRunOutcome;

/**
 * Принимает запуск «Ультры» в работу: строка `running`, списание, старт воркфлоу
 * (общий приём `startRun`). Картинку делает воркфлоу; страница ждёт её опросом
 * `/api/generations/:id`.
 */
export function startUltra(
	input: {
		userId: string;
		prompt: string;
		id?: string;
		reasoning?: UltraReasoning;
	},
	deps: StartUltraDeps,
): Promise<StartUltraOutcome> {
	const { userId, prompt } = input;
	// Уровень сохраняется в истории и во входе воркфлоу явно: прогон не зависит
	// от того, что станет умолчанием позже.
	const reasoning = input.reasoning ?? ULTRA_DEFAULT_REASONING;
	return startRun(
		{ userId, engine: "ultra", cost: ULTRA_MODEL.cost },
		{
			startRecord: () =>
				deps.startRecord({
					...(input.id ? { id: input.id } : {}),
					userId,
					prompt,
					reasoning,
				}),
			chargeCredits: (params) => deps.chargeCredits(params),
			startWorkflow: (id) =>
				deps.startWorkflow({ id, userId, prompt, reasoning }),
			failRecord: (params) => deps.failRecord(params),
			now: () => deps.now(),
		},
	);
}
