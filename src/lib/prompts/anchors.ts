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

const LOCATIONS = [
	"a neon-drenched cyberpunk megacity with Cyrillic neon signs",
	"a medieval castle banquet hall hung with blue-and-red banners",
	"a palace square at golden hour",
	"a night highway arched with rainbow neon lights",
	"a stadium concert stage with searchlights",
	"a flooded underwater laboratory full of bubbles",
	"a half-ruined city street with heroes mid-battle",
	"a sunset mountain ridge above the clouds",
	"a golden throne room with marble columns",
	"a rooftop helipad above the clouds",
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
] as const;

const CREATURES = [
	"a pug in a leopard fur coat and gold chains",
	"a hippopotamus DJ in a fur coat with headphones",
	"giraffes riding electric scooters",
	"flamingos dripping in gold jewelry",
	"a rhinoceros in a business suit",
	"a squad of pugs in tiny tuxedos",
	"an anthropomorphic cactus in dark sunglasses",
	"a lion wearing a diamond crown",
	"a monkey in a sequined jacket",
	"a battle-scarred armored turtle",
] as const;

const LUXURY = [
	"a diamond-encrusted disco ball",
	"a chest of gold bars",
	"a money belt and ruby rings",
	"a huge golden crown",
	"oversized luxury sneakers",
	"a gold chain with a giant 42 medallion",
	"a glass case of rubies",
	"a leopard fur coat with a towering fur collar",
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
	"a champagne fountain shaped like a crown",
	"a diamond-encrusted cash register spilling banknotes",
	"a smiling porcelain pug statue holding a scepter",
	"a golden saxophone played by a flamingo",
	"a velvet throne mounted on a hoverboard",
	"a crystal trophy cabinet full of 42-shaped awards",
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
}

export function buildUserMessage(
	userInput: string,
	anchors: Anchors,
	options: UserMessageOptions = {},
): string {
	const clean = userInput
		.trim()
		.replace(/\s+/g, " ")
		.replace(/<<<|>>>/g, " ");
	const exactTexts = options.exactTexts ?? [];
	const textCandidates = options.textCandidates ?? [];
	const omit = new Set(options.omit ?? []);
	const anchorLines = ANCHOR_CATEGORIES.filter(
		(category) =>
			(!category.requiresText || options.textRequested) &&
			!(
				category.key === "slogan" &&
				(exactTexts.length > 0 || textCandidates.length > 0)
			) &&
			!omit.has(category.key),
	)
		.map((category) => `${category.label}: ${anchors[category.key]}`)
		.join("\n");

	const textLine = options.textRequested
		? "TEXT: requested — carry the user's exact wording literally, quoted, up to three inscriptions."
		: "TEXT: none — no words or letters anywhere in the frame; only the giant numeric 42 emblem is allowed (at most twice).";

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
	return `ANCHORS FOR THIS GENERATION (42-canon fillers for the gaps the request leaves open: keep them secondary, never in the first sentence, never instead of the user's hero, place, action, colors or mood; drop one if it contradicts the request):
${anchorLines}

${textLine}${exactLine}${candidatesLine}${userOwnedLine}${missingLine}${hijackLine}

<<<USER_REQUEST
${clean}
>>>

The hero of the image is what USER_REQUEST names (people stay people, named places stay places). Open the prompt with that hero, its action and its place; the anchors only decorate the background.`;
}
