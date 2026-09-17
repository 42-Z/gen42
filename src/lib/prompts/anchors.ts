export interface Anchors {
	location: string;
	transport: string;
	creatures: string;
	luxury: string;
	slogan: string;
	medium: string;
	lighting: string;
}

export interface AnchorCategory {
	key: keyof Anchors;
	label: string;
	values: readonly string[];
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
	"a fur-collar coat on a velvet hanger",
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

const MEDIUMS = [
	"hyper-detailed cinematic photograph",
	"glossy 3D render with toy-like proportions",
	"anime poster with speed lines and impact bubbles",
	"pixel-art vaporwave collage",
	"thick oil painting with canvas texture",
	"comic-book cover art with halftone dots",
] as const;

const LIGHTING = [
	"fireworks spelling 42 in the sky",
	"stroboscopic rainbow party lighting",
	"neon signage glow with confetti in the air",
	"golden hour backlight with lens flares",
	"laser beams and holographic reflections",
	"harsh flash with diamond sparkle",
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
	{ key: "slogan", label: "slogan", values: SLOGANS },
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

export function buildUserMessage(userInput: string, anchors: Anchors): string {
	const clean = userInput.trim().replace(/\s+/g, " ");
	const anchorLines = ANCHOR_CATEGORIES.map(
		(category) => `${category.label}: ${anchors[category.key]}`,
	).join("\n");

	return `<<<USER_REQUEST
${clean}
>>>

ANCHORS FOR THIS GENERATION (must be woven in organically, keep the user's idea as the hero of the scene):
${anchorLines}`;
}
