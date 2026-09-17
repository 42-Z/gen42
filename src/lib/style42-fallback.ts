import type { Anchors } from "./prompts/anchors";

export function buildFallbackPrompt(
	userInput: string,
	anchors: Anchors,
): string {
	const clean = userInput.trim().replace(/\s+/g, " ");

	return [
		`An ultra-detailed 42-style scene centered on: ${clean}.`,
		`The subject dominates the foreground while the world around it is a maximalist 42 cult carnival: ${anchors.creatures} crowding the ${anchors.location}, with ${anchors.transport} parked or hovering nearby.`,
		`Luxury overload: ${anchors.luxury}, gold chains, leopard fur, crowns, gold bars and diamond sparkle on every surface.`,
		`${anchors.lighting}.`,
		`Render it as ${anchors.medium}.`,
		`Neon signs and blue-and-red ceremonial banners with white 42 emblems carry the exact Cyrillic text «${anchors.slogan}», plus a giant glowing 42 in the background.`,
		`Wide-angle poster composition, epic scale, hyper-saturated gold-and-neon palette, confetti and fireworks in the air, absurd triumphant kitsch, no watermarks, no signature.`,
	].join(" ");
}
