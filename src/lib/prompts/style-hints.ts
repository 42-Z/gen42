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
		pattern: /(?<![\p{L}])(аниме|манга)(?![\p{L}])|anime|manga/iu,
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

const MEDIUM_MARKERS =
	/\b(photograph|photography|render|rendering|painting|poster|collage|drawing|illustration|comic|screenprint|watercolou?r|pixel-art|anime|3d)\b/i;

const TEXT_REQUEST =
	/[«»""'']|(надпис|текст|плакат|вывеск|лозунг|слоган|граффити|баннер|подпис|\b(sign|text|poster|slogan|banner|lettering|caption|logo)\b)/i;

const EXACT_TEXT_HINTS = [
	"плакат с надписью",
	"надпись",
	"текст на",
	"с текстом",
	"with the text",
	"with text",
];

export function extractQuotedTexts(userInput: string): string[] {
	const matches = userInput.match(/«[^»]+»|"[^"]+"|'[^']+'/g) ?? [];
	return matches.map((match) => match.slice(1, -1).trim()).filter(Boolean);
}

export function maskUnrequestedTexts(text: string): string {
	return text.replace(/«[^»]*»|"[^"]*"/g, "42");
}

export function requestsText(userInput: string): boolean {
	if (TEXT_REQUEST.test(userInput)) return true;
	const low = userInput.toLowerCase();
	return EXACT_TEXT_HINTS.some((hint) => low.includes(hint));
}

export interface DetailMarker {
	pattern: RegExp;
	marker: string;
}

export const EXPLICIT_DETAILS: readonly DetailMarker[] = [
	{ pattern: /лазер|laser/i, marker: "laser" },
	{ pattern: /стреля|выстрел|shoot|fire|blast|shot/i, marker: "shoot" },
	{ pattern: /взрыв|explod|explosion/i, marker: "explosion" },
	{ pattern: /огон|огн|пламя|flame|fire(?!\s*work)/i, marker: "flame" },
	{ pattern: /кыл|wing/i, marker: "wing" },
	{ pattern: /глаз|eye/i, marker: "eye" },
	{ pattern: /летит|лета|парит|fly|flying|hover/i, marker: "fly" },
	{ pattern: /светит|светя|glow|beam|shine/i, marker: "glow" },
	{ pattern: /дым|smoke|smog/i, marker: "smoke" },
	{ pattern: /бьёт|бьет|удар|punch|smash|hit/i, marker: "impact" },
	{ pattern: /робот|robot|android|cyborg/i, marker: "robot" },
	{ pattern: /доспех|брон|armor|armour/i, marker: "armor" },
	{ pattern: /танц|danc/i, marker: "dance" },
	{ pattern: /прыга|прыжок|jump|leap/i, marker: "jump" },
];

const DETAIL_MARKER_SYNONYMS: Record<string, RegExp> = {
	laser: /laser/i,
	shoot: /shoot|fire|blast|beam|ray|shot|streak/i,
	explosion: /explod|blast|burst/i,
	flame: /flame|fire|blaze|burn/i,
	wing: /wing|feather/i,
	eye: /eye|gaze/i,
	fly: /fly|flying|hover|soar|levitat/i,
	glow: /glow|beam|shine|radian|light/i,
	smoke: /smoke|haze|mist|fog/i,
	impact: /punch|smash|impact|strike|hit/i,
	robot: /robot|android|cyborg|mech/i,
	armor: /armor|armour|plated|breastplate/i,
	dance: /danc|waltz|sway/i,
	jump: /jump|leap|mid-air/i,
};

export function missingDetails(userInput: string, output: string): string[] {
	const missing: string[] = [];
	for (const detail of EXPLICIT_DETAILS) {
		if (!detail.pattern.test(userInput)) continue;
		const synonyms = DETAIL_MARKER_SYNONYMS[detail.marker];
		if (!synonyms?.test(output)) missing.push(detail.marker);
	}
	return missing;
}

export function detectUserMedium(userInput: string): string | null {
	for (const hint of USER_MEDIUM_HINTS) {
		if (hint.pattern.test(userInput)) return hint.phrase;
	}
	return null;
}

export function hasMediumPhrase(text: string): boolean {
	const low = text.toLowerCase();
	if (MEDIUM_MARKERS.test(low)) return true;
	return ALL_MEDIUM_PHRASES.some((phrase) =>
		low.includes(phrase.toLowerCase()),
	);
}

export function ensureClosingFormula(
	text: string,
	mediumPhrase: string,
): string {
	if (hasMediumPhrase(text)) return text;
	if (/no watermarks|no signature/i.test(text)) return text;
	const trimmed = text.trim().replace(/[.,;:]$/, "");
	return `${trimmed}. ${mediumPhrase}, ${CLOSING_TAIL}.`;
}
