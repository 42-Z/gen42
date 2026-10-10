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
import { TURBO_PUBLIC_ERROR } from "../turbo/errors";
import { type StartTurboDeps, startTurbo } from "../turbo/start";

type Args<K extends keyof StartTurboDeps> = Parameters<StartTurboDeps[K]>[0];

/** Зависимости с записью вызовов; подмена в `overrides` тоже должна быть моком */
function makeDeps(overrides: Partial<StartTurboDeps> = {}) {
	let clock = 1_000;
	const defaults = {
		startRecord: mock(async (_record: Args<"startRecord">) => "gen-1"),
		chargeCredits: mock(async (_params: Args<"chargeCredits">) => {}),
		startWorkflow: mock(async (_input: Args<"startWorkflow">) => {}),
		failRecord: mock(async (_params: Args<"failRecord">) => {}),
		now: () => (clock += 500),
	};
	return { ...defaults, ...overrides } as typeof defaults;
}

describe("startTurbo", () => {
	// сервис намеренно логирует сбои; в выводе тестов они не нужны
	beforeEach(() => {
		spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		mock.restore();
	});

	test("успех: строка, списание 10, запуск воркфлоу, ответ 202", async () => {
		const deps = makeDeps();

		const outcome = await startTurbo(
			{ userId: "u1", prompt: "пятёрка на троне" },
			deps,
		);

		expect(deps.startRecord).toHaveBeenCalledWith({
			userId: "u1",
			prompt: "пятёрка на троне",
		});
		expect(deps.chargeCredits).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			cost: 10,
		});
		// уровень без выбора пользователя записан во вход воркфлоу явно
		expect(deps.startWorkflow).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			prompt: "пятёрка на троне",
			reasoning: "high",
		});
		expect(outcome).toEqual({
			status: 202,
			body: { id: "gen-1", engine: "turbo", cost: 10 },
		});
		expect(deps.failRecord).not.toHaveBeenCalled();
	});

	test("выбранный уровень рассуждения уходит в воркфлоу, цена не меняется", async () => {
		const deps = makeDeps();

		const outcome = await startTurbo(
			{ userId: "u1", prompt: "x", reasoning: "max" },
			deps,
		);

		expect(deps.startWorkflow).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			prompt: "x",
			reasoning: "max",
		});
		expect(deps.chargeCredits).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			cost: 10,
		});
		expect(outcome.status).toBe(202);
	});

	test("мало кредитов: 402, воркфлоу не запускается, строка закрыта", async () => {
		const deps = makeDeps({
			chargeCredits: mock(async () => {
				throw new InsufficientCreditsError();
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome).toEqual({
			status: 402,
			body: { error: "Недостаточно кредитов" },
		});
		expect(deps.startWorkflow).not.toHaveBeenCalled();
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
	});

	test("сбой запуска воркфлоу после списания: возврат и общее сообщение", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome).toEqual({
			status: 502,
			body: { error: TURBO_PUBLIC_ERROR },
		});
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
		expect(deps.failRecord.mock.calls[0]![0]).toMatchObject({ id: "gen-1" });
	});

	test("сбой создания строки: закрывать нечего", async () => {
		const deps = makeDeps({
			startRecord: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome.status).toBe(502);
		expect(deps.failRecord).not.toHaveBeenCalled();
		expect(deps.chargeCredits).not.toHaveBeenCalled();
	});

	test("клиентский id уходит в запись генерации", async () => {
		const deps = makeDeps();

		await startTurbo({ userId: "u1", prompt: "x", id: "client-id" }, deps);

		expect(deps.startRecord).toHaveBeenCalledWith({
			id: "client-id",
			userId: "u1",
			prompt: "x",
		});
	});

	test("сбой закрытия строки не подменяет ответ пользователю", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
			failRecord: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		const outcome = await startTurbo({ userId: "u1", prompt: "x" }, deps);

		expect(outcome.status).toBe(502);
	});
});
