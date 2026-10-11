import { validateEnhancedPrompt } from "../src/lib/prompts/contract";
import {
	extractQuotedTexts,
	missingDetails,
	requestsText,
} from "../src/lib/prompts/style-hints";

interface PromptInput {
	prompt: string;
}

interface PromptOutput {
	prompt: string;
}

export function contractScorer({
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	const verdict = validateEnhancedPrompt(output.prompt);
	return {
		name: "contract",
		score: verdict.ok ? 1 : 0,
		metadata: { reason: verdict.reason ?? null },
	};
}

export function has42Scorer({
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	return { name: "has-42", score: /42/.test(output.prompt) ? 1 : 0 };
}

export function lengthBandScorer(min: number, max: number) {
	return ({ output }: { input: PromptInput; output: PromptOutput }) => {
		const words = output.prompt.split(/\s+/).filter(Boolean).length;
		return {
			name: "length-band",
			score: words >= min && words <= max ? 1 : 0,
			metadata: { words },
		};
	};
}

export function heroFirstScorer({
	input,
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	const missing = missingDetails(input.prompt, output.prompt);
	return {
		name: "hero-first",
		score: missing.length === 0 ? 1 : 0,
		metadata: { missing },
	};
}

export function noUnrequestedTextScorer({
	input,
	output,
}: {
	input: PromptInput;
	output: PromptOutput;
}) {
	// текст просили — цитаты допустимы; не просили — найденные цитаты минус
	if (requestsText(input.prompt)) {
		return { name: "no-unrequested-text", score: 1 };
	}
	const quotes = extractQuotedTexts(output.prompt);
	return {
		name: "no-unrequested-text",
		score: quotes.length === 0 ? 1 : 0,
		metadata: { quotes },
	};
}
