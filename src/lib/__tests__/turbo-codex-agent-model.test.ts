import { afterEach, describe, expect, test } from "bun:test";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { CodexAgentModel } from "../turbo/codex-agent-model";
import { setTurboRuntime } from "../turbo/workflow-runtime";
import { makeRuntime, text } from "./helpers/turbo-fakes";

afterEach(() => setTurboRuntime(null));

describe("CodexAgentModel: сериализация", () => {
	test("в журнал уходит только modelId, восстановление создаёт модель заново", () => {
		const model = new CodexAgentModel("gpt-6-luna");
		const data = CodexAgentModel[WORKFLOW_SERIALIZE](model);
		expect(data).toEqual({ modelId: "gpt-6-luna" });
		const restored = CodexAgentModel[WORKFLOW_DESERIALIZE](data);
		expect(restored).toBeInstanceOf(CodexAgentModel);
		expect(restored.modelId).toBe("gpt-6-luna");
		expect(restored.specificationVersion).toBe("v4");
	});
});

describe("CodexAgentModel: вызов", () => {
	test("делегирует настоящей модели из окружения", async () => {
		const inner = new MockLanguageModelV4({ doGenerate: [text("привет")] });
		let requestedModel = "";
		setTurboRuntime(
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

	test("мёртвый вход: код codex_auth_required едет в тексте ошибки", async () => {
		setTurboRuntime(
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
		setTurboRuntime(
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
