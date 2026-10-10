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
 * Запрос без текста: слов в кадре нет, а знак сообщества (число 42, корона,
 * лавровый венок) агент ставит сам, на вещах, которым он к лицу. Общая строка
 * обогащения («два-три раза») задавала число по плану, а не по замыслу.
 */
const NO_TEXT_LINE =
	"TEXT: not specified — the user wrote no exact words. Words appear in the frame only when the scene itself calls for them (a line someone shouts or grumbles, a banner, a sign, a speech bubble); then invent them yourself, at most three short lines of one to four words, each in the voice of whoever says it and on its own carrier. Otherwise no words or letters anywhere, except the printed marks of real branded goods (a bottle, a speaker, a noodle pack), which are part of the object. The number 42 and the community emblems are not words: put them on the things that belong to the 42 world, large and one per object, each in its own place and form.";

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
