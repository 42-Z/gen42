import { describe, expect, test } from "bun:test";
import {
	addRun,
	canStart,
	dropRun,
	MAX_SERIES_RUNS,
	mergeRuns,
	parseSeriesIds,
	type Run,
	renameRun,
	restoreRuns,
	runningCount,
	type ServerRecord,
	seriesIds,
	settleRun,
} from "../series";

const run = (id: string, over: Partial<Run> = {}): Run => ({
	id,
	prompt: `промпт ${id}`,
	status: "running",
	resumed: false,
	deadline: 1_000,
	result: null,
	...over,
});
const done = (id: string): Run =>
	run(id, {
		status: "done",
		result: { image_url: `https://img/${id}`, seed: 1 },
	});

const record = (
	id: string,
	over: Partial<ServerRecord> = {},
): ServerRecord => ({
	id,
	status: "completed",
	prompt: `промпт ${id}`,
	image_url: `https://img/${id}`,
	seed: 7,
	error: null,
	created_at: "2026-10-18T10:00:00.000Z",
	...over,
});

describe("потолок", () => {
	test("считаются только идущие", () => {
		const runs = [run("a"), done("b"), run("c")];
		expect(runningCount(runs)).toBe(2);
	});

	test("запуск разрешён ниже потолка и запрещён на нём", () => {
		expect(canStart([run("a"), run("b"), run("c")])).toBe(true);
		expect(canStart([run("a"), run("b"), run("c"), run("d")])).toBe(false);
	});

	test("готовые рамки потолок не занимают", () => {
		expect(
			canStart([done("a"), done("b"), done("c"), done("d"), run("e")]),
		).toBe(true);
	});
});

describe("серия", () => {
	test("запуск при нуле идущих начинает серию заново", () => {
		expect(addRun([done("a"), done("b")], run("c")).map((r) => r.id)).toEqual([
			"c",
		]);
	});

	test("запуск при идущем добавляет рамку, новая первой", () => {
		expect(addRun([run("a"), done("b")], run("c")).map((r) => r.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	test("рамок серии не больше предела: уходят самые старые готовые, идущие остаются", () => {
		const many = [
			run("r1"),
			...Array.from({ length: MAX_SERIES_RUNS }, (_, i) => done(`d${i}`)),
		];
		const next = addRun(many, run("r2"));
		expect(next).toHaveLength(MAX_SERIES_RUNS);
		expect(next.map((r) => r.id)).toContain("r1");
		expect(next[0]!.id).toBe("r2");
		// самая старая готовая ушла
		expect(next.map((r) => r.id)).not.toContain(`d${MAX_SERIES_RUNS - 1}`);
	});

	test("если готовых нет, идущие не вытесняются", () => {
		const running = Array.from({ length: MAX_SERIES_RUNS }, (_, i) =>
			run(`r${i}`),
		);
		expect(addRun(running, run("new"))).toHaveLength(MAX_SERIES_RUNS + 1);
	});

	test("итог запуска: картинка, статус готово, признак возобновления снят", () => {
		const runs = settleRun([run("a", { resumed: true })], "a", {
			image_url: "https://img/a",
			seed: 5,
		});
		expect(runs[0]).toMatchObject({
			status: "done",
			resumed: false,
			result: { image_url: "https://img/a", seed: 5 },
		});
	});

	test("итог неизвестного запуска ничего не меняет", () => {
		const runs = [run("a")];
		expect(settleRun(runs, "zzz", { image_url: "x", seed: null })).toEqual(
			runs,
		);
	});

	test("запуск убирается по id, исходный список не меняется", () => {
		const runs = [run("a"), run("b")];
		expect(dropRun(runs, "a").map((r) => r.id)).toEqual(["b"]);
		expect(runs).toHaveLength(2);
	});

	test("id заменяется, когда сервер выдал другой", () => {
		expect(
			renameRun([run("a"), run("b")], "a", "srv-1").map((r) => r.id),
		).toEqual(["srv-1", "b"]);
	});
});

describe("восстановление после обновления страницы", () => {
	test("идущие продолжают ожидание с новым сроком и признаком возобновления", () => {
		const restored = restoreRuns(
			[record("a", { status: "running", image_url: null })],
			10_000,
			900_000,
		);
		expect(restored).toEqual([
			{
				id: "a",
				prompt: "промпт a",
				status: "running",
				resumed: true,
				deadline: 910_000,
				result: null,
			},
		]);
	});

	test("готовые возвращаются картинкой, неуспешные выпадают", () => {
		const restored = restoreRuns(
			[
				record("ok"),
				record("bad", { status: "failed", image_url: null, error: "x" }),
				record("noimg", { image_url: null }),
			],
			0,
			1,
		);
		expect(restored.map((r) => r.id)).toEqual(["ok"]);
		expect(restored[0]).toMatchObject({
			status: "done",
			result: { image_url: "https://img/ok", seed: 7 },
		});
	});

	test("записи без повторов, свежие первыми", () => {
		const restored = restoreRuns(
			[
				record("old", { created_at: "2026-10-18T09:00:00.000Z" }),
				record("new", { created_at: "2026-10-18T11:00:00.000Z" }),
				record("old", { created_at: "2026-10-18T09:00:00.000Z" }),
			],
			0,
			1,
		);
		expect(restored.map((r) => r.id)).toEqual(["new", "old"]);
	});

	test("слияние: текущие запуски впереди, дубли отбрасываются", () => {
		const merged = mergeRuns(
			[run("a")],
			[run("a", { resumed: true }), run("b")],
		);
		expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
		expect(merged[0]!.resumed).toBe(false);
	});
});

describe("хранение id серии", () => {
	test("id рамок по порядку", () => {
		expect(seriesIds([run("a"), done("b")])).toEqual(["a", "b"]);
	});

	test("разбор устойчив к мусору", () => {
		expect(parseSeriesIds(null)).toEqual([]);
		expect(parseSeriesIds("{не json")).toEqual([]);
		expect(parseSeriesIds('{"a":1}')).toEqual([]);
		expect(parseSeriesIds('["a",1,"",null,"b"]')).toEqual(["a", "b"]);
	});

	test("разбор ограничивает число id пределом серии", () => {
		const raw = JSON.stringify(
			Array.from({ length: MAX_SERIES_RUNS + 5 }, (_, i) => `id${i}`),
		);
		expect(parseSeriesIds(raw)).toHaveLength(MAX_SERIES_RUNS);
	});
});
