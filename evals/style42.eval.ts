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
// официальный фолбэк из доков Braintrust: запуск файла своим тулчейном.
// `EVAL_FIRST=N` ограничивает подмножество строк (аналог `bt eval --first`).
await Eval<Style42Input, Awaited<ReturnType<typeof enhancePrompt>>>("Gen42", {
	experimentName: `style42-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
	data: async () => {
		const rows = await initDataset("Gen42", {
			dataset: "style42-prompts",
		}).fetchedData();
		const limit = Number(process.env.EVAL_FIRST ?? rows.length);
		return rows.slice(0, limit).map((row) => ({ input: row.input }));
	},
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
