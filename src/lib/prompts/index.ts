import { createHash } from "node:crypto";
import { STYLE_SYSTEM_42 } from "./style42.system";

export const STYLE_SYSTEM = STYLE_SYSTEM_42.trim();
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
