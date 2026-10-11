import { Eval, initDataset } from "braintrust";
import { enhancePrompt } from "../src/lib/enhance";
import { STYLE_VERSION } from "../src/lib/prompts";
import { initTracing } from "../src/lib/tracing";
import {
	contractScorer,
	has42Scorer,
	heroFirstScorer,
	lengthBandScorer,
	noUnrequestedTextScorer,
} from "./scorers";

initTracing();

interface Style42Input {
	prompt: string;
}

// `bt eval` несовместим с Bun-стеком проекта (его runner — tsx/vite-node), поэтому
// официальный фолбэк из доков Braintrust: запуск файла своим тулчейном
await Eval<Style42Input, Awaited<ReturnType<typeof enhancePrompt>>>("Gen42", {
	experiment: `style42-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
	data: initDataset("Gen42", { dataset: "style42-prompts" }),
	task: async (input) => enhancePrompt(input.prompt),
	scores: [
		contractScorer,
		has42Scorer,
		heroFirstScorer,
		noUnrequestedTextScorer,
		lengthBandScorer(180, 320),
	],
	metadata: { style_version: STYLE_VERSION },
	maxConcurrency: 2,
});
process.exit(0);
