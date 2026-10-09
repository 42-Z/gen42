import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	checkImageStep,
	completeStep,
	drawStep,
	failStep,
	listFolderStep,
	prepareStep,
	readFileStep,
} from "../../../workflows/turbo/steps";
import { describeGenerationError } from "../generation-error";
import { CodexImageError } from "../turbo/codex-images";
import { setTurboRuntime } from "../turbo/workflow-runtime";
import { makeRuntime, RESULT_PNG } from "./helpers/turbo-fakes";

beforeEach(() => {
	// шаги намеренно логируют сбои; в выводе тестов они не нужны
	spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => setTurboRuntime(null));

describe("шаги чтения", () => {
	test("prepareStep собирает инструкцию с деревом библиотеки и сообщение агенту", async () => {
		setTurboRuntime(makeRuntime());
		const prepared = await prepareStep({ prompt: "пятёрка на троне" });
		expect(prepared.system).toContain("пятерка/");
		expect(prepared.message).toContain("пятёрка на троне");
		expect(prepared.systemVersion).toMatch(/^[0-9a-f]{16}$/);
	});

	test("listFolderStep, readFileStep, checkImageStep работают через библиотеку", async () => {
		setTurboRuntime(makeRuntime());
		expect(await listFolderStep({ path: "пятерка" })).toMatchObject({
			ok: true,
			path: "пятерка",
		});
		expect(await readFileStep({ path: "пятерка/a.png" })).toMatchObject({
			ok: true,
			mediaType: "image/webp",
		});
		expect(
			await checkImageStep({ prompt: "x", images: ["пятерка/нет.png"] }),
		).toMatchObject({ ok: false, retryable: true });
	});
});

describe("drawStep", () => {
	test("без повторов: платформа не должна рисовать дважды", () => {
		expect(drawStep.maxRetries).toBe(0);
	});

	test("успех: картинка в хранилище, наружу только ключ", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		const result = await drawStep({
			userId: "u1",
			prompt: "A pug, Image 1",
			images: ["пятерка/a.png"],
		});
		expect(result).toEqual({
			ok: true,
			key: "generations/u1/1700000000000.png",
			size: "1024x1536",
			prompt: "A pug, Image 1",
			inputImages: ["пятерка/a.png"],
		});
		expect(runtime.storeImage).toHaveBeenCalledWith(
			"generations/u1/1700000000000.png",
			RESULT_PNG,
		);
	});

	test("отказ Codex возвращается данными, а не бросается", async () => {
		setTurboRuntime(
			makeRuntime({
				edit: async () => {
					throw new CodexImageError("Codex Images ответил 400: policy", 400);
				},
			}),
		);
		const result = await drawStep({
			userId: "u1",
			prompt: "x",
			images: ["пятерка/a.png"],
		});
		expect(result).toMatchObject({
			ok: false,
			failure: {
				code: "generation_rejected",
				prompt: "x",
				inputImages: ["пятерка/a.png"],
			},
		});
	});

	test("401 Codex Images — codex_auth_required", async () => {
		setTurboRuntime(
			makeRuntime({
				edit: async () => {
					throw new CodexImageError("Codex Images ответил 401", 401);
				},
			}),
		);
		const result = await drawStep({ userId: "u1", prompt: "x", images: [] });
		expect(result).toMatchObject({
			ok: false,
			failure: { code: "codex_auth_required" },
		});
	});

	test("сбой хранилища после рисования — agent_failed с промптом", async () => {
		setTurboRuntime(
			makeRuntime({
				storeImage: async () => {
					throw new Error("S3 недоступен");
				},
			}),
		);
		const result = await drawStep({ userId: "u1", prompt: "x", images: [] });
		expect(result).toMatchObject({
			ok: false,
			failure: { code: "agent_failed", prompt: "x" },
		});
	});
});

describe("completeStep", () => {
	test("пишет результат в историю", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		await completeStep({
			id: "gen-1",
			enhancedPrompt: "A pug, Image 1",
			imageKey: "generations/u1/1.png",
			size: "1024x1536",
			inputImages: ["пятерка/a.png"],
			tokens: 30,
			durationMs: 90_000,
			systemVersion: "abcdef0123456789",
		});
		expect(runtime.completeGeneration).toHaveBeenCalledWith({
			id: "gen-1",
			imageKey: "generations/u1/1.png",
			seed: null,
			width: 1024,
			height: 1536,
			enhancedPrompt: "A pug, Image 1",
			durationMs: 90_000,
			llmModel: "gpt-6-luna",
			llmTokens: 30,
			enhanceMs: 90_000,
			styleVersion: "abcdef0123456789",
			inputImages: ["пятерка/a.png"],
		});
	});
});

describe("failStep", () => {
	const failure = {
		code: "generation_rejected" as const,
		message: "policy",
		prompt: "A pug",
		inputImages: ["пятерка/a.png"],
	};

	test("закрывает строку с возвратом, пишет код и подробности", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		await failStep({ id: "gen-1", failure, durationMs: 5_000 });
		const params = runtime.failGeneration.mock.calls[0]![0] as {
			id: string;
			error: unknown;
			enhancedPrompt: string | null;
			inputImages: string[];
			durationMs: number;
			llmModel: string;
		};
		expect(params.id).toBe("gen-1");
		expect(describeGenerationError(params.error)).toBe(
			"generation_rejected: policy",
		);
		expect(params.enhancedPrompt).toBe("A pug");
		expect(params.inputImages).toEqual(["пятерка/a.png"]);
		expect(params.durationMs).toBe(5_000);
		expect(params.llmModel).toBe("gpt-6-luna");
		expect(runtime.recordCodexError).not.toHaveBeenCalled();
	});

	test("умерший вход Codex помечается для админки", async () => {
		const runtime = makeRuntime();
		setTurboRuntime(runtime);
		await failStep({
			id: "gen-1",
			failure: { ...failure, code: "codex_auth_required", message: "токен" },
			durationMs: 1,
		});
		expect(runtime.recordCodexError).toHaveBeenCalledWith(
			"codex_auth_required: токен",
		);
	});

	test("сбой пометки входа не ломает шаг", async () => {
		const runtime = makeRuntime({
			recordCodexError: async () => {
				throw new Error("база недоступна");
			},
		});
		setTurboRuntime(runtime);
		await failStep({
			id: "gen-1",
			failure: { ...failure, code: "codex_auth_required" },
			durationMs: 1,
		});
		expect(runtime.failGeneration).toHaveBeenCalledTimes(1);
	});
});
