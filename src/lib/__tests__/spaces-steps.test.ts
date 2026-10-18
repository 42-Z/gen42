import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	completeStep,
	enhanceStep,
	failStep,
	generateStep,
} from "../../../workflows/spaces/steps";
import { describeGenerationError } from "../generation-error";
import { setSpacesRuntime } from "../spaces/workflow-runtime";
import { DRAWN, ENHANCED, makeSpacesRuntime } from "./helpers/spaces-fakes";

beforeEach(() => {
	// шаги намеренно логируют сбои; в выводе тестов они не нужны
	spyOn(console, "error").mockImplementation(() => {});
	spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => setSpacesRuntime(null));

describe("повторы платформы", () => {
	test("enhance и generate без повторов: каждый вызов расходует лимит ключа", () => {
		expect(enhanceStep.maxRetries).toBe(0);
		expect(generateStep.maxRetries).toBe(0);
	});

	test("complete и fail повторяются по умолчанию: запись идемпотентна", () => {
		expect(
			(completeStep as { maxRetries?: number }).maxRetries,
		).toBeUndefined();
		expect((failStep as { maxRetries?: number }).maxRetries).toBeUndefined();
	});
});

describe("enhanceStep и generateStep", () => {
	test("enhanceStep отдаёт результат обогащения и передаёт id с движком в трассировку", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		const result = await enhanceStep({
			id: "gen-1",
			engine: "krea",
			prompt: "кот",
		});

		expect(result).toEqual(ENHANCED);
		expect(runtime.enhance).toHaveBeenCalledWith("кот", {
			generationId: "gen-1",
			engine: "krea",
		});
	});

	test("generateStep передаёт вход попытки и возвращает её исход", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);
		const input = {
			generationId: "gen-1",
			userId: "u1",
			engine: "krea" as const,
			prompt: "A pug",
			model: "Turbo" as const,
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
			excludeKeyIds: ["hf-0"],
		};

		expect(await generateStep(input)).toEqual(DRAWN);
		expect(runtime.attempt).toHaveBeenCalledWith(input);
	});
});

describe("completeStep", () => {
	const base = {
		id: "gen-1",
		imageKey: DRAWN.imageKey,
		seed: 77,
		width: 1024,
		height: 1024,
		apiKeyId: "hf-1",
		durationMs: 9000,
		enhanced: ENHANCED,
	};

	test("пишет историю: промпт, ключи, модель и токены LLM", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		await completeStep(base);

		expect(runtime.completeGeneration.mock.calls[0]![0]).toMatchObject({
			id: "gen-1",
			imageKey: DRAWN.imageKey,
			seed: 77,
			width: 1024,
			height: 1024,
			enhancedPrompt: ENHANCED.prompt,
			durationMs: 9000,
			apiKeyId: "hf-1",
			llmKeyId: "llm-1",
			llmModel: "mercury-2.5",
			llmTokens: 150,
			enhanceMs: 1200,
			styleVersion: "abcd1234abcd1234",
		});
	});

	test("уже закрытая запись только логируется", async () => {
		setSpacesRuntime(
			makeSpacesRuntime({ completeGeneration: async () => false }),
		);
		await expect(completeStep(base)).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});
});

describe("failStep", () => {
	test("закрывает строку с кодом, ключом HF и тем, что успел дать LLM", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		await failStep({
			id: "gen-1",
			failure: { code: "error", message: "сломалось", apiKeyId: "hf-1" },
			seed: 5,
			durationMs: 4000,
			enhanced: ENHANCED,
		});

		const params = runtime.failGeneration.mock.calls[0]![0] as {
			error: unknown;
		};
		expect(describeGenerationError(params.error)).toBe("error: сломалось");
		expect(params).toMatchObject({
			id: "gen-1",
			seed: 5,
			durationMs: 4000,
			enhancedPrompt: ENHANCED.prompt,
			apiKeyId: "hf-1",
			llmKeyId: "llm-1",
			llmModel: "mercury-2.5",
			llmTokens: 150,
			enhanceMs: 1200,
			styleVersion: "abcd1234abcd1234",
		});
	});

	test("сбой до обогащения: данных LLM нет", async () => {
		const runtime = makeSpacesRuntime();
		setSpacesRuntime(runtime);

		await failStep({
			id: "gen-1",
			failure: { code: "all_keys_exhausted", message: "x", apiKeyId: null },
			seed: null,
			durationMs: 10,
			enhanced: null,
		});

		const params = runtime.failGeneration.mock.calls[0]![0] as {
			error: unknown;
		};
		expect(describeGenerationError(params.error).split(":")[0]).toBe(
			"all_keys_exhausted",
		);
		expect(params).toMatchObject({
			enhancedPrompt: null,
			llmKeyId: null,
			llmTokens: null,
			apiKeyId: null,
		});
	});
});
