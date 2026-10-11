import { Eval, initDataset } from "braintrust";
import { toGeneratorQuotes } from "../src/lib/prompts/style-hints";
import { buildTurboSystem } from "../src/lib/prompts/turbo.system";
import { listObjects, readObject } from "../src/lib/storage";
import { initTracing } from "../src/lib/tracing";
import { buildAgentMessage, systemVersionOf } from "../src/lib/turbo/agent";
import {
	createTurboAgent,
	runTurboAgent,
} from "../src/lib/turbo/agent-definition";
import { CodexAgentModel } from "../src/lib/turbo/codex-agent-model";
import {
	TURBO_AGENT_MODEL,
	TURBO_AGENT_TIMEOUT_MS,
} from "../src/lib/turbo/constants";
import { Library } from "../src/lib/turbo/library";
import { checkImageArguments, readForAgent } from "../src/lib/turbo/ops";
import {
	parseTurboReasoning,
	TURBO_REASONING_LEVELS,
} from "../src/lib/turbo/reasoning";
import {
	has42Scorer,
	heroFirstScorer,
	lengthBandScorer,
	noUnrequestedTextScorer,
} from "./scorers";

initTracing();

// `bt eval` несовместим с Bun-стеком проекта (его runner — tsx/vite-node), поэтому
// официальный фолбэк из доков Braintrust: запуск файла своим тулчейном
const library = new Library({ list: listObjects, read: readObject });
/** Модель агента для сравнения: `TURBO_EVAL_MODEL=gpt-6.1-sol`; прод всегда берёт TURBO_AGENT_MODEL */
const agentModelId = process.env.TURBO_EVAL_MODEL ?? TURBO_AGENT_MODEL;
/** Уровень рассуждения: `TURBO_EVAL_REASONING=xhigh` (medium, high, xhigh, max); по умолчанию `high` */
const agentReasoning = parseTurboReasoning(process.env.TURBO_EVAL_REASONING);
if (!agentReasoning) {
	throw new Error(
		`TURBO_EVAL_REASONING: ожидается ${TURBO_REASONING_LEVELS.join(", ")}`,
	);
}
/** Срок агента в мс: `TURBO_EVAL_AGENT_TIMEOUT_MS=600000`; по умолчанию прод-значение */
const agentTimeoutMs = Number(
	process.env.TURBO_EVAL_AGENT_TIMEOUT_MS ?? TURBO_AGENT_TIMEOUT_MS,
);
if (!Number.isFinite(agentTimeoutMs) || agentTimeoutMs <= 0) {
	throw new Error(
		"TURBO_EVAL_AGENT_TIMEOUT_MS: ожидается положительное число миллисекунд",
	);
}
const version = systemVersionOf(buildTurboSystem(""));

interface TurboInput {
	prompt: string;
}

interface TurboOutput {
	prompt: string;
	tokens: number | null;
	seconds: number;
	randomPicks: unknown[];
	inputImages: string[];
	model: string;
	reasoning: string;
}

await Eval<TurboInput, TurboOutput>("Gen42", {
	experimentName: `turbo-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
	data: async () => {
		const rows = await initDataset("Gen42", {
			dataset: "turbo-prompts",
		}).fetchedData();
		const limit = Number(process.env.EVAL_FIRST ?? rows.length);
		return rows.slice(0, limit).map((row) => ({ input: row.input }));
	},
	task: async (input) => {
		const started = Date.now();
		// агент тот же, что в воркфлоу; исполнители здесь обычные функции
		const agent = createTurboAgent({
			model: new CodexAgentModel(agentModelId),
			reasoning: agentReasoning,
			system: buildTurboSystem(await library.describeTree()),
			executors: {
				listFolder: async ({ path }) => library.listFolder(path),
				readFile: async ({ path }) => readForAgent(library, path),
				checkImage: async (imageInput) =>
					checkImageArguments(library, imageInput),
			},
		});
		const run = await runTurboAgent(agent, buildAgentMessage(input.prompt), {
			timeoutMs: agentTimeoutMs,
		});
		const accepted = run.accepted;
		if (!accepted) {
			throw new Error("Агент завершил работу, не вызвав generateImage");
		}
		return {
			prompt: toGeneratorQuotes(accepted.prompt),
			tokens: run.tokens ?? null,
			seconds: Math.round((Date.now() - started) / 1000),
			randomPicks: run.randomPicks,
			inputImages: accepted.images,
			model: agentModelId,
			reasoning: agentReasoning,
		};
	},
	scores: [
		has42Scorer,
		heroFirstScorer,
		noUnrequestedTextScorer,
		lengthBandScorer(500, 950),
	],
	metadata: { model: agentModelId, reasoning: agentReasoning, version },
	maxConcurrency: 1,
});
process.exit(0);
