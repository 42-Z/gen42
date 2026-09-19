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
	/(надпис|плакат|вывеск|лозунг|слоган|граффити|баннер|подпис(?!чик)|(?<!кон)текст(?!ур)|агитац|листовк|афиш|обложк|постер|под названием|с названием|называ[ею]тся|\b(sign|text|poster|slogan|banner|lettering|caption|logo|cover|flyer|propaganda)\b)/i;

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

// Генератор рисует ёлочки буквально («SLAY» с кавычками на вывеске), а прямые
// кавычки понимает как границы надписи. «…» нужны только внутри конвейера.
export function toGeneratorQuotes(text: string): string {
	return text.replace(
		/«([^»]*)»|“([^”]*)”/g,
		(_, guillemets, curly) => `"${guillemets ?? curly}"`,
	);
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
	if (extractCapsPhrases(userInput).length > 0) return true;
	const low = userInput.toLowerCase();
	return EXACT_TEXT_HINTS.some((hint) => low.includes(hint));
}

const NAMED_TEXT =
	/(?:под названием|с названием|называ[ею]тся|с именем|по имени)\s+([^,.!?;:«»"“”\n]+)/giu;

// «здание под названием SLAY тёмные цвета» → «SLAY»: берём слова, пока они
// похожи на имя (латиница, заглавная буква или цифры), и останавливаемся на
// первом обычном слове.
export function extractNamedTexts(userInput: string): string[] {
	const names: string[] = [];
	for (const match of userInput.matchAll(NAMED_TEXT)) {
		const words: string[] = [];
		for (const word of (match[1] ?? "").trim().split(/\s+/)) {
			if (!/^(?:[\p{Lu}\d]|[A-Za-z])/u.test(word) || words.length >= 4) break;
			words.push(word);
		}
		if (words.length > 0) names.push(words.join(" "));
	}
	return [...new Set(names)];
}

const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
const MAX_CAPS_PHRASES = 3;
const MAX_CAPS_TOKENS = 10;

function isCapsToken(token: string): boolean {
	const letters = token.replace(/[^\p{L}]/gu, "");
	return letters.length > 0 && letters === letters.toUpperCase();
}

function capsWordCount(tokens: string[]): number {
	return tokens.filter(
		(token) =>
			token.replace(/[^\p{L}]/gu, "").length >= 2 && isCapsToken(token),
	).length;
}

// Фразы капсом без кавычек («СЛАВА 1 ВЗВОДУ 1 РОТЫ») — так в сообществе пишут
// лозунги. Одиночные слова капсом (SLAY, VPN) лозунгом не считаются.
export function extractCapsPhrases(userInput: string): string[] {
	const phrases: string[] = [];
	let run: string[] = [];
	let lastEnd = -1;

	const flush = () => {
		if (capsWordCount(run) >= 2 && run.length <= MAX_CAPS_TOKENS) {
			phrases.push(run.join(" "));
		}
		run = [];
	};

	for (const match of userInput.matchAll(WORD)) {
		const token = match[0];
		const start = match.index ?? 0;
		const gap = lastEnd >= 0 ? userInput.slice(lastEnd, start) : "";
		const fits = isCapsToken(token) || /^\d+$/.test(token);
		if (run.length > 0 && (!fits || !/^\s+$/.test(gap))) flush();
		if (fits) run.push(token);
		lastEnd = start + token.length;
	}
	flush();

	return [...new Set(phrases)].slice(0, MAX_CAPS_PHRASES);
}

const USER_SETTING =
	/(?<![\p{L}])(клуб|бар[еау]?(?![\p{L}])|ресторан|кафе|казино|город|мегаполис|улиц|площад|здани|зам(?:ок|к)|дворц|двор(?:е|ец)(?![\p{L}])|лес(?:у|е|а)?(?![\p{L}])|джунгл|пустын|пляж|мор(?:е|я|ю|ем)(?![\p{L}])|океан|остров|гор(?:ы|ах|е|ам)(?![\p{L}])|космос|космодром|планет|лун[аеу](?![\p{L}])|стадион|сцен[аеуы]|арен[аеуы]|офис|школ|кухн|комнат|подвал|крыш|парк[еау]?(?![\p{L}])|деревн|ферм[аеу]|завод|вокзал|метро|аэропорт|трасс|шоссе|хайвей|под водой|подвод|дик(?:ий|ого|ом) запад|вестерн|храм|церк|тюрьм|больниц|квартир|джакузи|бассейн)|\b(club|bar|restaurant|casino|city|street|square|building|castle|palace|forest|jungle|desert|beach|sea|ocean|island|mountains?|space|planet|moon|stadium|stage|arena|office|school|kitchen|room|park|village|farm|factory|station|airport|highway|underwater|wild west|western|temple|church|prison|hospital|rooftop|pool)\b/iu;

const USER_PALETTE =
	/(цвет|оттенк|палитр|(?<![\p{L}])тон(?:а|ах|ами|ов)?(?![\p{L}])|т[её]мн|светл|мрачн|монохром|ч[её]рно-бел|сепи|пастел|красн|ж[её]лт|(?<![\p{L}])син(?:ий|его|ие|ем|ей|им|их|яя|юю)(?![\p{L}])|зел[её]н|фиолет|розов|оранж|бирюз|ночь|ночн|закат|рассвет|сумер|туман|гроз|горит|пожар|\b(colou?rs?|palette|tones?|hues?|dark|night|sunset|dawn|fog|monochrome|black and white|sepia|pastel)\b)/iu;

// Место и палитру, названные пользователем, якоря не перебивают — такие
// якоря даже не передаются в LLM.
export function detectUserSetting(userInput: string): boolean {
	return USER_SETTING.test(userInput);
}

export function detectUserPalette(userInput: string): boolean {
	return USER_PALETTE.test(userInput);
}

interface CanonCast {
	name: string;
	output: RegExp;
	input: RegExp;
}

// Персонажи и техника из канона, которые не имеют права открывать промпт,
// если пользователь о них не просил: иначе свита вытесняет героя.
const CANON_CAST: readonly CanonCast[] = [
	{ name: "pug", output: /\bpugs?\b/i, input: /мопс|\bpugs?\b/i },
	{
		name: "turtle",
		output: /\b(turtles?|tortoises?)\b/i,
		input: /черепах|turtle|tortoise/i,
	},
	{
		name: "hippopotamus",
		output: /\bhippo/i,
		input: /бегемот|гиппопотам|hippo/i,
	},
	{ name: "giraffe", output: /\bgiraffes?\b/i, input: /жираф|giraffe/i },
	{ name: "flamingo", output: /\bflamingos?\b/i, input: /фламинго|flamingo/i },
	{ name: "rhinoceros", output: /\brhino/i, input: /носорог|rhino/i },
	{ name: "cactus", output: /\bcact(us|i)\b/i, input: /кактус|cact(us|i)/i },
	{
		name: "lion",
		output: /\blions?\b/i,
		input: /(?<![\p{L}])(лев|льв\p{L}*)(?![\p{L}])|\blions?\b/iu,
	},
	{ name: "monkey", output: /\bmonkeys?\b/i, input: /обезьян|monkey/i },
	{ name: "penguin", output: /\bpenguins?\b/i, input: /пингвин|penguin/i },
	{ name: "elephant", output: /\belephants?\b/i, input: /слон|elephant/i },
	{
		name: "zeppelin",
		output: /\b(zeppelins?|airships?|dirigibles?)\b/i,
		input: /дирижабл|zeppelin|airship/i,
	},
	{ name: "carriage", output: /\bcarriages?\b/i, input: /карет|carriage/i },
	{
		name: "convertible",
		output: /\bconvertibles?\b/i,
		input: /кабриолет|convertible/i,
	},
	{ name: "scooter", output: /\bscooters?\b/i, input: /самокат|scooter/i },
	{ name: "jet ski", output: /\bjet skis?\b/i, input: /гидроцикл|jet ?ski/i },
	{ name: "tank", output: /\btanks?\b/i, input: /танк|\btanks?\b/i },
	{ name: "throne", output: /\bthrones?\b/i, input: /трон|throne/i },
];

const OPENING_WORDS = 10;
const SUBJECT_STOP =
	/^(on|in|at|into|onto|with|inside|atop|beside|amid|among|through|across|under|over|above|below|near|from|by|beneath|behind|toward|towards|riding|rides|wearing|holding|stands?|sits?|is|are|was|were|while|as|and|who|that|—|–)$/i;

// Подлежащее первого предложения: слова до первого предлога, глагола-связки
// или запятой. «A colossal cat on a diamond throne» → «A colossal cat».
export function openingSpan(output: string): string {
	const firstSentence = output.split(/(?<=[.!?])\s/)[0] ?? output;
	const words: string[] = [];
	for (const word of firstSentence.split(/\s+/).slice(0, OPENING_WORDS)) {
		if (words.length > 0 && SUBJECT_STOP.test(word)) break;
		words.push(word);
		if (/[,;:]$/.test(word)) break;
	}
	return words.join(" ");
}

// Открывает ли промпт свита из канона вместо героя пользователя.
export function hijackedOpening(userInput: string, output: string): string[] {
	// Составные слова («lion-hearted», «pug-faced») — описание, а не персонаж.
	const opening = openingSpan(output).replace(/\p{L}+(?:-\p{L}+)+/gu, " ");
	return CANON_CAST.filter(
		(cast) => cast.output.test(opening) && !cast.input.test(userInput),
	).map((cast) => cast.name);
}

const CYRILLIC_RUN = /[А-Яа-яЁё]+(?:[\s-]+[А-Яа-яЁё0-9]+)*/g;
const QUOTED_SEGMENT = /(«[^»]*»|“[^”]*”|"[^"]*")/;

const TRANSLIT: Record<string, string> = {
	а: "a",
	б: "b",
	в: "v",
	г: "g",
	д: "d",
	е: "e",
	ё: "yo",
	ж: "zh",
	з: "z",
	и: "i",
	й: "y",
	к: "k",
	л: "l",
	м: "m",
	н: "n",
	о: "o",
	п: "p",
	р: "r",
	с: "s",
	т: "t",
	у: "u",
	ф: "f",
	х: "kh",
	ц: "ts",
	ч: "ch",
	ш: "sh",
	щ: "shch",
	ъ: "",
	ы: "y",
	ь: "",
	э: "e",
	ю: "yu",
	я: "ya",
};

export function transliterate(text: string): string {
	return text.replace(/[А-Яа-яЁё]/g, (char) => {
		const latin = TRANSLIT[char.toLowerCase()] ?? char;
		return char === char.toLowerCase()
			? latin
			: latin.charAt(0).toUpperCase() + latin.slice(1);
	});
}

// Имена и названия из запроса, оставленные LLM кириллицей без кавычек,
// спасаем, чтобы контракт не выбрасывал весь ответ: при текстовом запросе
// берём в кавычки (это надпись), иначе транслитерируем — в кавычках имя
// превратилось бы в незапрошенную надпись и замаскировалось бы в «42».
export function quoteUserCyrillic(
	output: string,
	userInput: string,
	textRequested = true,
): string {
	const source = userInput.toLowerCase();
	return output
		.split(QUOTED_SEGMENT)
		.map((part, index) =>
			index % 2 === 1
				? part
				: part.replace(CYRILLIC_RUN, (run) => {
						if (!source.includes(run.toLowerCase())) return run;
						return textRequested ? `«${run}»` : transliterate(run);
					}),
		)
		.join("");
}

export interface DetailMarker {
	pattern: RegExp;
	marker: string;
}

export const EXPLICIT_DETAILS: readonly DetailMarker[] = [
	{ pattern: /лазер|laser/i, marker: "laser" },
	{ pattern: /стреля|выстрел|\b(shoot|shot|fire|blast)\b/i, marker: "shoot" },
	{ pattern: /взрыв|explod|explosion/i, marker: "explosion" },
	{ pattern: /(?<![\p{L}])огн(?!етуш)|пламя|\bflame\b/iu, marker: "flame" },
	{ pattern: /(?<![\p{L}])крыл|\bwing\b/iu, marker: "wing" },
	{ pattern: /глаз|eye/i, marker: "eye" },
	{ pattern: /летит|лета|парит|\b(fly|flying|hover)\b/i, marker: "fly" },
	{ pattern: /светит|светя|\b(glow|shine|beam)\b/i, marker: "glow" },
	{ pattern: /дым|\bsmoke\b/i, marker: "smoke" },
	{
		pattern: /бьёт|бьет|(?<![\p{L}])удар(?!ник)|\b(punch|smash|hit)\b/iu,
		marker: "impact",
	},
	{ pattern: /робот|robot|android|cyborg/i, marker: "robot" },
	{ pattern: /доспех|брон|armor|armour/i, marker: "armor" },
	{ pattern: /танц|\bdanc/i, marker: "dance" },
	{ pattern: /прыга|прыжок|\b(jump|leap)\b/i, marker: "jump" },
	{ pattern: /слуша|\blisten/i, marker: "listen" },
	// Названный герой-животное не должен подменяться другим видом
	// («мопс» → «corgi»), а реальный политик — терять замену на Босса.
	{ pattern: /мопс|\bpugs?\b/i, marker: "pug" },
	{
		pattern:
			/(?<![\p{L}])(кот(?:ик\p{L}*|ы|а|у|ом|ов|ам|ами|ах|е|ята|ят)?|кош(?:к|ечк)\p{L}*|кот[её]н\p{L}*)(?![\p{L}])|\b(cat|kitten)s?\b/iu,
		marker: "cat",
	},
	{
		pattern:
			/собак|(?<![\p{L}])(п[её]с|щен\p{L}*)(?![\p{L}])|\b(dog|puppy)\b/iu,
		marker: "dog",
	},
	{ pattern: /тигр|\btiger/i, marker: "tiger" },
	{ pattern: /(?<![\p{L}])волк|\bwol(f|ves)\b/iu, marker: "wolf" },
	{ pattern: /медвед|\bbear\b/i, marker: "bear" },
	{ pattern: /опосс?ум|\bopossum/i, marker: "opossum" },
	{ pattern: /кабан|\bboar/i, marker: "boar" },
	{
		pattern:
			/президент|министр|депутат|губернатор|(?<![\p{L}])мэр(?![\p{L}])|начальник/iu,
		marker: "boss",
	},
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
	listen: /listen|headphone|earbud|speaker/i,
	pug: /\bpugs?\b/i,
	cat: /\b(cat|kitten|kitty)s?\b/i,
	dog: /\b(dog|puppy|puppies|hound)s?\b/i,
	tiger: /\btiger/i,
	wolf: /\bwol(f|ves)\b/i,
	bear: /\bbears?\b/i,
	opossum: /\bopossum/i,
	boar: /\bboars?\b/i,
	boss: /\bboss\b/i,
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
