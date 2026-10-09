export interface Anchors {
	location: string;
	transport: string;
	creatures: string;
	luxury: string;
	slogan: string;
	medium: string;
	lighting: string;
	props: string;
}

export interface AnchorCategory {
	key: keyof Anchors;
	label: string;
	values: readonly string[];
	requiresText?: boolean;
}

// Каталог сеттингов шире дворцового: 42 живёт и в деревне, и на орбите.
// Дворцовые локации оставлены, но их три из двадцати восьми, а не половина.
const LOCATIONS = [
	"a neon-drenched cyberpunk megacity with geometric neon signs",
	"a rain-slicked night street under fireworks and rainbow neon",
	"a half-ruined city street turned into a block party",
	"a dusty battlefield at the edge of a ruined city",
	"a golden-hour city embankment with a river and a distant skyline",
	"a rooftop helipad above the neon skyline",
	"a night highway arched with rainbow lights",
	"a construction site wrapped in glowing banners",
	"a village yard with log huts, haystacks and a chrome tractor",
	"a kolhoz field at sunset with a golden tractor and banners",
	"a moonlit country road lined with glowing signs",
	"a golden autumn forest with falling leaves",
	"a lakeside summer picnic with a barbecue and a speaker tower",
	"a snow-capped mountain ridge above the clouds",
	"a dusty desert parade ground with rainbow fire",
	"an underwater bioluminescent vault full of bubbles",
	"a futuristic command center with holographic screens",
	"a concrete bunker lit by fluorescent lamps",
	"a school classroom with a chalkboard and warm window light",
	"a brick barracks courtyard with ranks of soldiers",
	"a muddy arena at sunset under a burning sky",
	"an awards-night carpet under spotlights and camera flashes",
	"a gilded baroque theatre hall with a giant glowing sign",
	"an orbital station cabin with Earth in the window",
	"a floating fantasy citadel above the clouds",
	"a medieval castle banquet hall hung with blue-over-red bicolor banners",
	"a golden palace square at golden hour",
	"a diamond disco floor under a mirrorball",
] as const;

const TRANSPORT = [
	"an electric scooter glowing with RGB light",
	"a gold-trimmed convertible with diamond rims",
	"a vintage golden carriage",
	"a zeppelin carrying a giant LED screen",
	"a swarm of camera drones",
	"a spiked armored turtle tank",
	"chrome hover-sneakers",
	"a jet ski with a plasma exhaust",
	"a gold-plated tractor with LED lights",
	"a chrome supercar with a gold grille",
	"a pizza-shaped party train",
] as const;

const CREATURES = [
	"a crowd of pugs in rainbow fur coats and tiny sunglasses",
	"a hippopotamus DJ in a fur coat with glowing headphones",
	"a hippopotamus general in a leopard peaked cap and golden epaulettes",
	"boars riding RGB-lit electric scooters",
	"seals with jetpacks leaving rainbow trails",
	"a pig in shaggy rainbow fur eating popcorn",
	"flamingos dripping in gold jewelry",
	"roosters in sequined suits and knit caps",
	"elephants in pink fur coats and straw hats",
	"gorillas with blasters and heavy gold chains",
	"white bears in tanker helmets on a golden tank",
	"cats in dark sunglasses riding a gold-plated tractor",
	"an anthropomorphic cactus in dark sunglasses",
	"a spiked turtle boss with jet turbines",
] as const;

const LUXURY = [
	"a diamond-encrusted disco ball",
	"a chest of gold bars",
	"a money belt and ruby rings",
	"a diamond-encrusted gold wristwatch",
	"oversized luxury sneakers",
	"a gold chain with a giant 42 medallion",
	"a glass case of rubies",
	"a leopard fur coat with a towering fur collar worn by the hero",
] as const;

const SLOGANS = [
	"СЛАВА 42",
	"СЛАВА БОССУ",
	"ЗА БОССА",
	"НАРОДНЫЙ КОРОЛЬ",
	"МЫ ТОЛЬКО НАЧАЛИ",
	"42 — ПРАВИЛЬНЫЙ ВЫБОР",
	"НАС 42000",
	"ЗА ПЯТЁРКУ",
	"SLAY KING",
	"БРАТУХА 42",
] as const;

// Без явного стиля пользователя кадр реалистичный: стилизации (аниме,
// пиксель-арт, комикс, масло) включаются только по запросу — USER_MEDIUM_HINTS.
const MEDIUMS = [
	"hyper-detailed cinematic photograph",
	"cinematic 3D render with physically believable materials and realistic light",
	"glossy hip-hop album cover photograph with hard flash",
	"cinematic film still shot on 35mm with anamorphic flares",
	"hyper-real editorial magazine photograph",
	"wide-angle night photograph with long-exposure light trails",
] as const;

const LIGHTING = [
	"fireworks spelling 42 in the sky",
	"stroboscopic rainbow party lighting",
	"neon signage glow with confetti in the air",
	"golden hour backlight with lens flares",
	"searchlights and holographic reflections",
	"harsh flash with diamond sparkle",
] as const;

const PROPS = [
	"a giant calculator-shaped birthday cake with glowing keys",
	"a popcorn cannon firing golden kernels",
	"a ruby-studded pizza on a marble platter",
	"an oversized golden gamepad with jewel buttons",
	"a champagne fountain shaped like a golden sneaker",
	"a diamond-encrusted cash register spilling banknotes",
	"a smiling porcelain pug statue holding a scepter",
	"a golden saxophone played by a flamingo",
	"a velvet throne mounted on a hoverboard",
	"a crystal trophy cabinet full of 42-shaped awards",
	"a bouquet of balloons shaped like the number 42",
	"champagne-bottle rockets spraying foam and sparks",
	"a laughing sun wearing dark sunglasses",
] as const;

export const ANCHOR_CATEGORIES: readonly AnchorCategory[] = [
	{ key: "location", label: "location", values: LOCATIONS },
	{ key: "transport", label: "transport", values: TRANSPORT },
	{
		key: "creatures",
		label: "entourage creatures (supporting, never replace the user's subject)",
		values: CREATURES,
	},
	{ key: "luxury", label: "luxury", values: LUXURY },
	{
		key: "props",
		label: "absurd luxury prop (a surprise the user did not ask for)",
		values: PROPS,
	},
	{
		key: "slogan",
		label: "slogan",
		values: SLOGANS,
		requiresText: true,
	},
	{ key: "medium", label: "medium", values: MEDIUMS },
	{ key: "lighting", label: "lighting", values: LIGHTING },
];

function pick<T>(values: readonly T[], random: () => number): T {
	const index = Math.min(
		values.length - 1,
		Math.floor(random() * values.length),
	);
	return values[index]!;
}

export function pickAnchors(random: () => number = Math.random): Anchors {
	const picked: Partial<Anchors> = {};
	for (const category of ANCHOR_CATEGORIES) {
		picked[category.key] = pick(category.values, random);
	}
	return picked as Anchors;
}

export interface UserMessageOptions {
	textRequested?: boolean;
	exactTexts?: string[];
	textCandidates?: string[];
	missingDetails?: string[];
	hijackedBy?: string[];
	omit?: readonly (keyof Anchors)[];
	brief?: string[];
	/** Строка про текст для запроса без текста; по умолчанию с числом 42 два-три раза */
	noTextLine?: string;
}

/**
 * Сообщение для LLM. `anchors: null` — сообщение без якорей (Турбо): только запрос,
 * признак текста и точные цитаты; разнообразие там даёт идея агента, а не случайные слоты.
 */
export function buildUserMessage(
	userInput: string,
	anchors: Anchors | null,
	options: UserMessageOptions = {},
): string {
	const clean = userInput
		.trim()
		.replace(/\s+/g, " ")
		.replace(/<<<|>>>/g, " ");
	const exactTexts = options.exactTexts ?? [];
	const textCandidates = options.textCandidates ?? [];
	const omit = new Set(options.omit ?? []);
	const anchorLines = anchors
		? ANCHOR_CATEGORIES.filter(
				(category) =>
					(!category.requiresText || options.textRequested) &&
					!(
						category.key === "slogan" &&
						(exactTexts.length > 0 || textCandidates.length > 0)
					) &&
					!omit.has(category.key),
			)
				.map((category) => `${category.label}: ${anchors[category.key]}`)
				.join("\n")
		: "";
	const anchorBlock = anchors
		? `ANCHORS FOR THIS GENERATION (42-canon fillers for the gaps the request leaves open: keep them secondary, never in the first sentence, never instead of the user's hero, place, action, colors or mood; drop one if it contradicts the request):
${anchorLines}

`
		: "";
	const closingLine = anchors
		? "Open the prompt with that hero, its action and its place; the anchors only decorate the background."
		: "Open the prompt with that hero, its action and its place.";

	const textLine = options.textRequested
		? "TEXT: requested — carry the user's exact wording literally, quoted, up to three inscriptions."
		: (options.noTextLine ??
			"TEXT: none — no words or letters anywhere in the frame; only the giant numeric 42 emblem is allowed (two or three times, never more than four).");

	const exactLine = exactTexts.length
		? `\nEXACT TEXT (must appear verbatim in the frame, no translation, no edits): ${exactTexts.map((text) => `«${text}»`).join(", ")}.`
		: "";

	const candidatesLine = textCandidates.length
		? `\nTEXT CANDIDATES (the user wrote these slogans in caps; use one to three of them verbatim as the main inscriptions): ${textCandidates.map((text) => `«${text}»`).join(", ")}.`
		: "";

	const userOwned = [
		omit.has("location") && "the place / setting",
		omit.has("lighting") && "the colors, light and mood",
	].filter(Boolean);
	const userOwnedLine = userOwned.length
		? `\nUSER-DEFINED (take these from the request, no anchor may replace them): ${userOwned.join("; ")}.`
		: "";

	const hijackLine = options.hijackedBy?.length
		? `\nPREVIOUS ATTEMPT WAS REJECTED: it opened with the entourage (${options.hijackedBy.join(", ")}) instead of the user's subject. The first sentence must be about the user's own hero, action and place.`
		: "";

	const missingLine = options.missingDetails?.length
		? `\nMISSING DETAILS FROM THE PREVIOUS ATTEMPT (they must appear explicitly and prominently): ${options.missingDetails.join(", ")}.`
		: "";

	// Запрос пользователя стоит последним: маленькие модели сильнее слушаются
	// конца сообщения, и якоря не должны оказываться «последним словом».
	return `${anchorBlock}${textLine}${exactLine}${candidatesLine}${userOwnedLine}${missingLine}${hijackLine}

<<<USER_REQUEST
${clean}
>>>

${options.brief?.length ? `${options.brief.join("\n")}\n\n` : ""}The hero of the image is what USER_REQUEST names (people stay people, named places stay places). ${closingLine}`;
}
