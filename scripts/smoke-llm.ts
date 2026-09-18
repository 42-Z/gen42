import {
	getAvailableKey,
	isLlmProvider,
	updateKeyRateLimit,
} from "../src/lib/keys";
import { callLlm } from "../src/lib/llm";

const arg = process.argv[2] ?? "poolside";
if (!isLlmProvider(arg)) {
	console.error(
		`Неизвестный LLM-провайдер: ${arg} (доступны: poolside, inception)`,
	);
	process.exit(1);
}

const key = await getAvailableKey(arg);
const started = Date.now();
const result = await callLlm({
	provider: arg,
	system: "You write one vivid English sentence. Output only the sentence.",
	user: "A pug in a leopard coat rides a neon scooter.",
	apiKey: key.key,
});
console.log("provider:", arg);
console.log("duration_ms:", Date.now() - started);
console.log("text:", result.text);
console.log("usage:", result.usage);
console.log("rate_limit:", result.rateLimit);
await updateKeyRateLimit(key.id, {
	...result.rateLimit,
	...result.usage,
});
process.exit(0);
