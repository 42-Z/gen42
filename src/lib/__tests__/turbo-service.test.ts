import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { InsufficientCreditsError } from "../credits";
import type { TurboResult } from "../turbo/agent";
import { TURBO_PUBLIC_ERROR, TurboError } from "../turbo/errors";
import {
	generateTurbo,
	parseImageSize,
	type TurboServiceDeps,
} from "../turbo/service";

const RESULT: TurboResult = {
	png: new Uint8Array([1, 2, 3]),
	prompt: "The person from Image 1 on a throne",
	inputImages: ["пятерка/a.png"],
	size: "1024x1536",
	inputTokens: 100,
	outputTokens: 50,
	durationMs: 90_000,
	systemVersion: "abcdef0123456789",
};

function makeDeps(overrides: Partial<TurboServiceDeps> = {}) {
	let clock = 1_000;
	const deps = {
		deductCredits: mock(async () => 90),
		refundCredits: mock(async () => {}),
		run: mock(async () => RESULT),
		storeImage: mock(async () => ({
			key: "generations/u1/1.png",
			url: "https://s3/img",
		})),
		recordCompleted: mock(async () => {}),
		recordFailed: mock(async () => {}),
		onAuthFailure: mock(async () => {}),
		now: () => (clock += 500),
		newId: () => "gen-1",
		...overrides,
	};
	return deps as typeof deps & TurboServiceDeps;
}

describe("generateTurbo", () => {
	// сервис намеренно логирует сбои; в выводе тестов они не нужны
	beforeEach(() => {
		spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		mock.restore();
	});

	test("успех: списывает 10, сохраняет картинку и пишет историю", async () => {
		const deps = makeDeps();
		const outcome = await generateTurbo(
			{ userId: "u1", prompt: "пятёрка на троне" },
			deps,
		);

		expect(deps.deductCredits).toHaveBeenCalledWith("u1", 10);
		expect(deps.refundCredits).not.toHaveBeenCalled();
		expect(outcome).toEqual({
			status: 200,
			body: {
				id: "gen-1",
				image_url: "https://s3/img",
				seed: null,
				duration: 500,
				engine: "turbo",
				cost: 10,
			},
		});
		expect(deps.recordCompleted).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			prompt: "пятёрка на троне",
			enhancedPrompt: "The person from Image 1 on a throne",
			imageKey: "generations/u1/1.png",
			inputImages: ["пятерка/a.png"],
			width: 1024,
			height: 1536,
			durationMs: 500,
			agentTokens: 150,
			systemVersion: "abcdef0123456789",
			cost: 10,
		});
	});

	test("мало кредитов: 402, агент не запускается, возврата нет", async () => {
		const deps = makeDeps({
			deductCredits: mock(async () => {
				throw new InsufficientCreditsError();
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome).toEqual({
			status: 402,
			body: { error: "Недостаточно кредитов" },
		});
		expect(deps.run).not.toHaveBeenCalled();
		expect(deps.refundCredits).not.toHaveBeenCalled();
		expect(deps.recordFailed).toHaveBeenCalledTimes(1);
	});

	test("отказ генерации: возврат, запись failed с промптом, общее сообщение", async () => {
		const error = new TurboError(
			"generation_rejected",
			"Codex Images ответил 400",
			{
				details: { prompt: "final prompt", inputImages: ["пятерка/a.png"] },
			},
		);
		const deps = makeDeps({
			run: mock(async () => {
				throw error;
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
		expect(deps.refundCredits).toHaveBeenCalledWith("u1", 10);
		expect(deps.recordFailed).toHaveBeenCalledWith({
			userId: "u1",
			prompt: "x",
			enhancedPrompt: "final prompt",
			inputImages: ["пятерка/a.png"],
			durationMs: 500,
			error,
		});
		expect(deps.onAuthFailure).not.toHaveBeenCalled();
		expect(deps.storeImage).not.toHaveBeenCalled();
	});

	test("умерший вход Codex помечается для админки", async () => {
		const error = new TurboError("codex_auth_required", "refresh_failed");
		const deps = makeDeps({
			run: mock(async () => {
				throw error;
			}),
		});
		await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(deps.onAuthFailure).toHaveBeenCalledWith(error);
	});

	test("любая другая ошибка тоже возвращает кредиты", async () => {
		const deps = makeDeps({
			storeImage: mock(async () => {
				throw new Error("S3 недоступен");
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome.status).toBe(502);
		expect(deps.refundCredits).toHaveBeenCalledWith("u1", 10);
		expect(deps.recordCompleted).not.toHaveBeenCalled();
		expect(deps.recordFailed).toHaveBeenCalledTimes(1);
	});

	test("возврат кредитов повторяется после сбоя", async () => {
		let attempts = 0;
		const deps = makeDeps({
			run: mock(async () => {
				throw new TurboError("agent_failed", "boom");
			}),
			refundCredits: mock(async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("db down");
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
		expect(deps.refundCredits).toHaveBeenCalledTimes(2);
	});

	test("сбой возврата или записи не подменяет ответ пользователю", async () => {
		const deps = makeDeps({
			run: mock(async () => {
				throw new TurboError("agent_failed", "boom");
			}),
			refundCredits: mock(async () => {
				throw new Error("db down");
			}),
			recordFailed: mock(async () => {
				throw new Error("db down");
			}),
		});
		const outcome = await generateTurbo({ userId: "u1", prompt: "x" }, deps);
		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
	});
});

describe("parseImageSize", () => {
	test("разбирает размер сервера, остальное — квадрат", () => {
		expect(parseImageSize("1024x1536")).toEqual({ width: 1024, height: 1536 });
		expect(parseImageSize(null)).toEqual({ width: 1024, height: 1024 });
		expect(parseImageSize("auto")).toEqual({ width: 1024, height: 1024 });
	});
});
