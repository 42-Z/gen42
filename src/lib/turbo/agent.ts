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
 * Запрос без текста: слов в кадре нет, а число 42 агент ставит сам и только там,
 * где ему место. Общая строка обогащения («два-три раза») заставляла расставлять
 * число по плану в каждом кадре.
 */
const NO_TEXT_LINE =
	"TEXT: none — no words or letters anywhere in the frame. Use the number 42 only as a natural sign on a vehicle, a patch, a jersey or a house number: once or twice at most, and skip it when the scene has no natural place for it.";

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
		noTextLine: NO_TEXT_LINE,
		textRequested,
		exactTexts,
		textCandidates: textRequested ? extractCapsPhrases(userInput) : [],
	});
}
