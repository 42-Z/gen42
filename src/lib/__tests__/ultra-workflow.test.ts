import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { ultraWorkflow } from "../../../workflows/ultra/index";
import { describeGenerationError } from "../generation-error";
import { CodexImageError } from "../ultra/codex-images";
import { setUltraRuntime } from "../ultra/workflow-runtime";
import {
	makeRuntime,
	RESULT_PNG,
	text,
	toolCalls,
} from "./helpers/ultra-fakes";

const INPUT = { id: "gen-1", userId: "u1", prompt: "пятёрка на троне" };
const KEY = "generations/u1/1700000000000.png";
const good = {
	prompt: "A pug on a throne, Image 1",
	images: ["пятерка/a.png"],
};

function errorCode(runtime: {
	failGeneration: { mock: { calls: unknown[][] } };
}): string {
	const params = runtime.failGeneration.mock.calls[0]![0] as {
		error: unknown;
	};
	return describeGenerationError(params.error).split(":")[0]!;
}

beforeEach(() => {
	// трассировка требует ключ (без него работа невозможна) — в тестах ключ-заглушка
	process.env.BRAINTRUST_API_KEY = "test-key-not-real";
	spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setUltraRuntime(null));

describe("ultraWorkflow: успех", () => {
	test("агент, рисование, запись истории; возврата нет", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({ agentModel: () => model });
		setUltraRuntime(runtime);

		const result = await ultraWorkflow(INPUT);

		expect(result).toEqual({ ok: true, imageKey: KEY });
		expect(runtime.edit).toHaveBeenCalledTimes(1);
		expect(runtime.storeImage).toHaveBeenCalledWith(KEY, RESULT_PNG);
		expect(runtime.completeGeneration).toHaveBeenCalledTimes(1);
		expect(runtime.completeGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			imageKey: KEY,
			width: 1024,
			height: 1536,
			enhancedPrompt: good.prompt,
			inputImages: ["пятерка/a.png"],
			llmModel: "gpt-6-luna",
			llmTokens: 15,
		});
		expect(runtime.failGeneration).not.toHaveBeenCalled();
	});

	test("ошибка аргументов: агент исправляется, рисование одно", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/нет.png"] },
				}),
				toolCalls({ id: "2", name: "generateImage", input: good }),
			],
		});
		const runtime = makeRuntime({ agentModel: () => model });
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT);

		expect(model.doGenerateCalls).toHaveLength(2);
		expect(runtime.edit).toHaveBeenCalledTimes(1);
	});

	test("выбранный уровень рассуждения доходит до вызова модели", async () => {
		// иначе пользователь ставил бы max, платил 10 кредитов, а агент шёл бы на high
		for (const level of ["medium", "xhigh", "max"] as const) {
			const model = new MockLanguageModelV4({
				doGenerate: [
					toolCalls({ id: "1", name: "generateImage", input: good }),
				],
			});
			setUltraRuntime(makeRuntime({ agentModel: () => model }));

			await ultraWorkflow({ ...INPUT, reasoning: level });

			expect(model.doGenerateCalls[0]?.reasoning).toBe(level);
		}
	});

	test("прогон без уровня (запущен до выбора) идёт на high", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		setUltraRuntime(makeRuntime({ agentModel: () => model }));

		await ultraWorkflow(INPUT);

		expect(model.doGenerateCalls[0]?.reasoning).toBe("high");
	});

	test("стадии идут по воркфлоу: подготовка, думает, проверка, рисование", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({ agentModel: () => model });
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT);

		expect(runtime.setPhase.mock.calls.map((call) => call[1])).toEqual([
			"prepare",
			"thinking",
			"thinking",
			"review",
			"draw",
		]);
	});
});

describe("ultraWorkflow: сбои возвращают кредиты", () => {
	test("отказ Codex: шаг fail с кодом и подробностями, запись истории не делается", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({
			agentModel: () => model,
			edit: async () => {
				throw new CodexImageError("Codex Images ответил 400: policy", 400);
			},
		});
		setUltraRuntime(runtime);

		const error = await ultraWorkflow(INPUT).catch((e) => e);

		expect(error.code).toBe("generation_rejected");
		expect(errorCode(runtime)).toBe("generation_rejected");
		expect(runtime.failGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			enhancedPrompt: good.prompt,
			inputImages: ["пятерка/a.png"],
		});
		expect(runtime.completeGeneration).not.toHaveBeenCalled();
		expect(runtime.recordCodexError).not.toHaveBeenCalled();
	});

	test("401 Codex Images: вход помечается мёртвым", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({
			agentModel: () => model,
			edit: async () => {
				throw new CodexImageError("Codex Images ответил 401", 401);
			},
		});
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("codex_auth_required");
		expect(runtime.recordCodexError).toHaveBeenCalledTimes(1);
	});

	test("мёртвый вход у модели агента: тот же код и пометка", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({
					doGenerate: async () => {
						throw new APICallError({
							message: "unauthorized",
							url: "https://chatgpt.com/backend-api/codex/responses",
							requestBodyValues: {},
							statusCode: 401,
							isRetryable: false,
						});
					},
				}),
		});
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("codex_auth_required");
		expect(runtime.recordCodexError).toHaveBeenCalledTimes(1);
		expect(runtime.edit).not.toHaveBeenCalled();
	});

	test("обычный сбой модели — agent_failed", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({
					doGenerate: async () => {
						throw new Error("просто сломалось");
					},
				}),
		});
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("agent_failed");
		expect(runtime.recordCodexError).not.toHaveBeenCalled();
	});

	test("агент закончил текстом без generateImage — agent_no_generation", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({ doGenerate: [text("Готово")] }),
		});
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("agent_no_generation");
	});

	test("три отказа проверки подряд — agent_no_generation, рисования нет", async () => {
		const bad = toolCalls({
			id: "1",
			name: "generateImage",
			input: { prompt: "x", images: ["пятерка/нет.png"] },
		});
		const model = new MockLanguageModelV4({ doGenerate: async () => bad });
		const runtime = makeRuntime({ agentModel: () => model });
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT).catch(() => {});

		expect(errorCode(runtime)).toBe("agent_no_generation");
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(runtime.edit).not.toHaveBeenCalled();
	});

	test("сбой записи истории после рисования тоже возвращает кредиты", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: [toolCalls({ id: "1", name: "generateImage", input: good })],
		});
		const runtime = makeRuntime({
			agentModel: () => model,
			completeGeneration: async () => {
				throw new Error("база недоступна");
			},
		});
		setUltraRuntime(runtime);

		await ultraWorkflow(INPUT).catch(() => {});

		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
	});
});
