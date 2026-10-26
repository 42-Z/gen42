const IMAGE_MEDIA_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

export type FileKind = "image" | "text";

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function kindOf(name: string): FileKind | null {
	const ext = extensionOf(name);
	if (ext in IMAGE_MEDIA_TYPES) return "image";
	if (ext === "txt" || ext === "md") return "text";
	return null;
}

export function imageMediaType(name: string): string | null {
	return IMAGE_MEDIA_TYPES[extensionOf(name)] ?? null;
}
