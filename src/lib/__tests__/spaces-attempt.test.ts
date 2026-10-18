import { describe, expect, mock, spyOn, test } from "bun:test";
import { KeyExhaustedError, QueueTimeoutError } from "../hf";
import { AllKeysExhaustedError } from "../keys";
import { type AttemptDeps, runAttempt } from "../spaces/attempt";
import type { AttemptInput } from "../spaces/types";

const KEY = { id: "hf-1", name: "основной", key: "hf_secret" };
const INPUT: AttemptInput = {
	generationId: "gen-1",
	userId: "u1",
	engine: "krea",
	prompt: "A pug on a throne",
	model: "Turbo",
	width: 1024,
	height: 1024,
	steps: 8,
	seed: null,
	excludeKeyIds: ["hf-0"],
};

function makeDeps(overrides: Partial<AttemptDeps> = {}) {
	let clock = 1_700_000_000_000;
	const defaults = {
		getAvailableKey: mock(async (_o: { excludeIds: string[] }) => KEY),
		generateImage: mock(async (_p: unknown, _k: string) => ({
			imageUrl: "https://img.test/1.webp",
			seed: 77,
		})),
		refreshQuota: mock(
			async (_key: { id: string; key: string }, _lastError?: string) => {},
		),
		download: mock(async (_url: string) => ({
			bytes: new Uint8Array([1, 2, 3]),
			contentType: "image/webp",
		})),
		store: mock(async (_k: string, _b: Uint8Array, _t: string) => {}),
		now: () => (clock += 1000),
	};
	return { ...defaults, ...overrides } as typeof defaults;
}

describe("runAttempt", () => {
	test("успех: ключ HF, Space, скачивание, хранилище, квота", async () => {
		const deps = makeDeps();

		const outcome = await runAttempt(deps, INPUT);

		expect(deps.getAvailableKey).toHaveBeenCalledWith({
			excludeIds: ["hf-0"],
			generationId: "gen-1",
		});
		expect(deps.generateImage.mock.calls[0]![1]).toBe("hf_secret");
		expect(deps.generateImage.mock.calls[0]![0]).toMatchObject({
			engine: "krea",
			prompt: "A pug on a throne",
			model: "Turbo",
			width: 1024,
			height: 1024,
			steps: 8,
			seed: null,
		});
		expect(deps.download).toHaveBeenCalledWith("https://img.test/1.webp");
		expect(outcome).toMatchObject({
			ok: true,
			seed: 77,
			apiKeyId: "hf-1",
		});
		// ключ объекта: пользователь, время по часам попытки, расширение по типу
		const stored = deps.store.mock.calls[0]!;
		expect(stored[0]).toMatch(/^generations\/u1\/\d+\.webp$/);
		expect(stored[2]).toBe("image/webp");
		expect((outcome as { imageKey: string }).imageKey).toBe(stored[0]);
		expect(deps.refreshQuota).toHaveBeenCalledTimes(1);
	});

	test("нет доступных ключей: no_keys", async () => {
		const deps = makeDeps({
			getAvailableKey: mock(async () => {
				throw new AllKeysExhaustedError();
			}),
		});
		expect(await runAttempt(deps, INPUT)).toEqual({
			ok: false,
			reason: "no_keys",
		});
		expect(deps.generateImage).not.toHaveBeenCalled();
	});

	test("квота исчерпана: key_exhausted со статусом, квота ключа обновляется с текстом ошибки", async () => {
		const deps = makeDeps({
			generateImage: mock(async () => {
				throw new KeyExhaustedError(429, "ZeroGPU quota exceeded");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "key_exhausted",
			keyId: "hf-1",
			status: 429,
			message: "ZeroGPU quota exceeded",
		});
		expect(deps.refreshQuota).toHaveBeenCalledWith(
			KEY,
			"ZeroGPU quota exceeded",
		);
		expect(deps.store).not.toHaveBeenCalled();
	});

	test("таймаут очереди: queue_timeout, квота обновляется", async () => {
		const deps = makeDeps({
			generateImage: mock(async () => {
				throw new QueueTimeoutError("ZeroGPU queue: no gpu");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "queue_timeout",
			keyId: "hf-1",
			message: "ZeroGPU queue: no gpu",
		});
		expect(deps.refreshQuota).toHaveBeenCalledWith(
			KEY,
			"ZeroGPU queue: no gpu",
		);
	});

	test("прочая ошибка после выбора ключа: error с ключом, квота обновляется, этап в журнале", async () => {
		const log = spyOn(console, "error").mockImplementation(() => {});
		const deps = makeDeps({
			download: mock(async () => {
				throw new Error("Не удалось скачать изображение: 500");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "error",
			keyId: "hf-1",
			message: "Не удалось скачать изображение: 500",
		});
		expect(deps.refreshQuota).toHaveBeenCalledWith(KEY);
		expect(
			log.mock.calls.some((c) => String(c[0]).includes("скачивание")),
		).toBe(true);
		log.mockRestore();
	});

	test("сбой обновления квоты не отменяет уже сохранённую картинку", async () => {
		const log = spyOn(console, "error").mockImplementation(() => {});
		const deps = makeDeps({
			refreshQuota: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toMatchObject({ ok: true, apiKeyId: "hf-1" });
		log.mockRestore();
	});

	test("ошибка до выбора ключа: error без ключа, квота не трогается", async () => {
		const log = spyOn(console, "error").mockImplementation(() => {});
		const deps = makeDeps({
			getAvailableKey: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await runAttempt(deps, INPUT);

		expect(outcome).toEqual({
			ok: false,
			reason: "error",
			keyId: null,
			message: "база недоступна",
		});
		expect(deps.refreshQuota).not.toHaveBeenCalled();
		expect(
			log.mock.calls.some((c) => String(c[0]).includes("выбор ключа")),
		).toBe(true);
		log.mockRestore();
	});
});
