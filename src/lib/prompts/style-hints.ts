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
		phrase:
			"cinematic 3D render with physically believable materials and realistic light",
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

const QUOTED_TEXT = /«[^»]{1,80}»|“[^”]{1,80}”|"[^"]{1,80}"/g;

const QUOTE_CHARS = /[«»“”"]/;

const TEXT_REQUEST =
	/(надпис|плакат|вывеск|лозунг|слоган|граффити|баннер|подпис(?!чик)|(?<!кон)текст(?!ур)|\b(sign|text|poster|slogan|banner|lettering|caption|logo)\b)/i;

const EXACT_TEXT_HINTS = [
	"плакат с надписью",
	"надпись",
	"текст на",
	"с текстом",
	"with the text",
	"with text",
];

export function extractQuotedTexts(userInput: string): string[] {
	const matches = userInput.match(QUOTED_TEXT) ?? [];
	return matches.map((match) => match.slice(1, -1).trim()).filter(Boolean);
}

export function maskUnrequestedTexts(text: string): string {
	return text
		.replace(QUOTED_TEXT, "42")
		.replace(/\s+([,.;:!?])/g, "$1")
		.replace(/\s{2,}/g, " ");
}

export function requestsText(userInput: string): boolean {
	if (QUOTE_CHARS.test(userInput)) return true;
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
	{ pattern: /стреля|выстрел|\b(shoot|shot|fire|blast)\b/i, marker: "shoot" },
	{ pattern: /взрыв|explod|explosion/i, marker: "explosion" },
	{ pattern: /огон|огн|пламя|\bflame\b/i, marker: "flame" },
	{ pattern: /крыл|крыль|\bwing\b/i, marker: "wing" },
	{ pattern: /глаз|eye/i, marker: "eye" },
	{ pattern: /летит|лета|парит|\b(fly|flying|hover)\b/i, marker: "fly" },
	{ pattern: /светит|светя|\b(glow|shine|beam)\b/i, marker: "glow" },
	{ pattern: /дым|\bsmoke\b/i, marker: "smoke" },
	{ pattern: /бьёт|бьет|удар|\b(punch|smash|hit)\b/i, marker: "impact" },
	{ pattern: /робот|robot|android|cyborg/i, marker: "robot" },
	{ pattern: /доспех|брон|armor|armour/i, marker: "armor" },
	{ pattern: /танц|\bdanc/i, marker: "dance" },
	{ pattern: /прыга|прыжок|\b(jump|leap)\b/i, marker: "jump" },
];

const DETAIL_MARKER_SYNONYMS: Record<string, RegExp> = {
	laser: /laser/i,
	shoot: /\b(shoot|shot|fire|blast|beam|ray|streak)/i,
	explosion: /\bexplod|\bblast|\bburst/i,
	flame: /\bflame|\bfire|\bblaze|\bburn/i,
	wing: /\bwing|feather/i,
	eye: /\beye|gaze/i,
	fly: /\bfly|flying|hover|soar|levitat/i,
	glow: /\bglow|\bbeam|shine|radian/i,
	smoke: /\bsmoke|haze|mist|\bfog/i,
	impact: /\b(punch|smash|impact|strike|hit)\b/i,
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
