import { describe, expect, mock, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import {
	createTurboAgent,
	pickAccepted,
	runTurboAgent,
} from "../turbo/agent-definition";
import { TURBO_MAX_STEPS } from "../turbo/constants";
import { Library } from "../turbo/library";
import { checkImageArguments, readForAgent } from "../turbo/ops";
import type { TurboToolExecutors } from "../turbo/tool-defs";
import { libraryStorage, text, toolCalls } from "./helpers/turbo-fakes";

function setup(
	steps: ConstructorParameters<typeof MockLanguageModelV4>[0],
	random?: () => number,
) {
	const library = new Library(libraryStorage());
	const executors = {
		listFolder: mock(({ path }: { path: string }) => library.listFolder(path)),
		readFile: mock(({ path }: { path: string }) => readForAgent(library, path)),
		checkImage: mock((input: { prompt: string; images: string[] }) =>
			checkImageArguments(library, input),
		),
	} satisfies TurboToolExecutors;
	const model = new MockLanguageModelV4(steps);
	const agent = createTurboAgent({
		model,
		system: "SYSTEM",
		executors,
		...(random ? { random } : {}),
	});
	return { model, executors, agent };
}

const good = { prompt: "A pug, Image 1", images: ["пятерка/a.png"] };

describe("runTurboAgent", () => {
	test("успех: параллельные listFolder и readFile, затем generateImage", async () => {
		const { model, executors, agent } = setup({
			doGenerate: [
				toolCalls(
					{ id: "1", name: "listFolder", input: { path: "пятерка" } },
					{
						id: "2",
						name: "readFile",
						input: { path: "пятерка/описания.txt" },
					},
				),
				toolCalls({ id: "3", name: "generateImage", input: good }),
			],
		});

		const run = await runTurboAgent(agent, "пятёрка на троне");

		expect(run.accepted).toEqual(good);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(executors.listFolder).toHaveBeenCalledTimes(1);
		expect(executors.readFile).toHaveBeenCalledTimes(1);
		expect(run.toolCalls.map((call) => call.toolName)).toEqual([
			"listFolder",
			"readFile",
			"generateImage",
		]);
		expect(run.tokens).toBe(30);
	});

	test("random: параллельные розыгрыши в одном раунде, выпавшее видно в randomPicks", async () => {
		const { model, agent } = setup(
			{
				doGenerate: [
					toolCalls(
						{
							id: "1",
							name: "random",
							input: { options: ["мамонт", "дирижабль", "регата"] },
						},
						{
							id: "2",
							name: "random",
							input: { options: ["рассвет", "ночь"] },
						},
						{ id: "3", name: "random", input: { options: ["одно"] } },
					),
					toolCalls({ id: "4", name: "generateImage", input: good }),
				],
			},
			() => 0.6,
		);

		const run = await runTurboAgent(agent, "сосед сверху");

		expect(run.accepted).toEqual(good);
		expect(model.doGenerateCalls).toHaveLength(2);
		// вызов с одним вариантом получил ошибку и в выпавшее не попал
		expect(run.randomPicks).toEqual([
			{ options: ["мамонт", "дирижабль", "регата"], value: "дирижабль" },
			{ options: ["рассвет", "ночь"], value: "ночь" },
		]);
	});

	test("ошибка аргументов — агент исправляется и получает принятие", async () => {
		const { model, agent } = setup({
			doGenerate: [
				toolCalls({
					id: "1",
					name: "generateImage",
					input: { prompt: "x", images: ["пятерка/нет.png"] },
				}),
				toolCalls({ id: "2", name: "generateImage", input: good }),
			],
		});

		const run = await runTurboAgent(agent, "пятёрка");

		expect(run.accepted).toEqual(good);
		expect(model.doGenerateCalls).toHaveLength(2);
	});

	test("третий отказ проверки подряд останавливает цикл без принятия", async () => {
		const bad = toolCalls({
			id: "1",
			name: "generateImage",
			input: { prompt: "x", images: ["пятерка/нет.png"] },
		});
		const { model, agent } = setup({ doGenerate: async () => bad });

		const run = await runTurboAgent(agent, "кот");

		expect(run.accepted).toBeNull();
		expect(model.doGenerateCalls).toHaveLength(3);
	});

	test("лимит ходов без принятия", async () => {
		const loop = toolCalls({
			id: "1",
			name: "listFolder",
			input: { path: "пятерка" },
		});
		const { model, agent } = setup({ doGenerate: async () => loop });

		const run = await runTurboAgent(agent, "кот");

		expect(run.accepted).toBeNull();
		expect(model.doGenerateCalls).toHaveLength(TURBO_MAX_STEPS);
	});

	test("два generateImage в одном ходу: берётся первый принятый", async () => {
		const second = { prompt: "Other, Image 1", images: [] };
		const { agent } = setup({
			doGenerate: [
				toolCalls(
					{ id: "1", name: "generateImage", input: good },
					{ id: "2", name: "generateImage", input: second },
				),
			],
		});

		const run = await runTurboAgent(agent, "кот");

		expect(run.accepted).toEqual(good);
	});

	test("ответ текстом без generateImage — нарушение toolChoice", async () => {
		const { agent } = setup({ doGenerate: [text("Готово")] });
		const error = await runTurboAgent(agent, "кот").catch((e) => e);
		expect(error.name).toBe("AI_ToolChoiceViolationError");
	});
});

describe("pickAccepted", () => {
	test("без принятых вызовов — null", () => {
		expect(pickAccepted([])).toBeNull();
		expect(
			pickAccepted([
				{
					toolCalls: [
						{ toolCallId: "1", toolName: "generateImage", input: good },
					],
					toolResults: [
						{
							toolCallId: "1",
							toolName: "generateImage",
							output: { ok: false, retryable: true, error: "x" },
						},
					],
				},
			]),
		).toBeNull();
	});
});
