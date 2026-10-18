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
import {
	TOO_MANY_REQUESTS_ERROR,
	TooManyRunningError,
} from "../generation-limits";
import { type StartRunDeps, startRun } from "../start-run";
import { ULTRA_PUBLIC_ERROR } from "../ultra/errors";

function makeDeps(overrides: Partial<StartRunDeps> = {}) {
	let clock = 1_000;
	const defaults = {
		startRecord: mock(async () => "gen-1"),
		chargeCredits: mock(
			async (_p: { id: string; userId: string; cost: number }) => {},
		),
		startWorkflow: mock(async (_id: string) => {}),
		failRecord: mock(
			async (_p: { id: string; error: unknown; durationMs: number }) => {},
		),
		now: () => (clock += 500),
	};
	return { ...defaults, ...overrides } as typeof defaults;
}

const INPUT = { userId: "u1", engine: "krea" as const, cost: 1 };

describe("startRun", () => {
	beforeEach(() => {
		spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		mock.restore();
	});

	test("успех: строка, списание, воркфлоу, ответ 202 с движком и ценой", async () => {
		const deps = makeDeps();

		const outcome = await startRun(INPUT, deps);

		expect(deps.chargeCredits).toHaveBeenCalledWith({
			id: "gen-1",
			userId: "u1",
			cost: 1,
		});
		expect(deps.startWorkflow).toHaveBeenCalledWith("gen-1");
		expect(outcome).toEqual({
			status: 202,
			body: { id: "gen-1", engine: "krea", cost: 1 },
		});
		expect(deps.failRecord).not.toHaveBeenCalled();
	});

	test("потолок идущих: 429 текстом лимита запросов, закрывать и списывать нечего", async () => {
		const deps = makeDeps({
			startRecord: mock(async () => {
				throw new TooManyRunningError();
			}),
		});

		const outcome = await startRun(INPUT, deps);

		expect(outcome).toEqual({
			status: 429,
			body: { error: TOO_MANY_REQUESTS_ERROR },
		});
		expect(deps.chargeCredits).not.toHaveBeenCalled();
		expect(deps.startWorkflow).not.toHaveBeenCalled();
		expect(deps.failRecord).not.toHaveBeenCalled();
	});

	test("мало кредитов: 402, строка закрыта, воркфлоу не стартует", async () => {
		const deps = makeDeps({
			chargeCredits: mock(async () => {
				throw new InsufficientCreditsError();
			}),
		});

		const outcome = await startRun(INPUT, deps);

		expect(outcome).toEqual({
			status: 402,
			body: { error: "Недостаточно кредитов" },
		});
		expect(deps.startWorkflow).not.toHaveBeenCalled();
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
	});

	test("сбой старта воркфлоу после списания: возврат и общее сообщение", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
		});

		const outcome = await startRun(INPUT, deps);

		expect(outcome).toEqual({
			status: 502,
			body: { error: ULTRA_PUBLIC_ERROR },
		});
		expect(deps.failRecord).toHaveBeenCalledTimes(1);
		expect(deps.failRecord.mock.calls[0]![0]).toMatchObject({ id: "gen-1" });
	});

	test("сбой закрытия строки не подменяет ответ", async () => {
		const deps = makeDeps({
			startWorkflow: mock(async () => {
				throw new Error("очередь недоступна");
			}),
			failRecord: mock(async () => {
				throw new Error("база недоступна");
			}),
		});

		expect((await startRun(INPUT, deps)).status).toBe(502);
	});
});
