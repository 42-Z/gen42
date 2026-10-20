import { afterEach, describe, expect, test } from "bun:test";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { CodexAgentModel } from "../ultra/codex-agent-model";
import { setUltraRuntime } from "../ultra/workflow-runtime";
import { makeRuntime, text } from "./helpers/ultra-fakes";

afterEach(() => setUltraRuntime(null));

describe("CodexAgentModel: сериализация", () => {
	test("в журнал уходят modelId и id генерации, модель восстанавливается заново", () => {
		const model = new CodexAgentModel("gpt-6-luna", "gen-1");
		const data = CodexAgentModel[WORKFLOW_SERIALIZE](model);
		expect(data).toEqual({ modelId: "gpt-6-luna", generationId: "gen-1" });
		const restored = CodexAgentModel[WORKFLOW_DESERIALIZE](data);
		expect(restored).toBeInstanceOf(CodexAgentModel);
		expect(restored.modelId).toBe("gpt-6-luna");
		expect(restored.generationId).toBe("gen-1");
		expect(restored.specificationVersion).toBe("v4");
	});

	test("старая запись без id генерации читается", () => {
		const restored = CodexAgentModel[WORKFLOW_DESERIALIZE]({
			modelId: "gpt-6-luna",
		});
		expect(restored.modelId).toBe("gpt-6-luna");
		expect(restored.generationId).toBeUndefined();
	});
});

describe("CodexAgentModel: вызов", () => {
	test("делегирует настоящей модели из окружения", async () => {
		const inner = new MockLanguageModelV4({ doGenerate: [text("привет")] });
		let requestedModel = "";
		setUltraRuntime(
			makeRuntime({
				agentModel: (modelId) => {
					requestedModel = modelId;
					return inner;
				},
			}),
		);
		const result = await new CodexAgentModel("gpt-6-luna").doGenerate({
			prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		});
		expect(requestedModel).toBe("gpt-6-luna");
		expect(inner.doGenerateCalls).toHaveLength(1);
		expect(result.content).toEqual([{ type: "text", text: "привет" }]);
	});

	test("перед вызовом модели отмечает стадию «думает»", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({ doGenerate: [text("привет")] }),
		});
		setUltraRuntime(runtime);

		await new CodexAgentModel("gpt-6-luna", "gen-1").doGenerate({
			prompt: [],
		});

		expect(runtime.setPhase).toHaveBeenCalledWith("gen-1", "thinking");
	});

	test("без id генерации стадия не пишется", async () => {
		const runtime = makeRuntime({
			agentModel: () =>
				new MockLanguageModelV4({ doGenerate: [text("привет")] }),
		});
		setUltraRuntime(runtime);

		await new CodexAgentModel("gpt-6-luna").doGenerate({ prompt: [] });

		expect(runtime.setPhase).not.toHaveBeenCalled();
	});

	test("мёртвый вход: код codex_auth_required едет в тексте ошибки", async () => {
		setUltraRuntime(
			makeRuntime({
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
			}),
		);
		const error = await new CodexAgentModel("gpt-6-luna")
			.doGenerate({ prompt: [] })
			.catch((e) => e);
		expect(error.message).toMatch(/^codex_auth_required: unauthorized/);
	});

	test("прочие сбои пробрасываются без изменений", async () => {
		const failure = new Error("просто сломалось");
		setUltraRuntime(
			makeRuntime({
				agentModel: () =>
					new MockLanguageModelV4({
						doGenerate: async () => {
							throw failure;
						},
					}),
			}),
		);
		const error = await new CodexAgentModel("gpt-6-luna")
			.doGenerate({ prompt: [] })
			.catch((e) => e);
		expect(error).toBe(failure);
	});
});
