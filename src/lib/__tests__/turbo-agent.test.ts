import { describe, expect, mock, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { runTurbo, systemVersionOf } from "../turbo/agent";
import { CodexImageError } from "../turbo/codex-images";
import { TURBO_MAX_STEPS } from "../turbo/constants";
import { TurboError } from "../turbo/errors";
import { Library, type LibraryStorage } from "../turbo/library";
import type { EditFn } from "../turbo/tools";

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const RESULT_PNG = new Uint8Array([9, 9, 9]);

const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function storage(): LibraryStorage {
	const objects: Record<string, Uint8Array> = {
		"library/пятерка/a.png": PNG,
		"library/пятерка/описания.txt": new TextEncoder().encode("a.png — первая"),
	};
	return {
		list: async (prefix) =>
			Object.entries(objects)
				.filter(([key]) => key.startsWith(prefix))
				.map(([key, bytes]) => ({ key, size: bytes.byteLength })),
		read: async (key) => objects[key] ?? null,
	};
}

function toolCalls(...calls: { id: string; name: string; input: unknown }[]) {
	return {
		content: calls.map((call) => ({
			type: "tool-call" as const,
			toolCallId: call.id,
			toolName: call.name,
			input: JSON.stringify(call.input),
		})),
		finishReason: { unified: "tool-calls" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function text(value: string) {
	return {
		content: [{ type: "text" as const, text: value }],
		finishReason: { unified: "stop" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function setup(
	steps: ConstructorParameters<typeof MockLanguageModelV4>[0],
	edit = mock<EditFn>(async () => ({
		png: RESULT_PNG,
		size: "1024x1024",
		quality: "medium",
	})),
) {
	const model = new MockLanguageModelV4(steps);
	const library = new Library(storage());
	const deps = {
		model,
		library,
		edit,
		buildSystem: (tree: string) => `SYSTEM\n<library>\n${tree}\n</library>`,
	};
	return { model, edit, deps };
}

describe("runTurbo", () => {
	test("успех: параллельные listFolder и readFile, затем generateImage", async () => {
		const { model, edit, deps } = setup({
			doGenerate: [
				toolCalls(
					{ id: "1", name: "listFolder", input: { path: "пятерка" } },
					{
						id: "2",
						name: "readFile",
						input: { path: "пятерка/описания.txt" },
					},
					{ id: "3", name: "readFile", input: { path: "пятерка/a.png" } },
				),
				toolCalls({
					id: "4",
					name: "generateImage",
					input: {
						prompt: "The person from Image 1 on a throne",
						images: ["пятерка/a.png"],
					},
				}),
			],
		});

		const result = await runTurbo("пятёрка на троне", deps);

		expect(result.png).toEqual(RESULT_PNG);
		expect(result.prompt).toBe("The person from Image 1 on a throne");
		expect(result.inputImages).toEqual(["пятерка/a.png"]);
		expect(result.inputTokens).toBe(20);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(edit).toHaveBeenCalledTimes(1);
		const editArgs = edit.mock.calls[0]![0];
		expect(editArgs.images).toHaveLength(1);
		expect(editArgs.images[0]!.path).toBe("пятерка/a.png");

		// агент видел дерево и пользовательское сообщение
		const firstPrompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
		expect(firstPrompt).toContain("пятерка/ — 1 изображение");
		expect(firstPrompt).toContain("USER_REQUEST");
		// изображение дошло до модели как файл в результате инструмента
		const secondPrompt = JSON.stringify(model.doGenerateCalls[1]!.prompt);
		expect(secondPrompt).toContain("image/png");
	});

	test("два generateImage в одном шаге — второй отклонён, рисование одно", async () => {
		const { model, edit, deps } = setup({
			doGenerate: [
				toolCalls(
					{
						id: "1",
						name: "generateImage",
						input: { prompt: "первый", images: [] },
					},
					{
						id: "2",
						name: "generateImage",
						input: { prompt: "второй", images: [] },
					},
				),
			],
		});
		const result = await runTurbo("кот", deps);
		expect(result.prompt).toBe("первый");
		expect(edit).toHaveBeenCalledTimes(1);
		expect(edit.mock.calls[0]![0].prompt).toBe("первый");
		expect(model.doGenerateCalls).toHaveLength(1);
	});

	test("таймаут во время рисования — agent_timeout, а не generation_rejected", async () => {
		const edit = mock<EditFn>(
			async ({ signal }) =>
				await new Promise((_, reject) => {
					signal?.addEventListener("abort", () => reject(signal.reason));
				}),
		);
		const { deps } = setup(
			{
				doGenerate: [
					toolCalls({
						id: "1",
						name: "generateImage",
						input: { prompt: "x", images: [] },
					}),
				],
			},
			edit,
		);
		const error = await runTurbo("кот", { ...deps, timeoutMs: 20 }).catch(
			(e) => e,
		);
		expect(error).toBeInstanceOf(TurboError);
		expect(error.code).toBe("agent_timeout");
	});

	test("generateImage без изображений допустим", async () => {
		const { deps, edit } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "a cat", images: [] },
				}),
			],
		});
		const result = await runTurbo("кот", deps);
		expect(result.inputImages).toEqual([]);
		expect(edit.mock.calls[0]![0].images).toEqual([]);
	});

	test("ошибка аргументов — retryable, агент исправляется и рисует", async () => {
		const { model, deps } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/нет.png"] },
				}),
				toolCalls({
					id: "2",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/a.png"] },
				}),
			],
		});
		const result = await runTurbo("пятёрка", deps);
		expect(result.inputImages).toEqual(["пятерка/a.png"]);
		expect(model.doGenerateCalls).toHaveLength(2);
		// агент получил retryable:true и подсказку
		expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain(
			"retryable",
		);
	});

	test("третья ошибка аргументов подряд — agent_no_generation", async () => {
		const bad = toolCalls({
			id: "1",
			name: "generateImage",
			input: { prompt: "", images: [] },
		});
		const { deps, edit } = setup({ doGenerate: [bad, bad, bad, bad] });
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error).toBeInstanceOf(TurboError);
		expect(error.code).toBe("agent_no_generation");
		expect(edit).not.toHaveBeenCalled();
	});

	test("отказ Codex — generation_rejected, повторов нет", async () => {
		const edit = mock<EditFn>(async () => {
			throw new CodexImageError("Codex Images ответил 400: policy", 400);
		});
		const { model, deps } = setup(
			{
				doGenerate: [
					toolCalls({
						id: "1",
						name: "generateImage",
						input: { prompt: "x", images: [] },
					}),
					text("не должно быть вызвано"),
				],
			},
			edit,
		);
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error.code).toBe("generation_rejected");
		expect(model.doGenerateCalls).toHaveLength(1);
	});

	test("401 от Codex Images — codex_auth_required", async () => {
		const edit = mock<EditFn>(async () => {
			throw new CodexImageError("Codex Images ответил 401", 401);
		});
		const { deps } = setup(
			{
				doGenerate: [
					toolCalls({
						id: "1",
						name: "generateImage",
						input: { prompt: "x", images: [] },
					}),
				],
			},
			edit,
		);
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error.code).toBe("codex_auth_required");
	});

	test("агент закончил текстом без generateImage — agent_no_generation", async () => {
		const { deps } = setup({ doGenerate: [text("Готово")] });
		const error = await runTurbo("кот", deps).catch((e) => e);
		expect(error.code).toBe("agent_no_generation");
	});

	test("лимит ходов без картинки — agent_no_generation", async () => {
		const loop = toolCalls({
			id: "1",
			name: "listFolder",
			input: { path: "пятерка" },
		});
		const { model, deps } = setup({ doGenerate: async () => loop });
		const error = await runTurbo("кот", { ...deps, maxSteps: 3 }).catch(
			(e) => e,
		);
		expect(error.code).toBe("agent_no_generation");
		expect(model.doGenerateCalls).toHaveLength(3);
		expect(TURBO_MAX_STEPS).toBeGreaterThan(3);
	});

	test("сбой модели — agent_failed, 401 провайдера — codex_auth_required", async () => {
		const failing = (status: number) =>
			setup({
				doGenerate: async () => {
					throw new APICallError({
						message: "boom",
						url: "https://chatgpt.com/backend-api/codex/responses",
						requestBodyValues: {},
						statusCode: status,
						isRetryable: false,
					});
				},
			}).deps;
		const failed = await runTurbo("кот", failing(500)).catch((e) => e);
		expect(failed.code).toBe("agent_failed");
		const unauthorized = await runTurbo("кот", failing(401)).catch((e) => e);
		expect(unauthorized.code).toBe("codex_auth_required");
	});

	test("ёлочки в точном тексте уходят генератору прямыми кавычками", async () => {
		const { edit, deps } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: {
						prompt: "A pug holds a poster with the exact text «СЛАВА 42»",
						images: [],
					},
				}),
			],
		});

		const result = await runTurbo("плакат со словами", deps);

		const expected = 'A pug holds a poster with the exact text "СЛАВА 42"';
		expect(edit.mock.calls[0]![0].prompt).toBe(expected);
		expect(result.prompt).toBe(expected);
	});

	test("превышение времени — agent_timeout", async () => {
		const { deps } = setup({
			doGenerate: async ({ abortSignal }) => {
				await new Promise((resolve, reject) => {
					const timer = setTimeout(resolve, 500);
					abortSignal?.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(abortSignal.reason);
					});
				});
				return text("поздно");
			},
		});
		const error = await runTurbo("кот", { ...deps, timeoutMs: 20 }).catch(
			(e) => e,
		);
		expect(error.code).toBe("agent_timeout");
	});
});

describe("systemVersionOf", () => {
	test("хеш стабилен и 16 hex-символов", () => {
		expect(systemVersionOf("a")).toBe(systemVersionOf("a"));
		expect(systemVersionOf("a")).toMatch(/^[0-9a-f]{16}$/);
		expect(systemVersionOf("a")).not.toBe(systemVersionOf("b"));
	});
});
