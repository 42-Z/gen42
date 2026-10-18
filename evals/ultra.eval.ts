import { Eval, initDataset } from "braintrust";
import { toGeneratorQuotes } from "../src/lib/prompts/style-hints";
import { buildUltraSystem } from "../src/lib/prompts/ultra.system";
import { listObjects, readObject } from "../src/lib/storage";
import { initTracing } from "../src/lib/tracing";
import { buildAgentMessage, systemVersionOf } from "../src/lib/ultra/agent";
import {
	createUltraAgent,
	runUltraAgent,
} from "../src/lib/ultra/agent-definition";
import { CodexAgentModel } from "../src/lib/ultra/codex-agent-model";
import {
	ULTRA_AGENT_MODEL,
	ULTRA_AGENT_TIMEOUT_MS,
} from "../src/lib/ultra/constants";
import { Library } from "../src/lib/ultra/library";
import { checkImageArguments, readForAgent } from "../src/lib/ultra/ops";
import {
	parseUltraReasoning,
	ULTRA_REASONING_LEVELS,
} from "../src/lib/ultra/reasoning";
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
/** Модель агента для сравнения: `ULTRA_EVAL_MODEL=gpt-6.1-sol`; прод всегда берёт ULTRA_AGENT_MODEL */
const agentModelId = process.env.ULTRA_EVAL_MODEL ?? ULTRA_AGENT_MODEL;
/** Уровень рассуждения: `ULTRA_EVAL_REASONING=xhigh` (medium, high, xhigh, max); по умолчанию `high` */
const agentReasoning = parseUltraReasoning(process.env.ULTRA_EVAL_REASONING);
if (!agentReasoning) {
	throw new Error(
		`ULTRA_EVAL_REASONING: ожидается ${ULTRA_REASONING_LEVELS.join(", ")}`,
	);
}
/** Срок агента в мс: `ULTRA_EVAL_AGENT_TIMEOUT_MS=600000`; по умолчанию прод-значение */
const agentTimeoutMs = Number(
	process.env.ULTRA_EVAL_AGENT_TIMEOUT_MS ?? ULTRA_AGENT_TIMEOUT_MS,
);
if (!Number.isFinite(agentTimeoutMs) || agentTimeoutMs <= 0) {
	throw new Error(
		"ULTRA_EVAL_AGENT_TIMEOUT_MS: ожидается положительное число миллисекунд",
	);
}
const version = systemVersionOf(buildUltraSystem(""));

interface UltraInput {
	prompt: string;
}

interface UltraOutput {
	prompt: string;
	tokens: number | null;
	seconds: number;
	randomPicks: unknown[];
	inputImages: string[];
	model: string;
	reasoning: string;
}

await Eval<UltraInput, UltraOutput>("Gen42", {
	experimentName: `ultra-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
	data: async () => {
		const rows = await initDataset("Gen42", {
			dataset: "ultra-prompts",
		}).fetchedData();
		const limit = Number(process.env.EVAL_FIRST ?? rows.length);
		return rows.slice(0, limit).map((row) => ({ input: row.input }));
	},
	task: async (input) => {
		const started = Date.now();
		// агент тот же, что в воркфлоу; исполнители здесь обычные функции
		const agent = createUltraAgent({
			model: new CodexAgentModel(agentModelId),
			reasoning: agentReasoning,
			system: buildUltraSystem(await library.describeTree()),
			executors: {
				listFolder: async ({ path }) => library.listFolder(path),
				readFile: async ({ path }) => readForAgent(library, path),
				checkImage: async (imageInput) =>
					checkImageArguments(library, imageInput),
			},
		});
		const run = await runUltraAgent(agent, buildAgentMessage(input.prompt), {
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
