import type { Anchors } from "./prompts/anchors";

export function buildFallbackPrompt(
	userInput: string,
	anchors: Anchors,
	options: {
		textRequested?: boolean;
		exactTexts?: string[];
		omit?: readonly (keyof Anchors)[];
	} = {},
): string {
	const clean = userInput.trim().replace(/\s+/g, " ");
	const omit = new Set(options.omit ?? []);
	const place = omit.has("location")
		? "the setting named in the request"
		: anchors.location;

	return [
		`An ultra-detailed 42-style scene centered on: ${clean}.`,
		`The subject dominates the foreground and keeps the place, action, colors and mood of the request, while the world around it is a 42 cult carnival: ${anchors.creatures} in the background of ${place}${omit.has("transport") ? "" : `, with ${anchors.transport} parked or hovering nearby`}.`,
		`Luxury overload: ${anchors.luxury}${omit.has("props") ? "" : `, ${anchors.props}`}, gold chains, leopard fur, crowns, gold bars and diamond sparkle on every surface.`,
		omit.has("lighting") ? "" : `${anchors.lighting}.`,
		`Render it as ${anchors.medium}.`,
		options.textRequested
			? `Blue-and-red ceremonial banners with white 42 emblems carry the exact text ${(options.exactTexts?.length ? options.exactTexts : [anchors.slogan]).map((text) => `«${text}»`).join(" and ")}, plus a giant glowing 42 in the background.`
			: `Blue-and-red ceremonial banners with white 42 emblems fill the background, with a single giant glowing 42 as the only text in the frame.`,
		`Wide-angle poster composition, epic scale, confetti and fireworks in the air, absurd triumphant kitsch, no watermarks, no signature.`,
	]
		.filter(Boolean)
		.join(" ");
}
