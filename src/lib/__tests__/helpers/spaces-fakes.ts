import { mock } from "bun:test";
import type { EnhanceResult } from "../../enhance";
import type {
	AttemptInput,
	AttemptOutcome,
	AttemptSuccess,
} from "../../spaces/types";
import type { SpacesRuntime } from "../../spaces/workflow-runtime";

export const ENHANCED: EnhanceResult = {
	prompt: "A pug on a golden throne, rainbow and gold",
	keyId: "llm-1",
	model: "mercury-2.5",
	styleVersion: "abcd1234abcd1234",
	inputTokens: 100,
	outputTokens: 50,
	durationMs: 1200,
	fallback: false,
};

export const DRAWN: AttemptSuccess = {
	ok: true,
	imageKey: "generations/u1/1700000000000.png",
	seed: 77,
	apiKeyId: "hf-1",
	durationMs: 9000,
};

export const INPUT = {
	id: "gen-1",
	userId: "u1",
	engine: "krea" as const,
	prompt: "пятёрка на троне",
	model: "Turbo" as const,
	width: 1024,
	height: 1024,
	steps: 8,
	seed: null,
};

function defaultRuntime() {
	return {
		enhance: mock(
			async (
				_prompt: string,
				_meta: { generationId: string; engine: string },
			) => ENHANCED,
		),
		attempt: mock(
			async (_input: AttemptInput): Promise<AttemptOutcome> => DRAWN,
		),
		completeGeneration: mock(async (_params: unknown) => true),
		failGeneration: mock(async (_params: unknown) => true),
		now: () => 1_700_000_000_000,
	};
}

type DefaultRuntime = ReturnType<typeof defaultRuntime>;

/**
 * Окружение шагов для тестов: всё в памяти, вызовы записываются. Подменённые поля
 * имеют тип подмены, остальные остаются моками (`runtime.attempt.mock.calls`).
 */
export function makeSpacesRuntime(): DefaultRuntime;
export function makeSpacesRuntime<T extends Partial<SpacesRuntime>>(
	overrides: T,
): Omit<DefaultRuntime, keyof T> & T;
export function makeSpacesRuntime(
	overrides: Partial<SpacesRuntime> = {},
): unknown {
	return { ...defaultRuntime(), ...overrides };
}
