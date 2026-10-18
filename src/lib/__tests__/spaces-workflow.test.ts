import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { spaceImageWorkflow } from "../../../workflows/spaces/index";
import { describeGenerationError } from "../generation-error";
import type { AttemptInput, AttemptOutcome } from "../spaces/types";
import { setSpacesRuntime } from "../spaces/workflow-runtime";
import {
	DRAWN,
	ENHANCED,
	INPUT,
	makeSpacesRuntime,
} from "./helpers/spaces-fakes";

function errorCode(runtime: {
	failGeneration: { mock: { calls: unknown[][] } };
}): string {
	const params = runtime.failGeneration.mock.calls[0]![0] as {
		error: unknown;
	};
	return describeGenerationError(params.error).split(":")[0]!;
}

/** Исходы попыток по порядку вызовов */
function attempts(...outcomes: AttemptOutcome[]) {
	let index = 0;
	return mock(async (_input: AttemptInput) => outcomes[index++]!);
}

beforeEach(() => {
	spyOn(console, "error").mockImplementation(() => {});
	spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => setSpacesRuntime(null));

describe("spaceImageWorkflow: успех", () => {
	test("обогащение, попытка, запись истории; возврата нет", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		const result = await spaceImageWorkflow(INPUT);

		expect(result).toEqual({ ok: true, imageKey: DRAWN.imageKey });
		expect(runtime.enhance).toHaveBeenCalledWith("пятёрка на троне", {
			generationId: "gen-1",
			engine: "krea",
		});
		// в Space уходит обогащённый промпт, а не исходный
		expect(runtime.attempt.mock.calls[0]![0]).toMatchObject({
			userId: "u1",
			engine: "krea",
			prompt: ENHANCED.prompt,
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
			excludeKeyIds: [],
		});
		expect(runtime.completeGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			imageKey: DRAWN.imageKey,
			seed: 77,
			apiKeyId: "hf-1",
			enhancedPrompt: ENHANCED.prompt,
		});
		expect(runtime.failGeneration).not.toHaveBeenCalled();
	});

	test("исчерпанный ключ: вторая попытка исключает его", async () => {
		const attempt = attempts(
			{
				ok: false,
				reason: "key_exhausted",
				keyId: "hf-0",
				status: 429,
				message: "quota",
			},
			DRAWN,
		);
		const runtime = makeSpacesRuntime({ attempt });
		setSpacesRuntime(runtime);

		await spaceImageWorkflow(INPUT);

		expect(attempt).toHaveBeenCalledTimes(2);
		expect(attempt.mock.calls[1]![0]).toMatchObject({
			excludeKeyIds: ["hf-0"],
		});
		expect(runtime.failGeneration).not.toHaveBeenCalled();
	});

	test("таймаут очереди: повтор тем же ключом", async () => {
		const attempt = attempts(
			{ ok: false, reason: "queue_timeout", keyId: "hf-1", message: "queue" },
			DRAWN,
		);
		setSpacesRuntime(makeSpacesRuntime({ attempt }));

		await spaceImageWorkflow(INPUT);

		expect(attempt.mock.calls[1]![0]).toMatchObject({ excludeKeyIds: [] });
	});
});

describe("spaceImageWorkflow: сбои возвращают кредиты", () => {
	test("ключей нет: all_keys_exhausted, записи истории нет", async () => {
		const runtime = makeSpacesRuntime({
			attempt: attempts({ ok: false, reason: "no_keys" }),
		});
		setSpacesRuntime(runtime);

		const error = await spaceImageWorkflow(INPUT).catch((e) => e);

		expect(error.code).toBe("all_keys_exhausted");
		expect(errorCode(runtime)).toBe("all_keys_exhausted");
		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
		expect(runtime.completeGeneration).not.toHaveBeenCalled();
	});

	test("прочая ошибка попытки: код error, ключ HF и данные LLM в записи", async () => {
		const runtime = makeSpacesRuntime({
			attempt: attempts({
				ok: false,
				reason: "error",
				keyId: "hf-1",
				message: "Не удалось скачать изображение: 500",
			}),
		});
		setSpacesRuntime(runtime);

		await spaceImageWorkflow({ ...INPUT, seed: 5 }).catch(() => {});

		expect(errorCode(runtime)).toBe("error");
		expect(runtime.failGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			seed: 5,
			apiKeyId: "hf-1",
			enhancedPrompt: ENHANCED.prompt,
			llmKeyId: "llm-1",
		});
	});

	test("сбой обогащения: попыток нет, кредиты возвращаются", async () => {
		const runtime = makeSpacesRuntime({
			enhance: async () => {
				throw new Error("LLM недоступна");
			},
		});
		setSpacesRuntime(runtime);

		await spaceImageWorkflow(INPUT).catch(() => {});

		expect(runtime.attempt).not.toHaveBeenCalled();
		expect(errorCode(runtime)).toBe("error");
		expect(runtime.failGeneration.mock.calls[0]![0]).toMatchObject({
			enhancedPrompt: null,
		});
	});

	test("сбой записи истории после картинки тоже возвращает кредиты", async () => {
		const runtime = makeSpacesRuntime({
			completeGeneration: async () => {
				throw new Error("база недоступна");
			},
		});
		setSpacesRuntime(runtime);

		await spaceImageWorkflow(INPUT).catch(() => {});

		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
	});
});
