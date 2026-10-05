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
	"wide-angle poster composition, hyper-saturated rainbow-and-gold palette, absurd triumphant kitsch, no watermarks, no signature";

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
	/(?:под названием|с названием|называ[ею]тся|с именем|по имени|(?<![\p{L}])(?:альбо+м|трек|песн|клип|сингл|album|track|song)\p{L}*)\s+([^,.!?;:«»"“”\n]+)/giu;

// «здание под названием SLAY тёмные цвета» → «SLAY», «слушают альбом Magnum»
// → «Magnum»: берём слова, пока они похожи на имя (латиница, заглавная буква
// или цифры), и останавливаемся на первом обычном слове.
export function extractNamedTexts(userInput: string): string[] {
	const names: string[] = [];
	for (const match of userInput.matchAll(NAMED_TEXT)) {
		const words: string[] = [];
		for (const word of (match[1] ?? "").trim().split(/\s+/)) {
			const joiner = /^[-–—&]$/.test(word);
			if (
				words.length >= 5 ||
				!(joiner || /^(?:[\p{Lu}\d]|[A-Za-z])/u.test(word))
			)
				break;
			words.push(word);
		}
		while (words.length > 0 && /^[-–—&]$/.test(words.at(-1)!)) words.pop();
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

const GROUP_REQUEST =
	/(братух|толп|отряд|взвод|(?<![\p{L}])рот[аыу](?![\p{L}])|батальон|банд[аыу]|компани|друз|(?<![\p{L}])все(?![\p{L}])|люди|гост[ьие]|фанат|\b(crowd|group|squad|gang|friends|people|fans|bros)\b|(?<![\d])([2-9]|\d{2,})\s+\p{L})/iu;

const LISTEN_REQUEST = /слуша|\blisten/i;

const IDEA_LINE =
	"MAKE THE IDEA OBVIOUS: the hero's action and every object named in the request are big, in the foreground and mentioned at least twice — never a tiny detail. Add no new hero and no hero action the request did not name.";

const VIBE_LINE =
	"42 VIBE (soak the user's idea in it, never replace the idea): a named person or animal wears the 42 look itself; a landscape, weather or object request stays that landscape, weather or object — the 42 crowd lives inside it; rainbow patchwork shaggy fur coats, leopard, zebra and cotton-candy furs, sequined jackets with golden epaulettes, fringe, crowns, gold chains with 42 medallions, RGB light strips and fiber-optic strands glowing in the fur, two or three fantasy creatures from the entourage next to the hero, the number 42 living on jerseys, medallions, balloons and horizontal bicolor flags (blue top half, red bottom half, a white 42 inside a golden laurel wreath — never national flags), hyper-saturated rainbow-and-gold palette.";

// Короткий бриф в конце сообщения: маленькая LLM теряет правила из длинного
// системного промпта, а последние строки сообщения соблюдает.
export function buildBrief(userInput: string): string[] {
	const brief: string[] = [];
	if (GROUP_REQUEST.test(userInput)) {
		brief.push(
			"GROUP: the heroes are a group — describe three to five of them one by one (fur coat color and texture, headwear, accessory, pose, emotion), no two outfits alike, never «matching outfits» or «varied streetwear»; say the rest are just as loud and all different.",
		);
	}
	if (LISTEN_REQUEST.test(userInput)) {
		brief.push(
			"LISTENING must be visible: huge glowing over-ear headphones on EVERY hero, eyes closed and heads nodding, rings of sound waves, speakers, and the album cover shown big on a screen, a zeppelin or in a hero's hands; mention the headphones in the first sentence and again later.",
		);
	}
	brief.push(IDEA_LINE, VIBE_LINE);
	return brief;
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
	{ name: "phoenix", output: /\bphoenix(es)?\b/i, input: /феникс|phoenix/i },
	{ name: "unicorn", output: /\bunicorns?\b/i, input: /единорог|unicorn/i },
	{ name: "dolphin", output: /\bdolphins?\b/i, input: /дельфин|dolphin/i },
	{ name: "seal", output: /\bseals?\b/i, input: /тюлен|\bseals?\b/i },
	// Выдуманный персонаж в пейзаже («закат» → «a figure in a fur coat»).
	{
		name: "invented figure",
		output:
			/\b(figure|man|woman|person|guy|girl|boy|character|stranger|rider|dancer|king|queen)s?\b/i,
		input:
			/человек|люд|мужчин|женщин|девуш|девоч|девчон|парн|парен|мальчик|братух|толп|фанат|гост|рыцар|солдат|воин|взвод|батальон|отряд|босс|президент|король|королев|царь|портрет|самура|танцор|байкер|шериф|(?<![\p{L}])(все|мы|я)(?![\p{L}])|\b(man|woman|girl|boy|people|person|samurai|knight|king|queen|crowd|guy|figure)s?\b/iu,
	},
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
	{
		pattern:
			/(?<![\p{L}])(ест|едят|кушает|кушают|жу[её]т|жрут|жр[её]т|лопает|уплетает)(?![\p{L}])|\beat(s|ing)?\b/iu,
		marker: "eat",
	},
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
	{ pattern: /свин|поросён|поросен|хряк|\b(pig|piglet)s?\b/i, marker: "pig" },
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
	// «Слушают» без наушников генератор не рисует: одних колонок мало.
	listen: /headphone|earphone|earbud/i,
	pug: /\bpugs?\b/i,
	cat: /\b(cat|kitten|kitty)s?\b/i,
	dog: /\b(dog|puppy|puppies|hound)s?\b/i,
	tiger: /\btiger/i,
	wolf: /\bwol(f|ves)\b/i,
	bear: /\bbears?\b/i,
	opossum: /\bopossum/i,
	boar: /\bboars?\b/i,
	pig: /\b(pig|piglet|hog)s?\b/i,
	eat: /\b(eat|eats|eating|munch|chew|devour|bite|biting|feast|gobbl)/i,
	boss: /\bboss\b/i,
};

// Герой-животное из запроса обязан быть в первом предложении: мопсы из свиты
// в конце текста не спасают, если героем стала «пушистая собака».
const HERO_MARKERS = new Set([
	"pug",
	"cat",
	"dog",
	"tiger",
	"wolf",
	"bear",
	"opossum",
	"boar",
	"pig",
]);

export function missingDetails(userInput: string, output: string): string[] {
	const missing: string[] = [];
	const firstSentence = output.split(/(?<=[.!?])\s/)[0] ?? output;
	for (const detail of EXPLICIT_DETAILS) {
		if (!detail.pattern.test(userInput)) continue;
		const synonyms = DETAIL_MARKER_SYNONYMS[detail.marker];
		const scope = HERO_MARKERS.has(detail.marker) ? firstSentence : output;
		if (!synonyms?.test(scope)) missing.push(detail.marker);
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
