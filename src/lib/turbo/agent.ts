import { createHash } from "node:crypto";
import { buildUserMessage } from "../prompts/anchors";
import {
	extractCapsPhrases,
	extractQuotedTexts,
	requestsText,
} from "../prompts/style-hints";

export function systemVersionOf(template: string): string {
	return createHash("sha256").update(template).digest("hex").slice(0, 16);
}

/**
 * Сообщение пользователя для агента: запрос, признак текста и точные цитаты.
 * Случайных якорей канона здесь нет: они тянули каждый кадр к одному набору
 * (золото, трактор, дирижабль), а идею агент должен придумывать сам.
 */
export function buildAgentMessage(userInput: string): string {
	const exactTexts = extractQuotedTexts(userInput);
	const textRequested = requestsText(userInput) || exactTexts.length > 0;
	// лозунги капсом приходят так же, как в обычном обогащении: их обещает канон
	return buildUserMessage(userInput, null, {
		textRequested,
		exactTexts,
		textCandidates: textRequested ? extractCapsPhrases(userInput) : [],
	});
}
