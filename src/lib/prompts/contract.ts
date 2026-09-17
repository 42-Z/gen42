export interface ContractResult {
	ok: boolean;
	reason?: string;
}

const MAX_LENGTH = 1500;
const MIN_WORDS = 40;

const PREAMBLE =
	/^(?:sure|certainly|of course|here(?:'s| is| are)|prompt|enhanced prompt|output|final prompt)\b[^.!?\n]*[:.!?\n]\s*/i;

const QUOTED = /«[^»]*»|“[^”]*”|"[^"]*"|'[^']*'/g;
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const CYRILLIC = /[\u0400-\u04ff]/;

function closeQuotes(text: string): string {
	const openings = (text.match(/«/g) ?? []).length;
	const closings = (text.match(/»/g) ?? []).length;
	if (openings <= closings) return text;
	const lastOpen = text.lastIndexOf("«");
	return text.slice(0, lastOpen).trim();
}

function truncateAtSentence(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const slice = text.slice(0, limit);
	const lastStop = Math.max(
		slice.lastIndexOf(". "),
		slice.lastIndexOf("! "),
		slice.lastIndexOf("? "),
	);
	if (lastStop > limit * 0.5) return closeQuotes(slice.slice(0, lastStop + 1));
	const lastSpace = slice.lastIndexOf(" ");
	return closeQuotes(
		`${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim()}…`,
	);
}

export function sanitizeEnhancedPrompt(raw: string): string {
	let text = raw.trim();

	text = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "");
	text = text.trim();

	if (
		(text.startsWith('"') && text.endsWith('"')) ||
		(text.startsWith("«") && text.endsWith("»"))
	) {
		text = text.slice(1, -1).trim();
	}

	while (PREAMBLE.test(text)) {
		text = text.replace(PREAMBLE, "").trim();
	}

	text = text
		.replace(/\s*\n+\s*/g, " ")
		.replace(/\s{2,}/g, " ")
		.trim();

	return truncateAtSentence(text, MAX_LENGTH);
}

function stripQuoted(text: string): string {
	return text.replace(QUOTED, " ");
}

export function validateEnhancedPrompt(text: string): ContractResult {
	if (!text) return { ok: false, reason: "empty" };

	const words = text.split(/\s+/).filter(Boolean).length;
	if (words < MIN_WORDS)
		return { ok: false, reason: `too short: ${words} words` };

	if (text.includes("```")) return { ok: false, reason: "markdown fence" };

	const bare = stripQuoted(text);
	if (CJK.test(bare)) return { ok: false, reason: "cjk outside quotes" };
	if (CYRILLIC.test(bare))
		return { ok: false, reason: "cyrillic outside quotes" };

	return { ok: true };
}
