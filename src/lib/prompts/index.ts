import { createHash } from "node:crypto";
import style42System from "./style42.system.md" with { type: "text" };

export const STYLE_SYSTEM = style42System.trim();
export const STYLE_VERSION = createHash("sha256")
	.update(STYLE_SYSTEM)
	.digest("hex")
	.slice(0, 16);

export type { Anchors } from "./anchors";
export { ANCHOR_CATEGORIES, buildUserMessage, pickAnchors } from "./anchors";
export type { ContractResult } from "./contract";
export {
	sanitizeEnhancedPrompt,
	validateEnhancedPrompt,
} from "./contract";
