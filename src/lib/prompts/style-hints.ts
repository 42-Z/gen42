import { ANCHOR_CATEGORIES } from "./anchors";

export interface UserMediumHint {
	pattern: RegExp;
	phrase: string;
}

export const USER_MEDIUM_HINTS: readonly UserMediumHint[] = [
	{
		pattern: /фотореализм|фото-?реал|фотографи|photoreal|photo-?realistic/i,
		phrase: "hyper-detailed cinematic photograph",
	},
	{
		pattern: /аниме|anime|манга|manga/i,
		phrase: "anime poster with speed lines and impact bubbles",
	},
	{
		pattern:
			/детск(ий|ого|им) рисун|child'?s drawing|crayon|цветными карандашами|мелками/i,
		phrase: "crayon and colored-pencil children's drawing",
	},
	{
		pattern: /акварел|watercolou?r/i,
		phrase: "watercolor painting with soft washes and paper grain",
	},
	{
		pattern: /пиксель|pixel|вейпорвейв|vaporwave|8-?bit/i,
		phrase: "pixel-art vaporwave collage with iridescent glitches",
	},
	{
		pattern: /3d|3-d|трёхмерн|трехмерн|рендер|render/i,
		phrase: "glossy 3D render with toy-like proportions",
	},
	{
		pattern: /ренессанс|renaissance/i,
		phrase: "Renaissance oil painting on canvas with cracked varnish",
	},
	{
		pattern: /комикс|comic/i,
		phrase: "comic-book cover art with halftone dots",
	},
	{
		pattern: /масл(о|ян|ом)|oil painting|живопис/i,
		phrase: "thick oil painting with canvas texture",
	},
	{
		pattern: /поп-?арт|pop-?art/i,
		phrase: "pop-art screenprint with bold flat colors",
	},
];

const CLOSING_TAIL =
	"wide-angle poster composition, hyper-saturated gold-and-neon palette, absurd triumphant kitsch, no watermarks, no signature";

const ALL_MEDIUM_PHRASES = [
	...USER_MEDIUM_HINTS.map((hint) => hint.phrase),
	...ANCHOR_CATEGORIES.flatMap((category) =>
		category.key === "medium" ? [...category.values] : [],
	),
];

export function detectUserMedium(userInput: string): string | null {
	for (const hint of USER_MEDIUM_HINTS) {
		if (hint.pattern.test(userInput)) return hint.phrase;
	}
	return null;
}

export function hasMediumPhrase(text: string): boolean {
	const low = text.toLowerCase().replace(/[^a-z0-9\s'-]+/g, " ");
	return ALL_MEDIUM_PHRASES.some((phrase) =>
		low.includes(phrase.toLowerCase()),
	);
}

export function ensureClosingFormula(
	text: string,
	mediumPhrase: string,
): string {
	if (hasMediumPhrase(text)) return text;
	const trimmed = text.trim().replace(/[.,;:]$/, "");
	return `${trimmed}. ${mediumPhrase}, ${CLOSING_TAIL}.`;
}
