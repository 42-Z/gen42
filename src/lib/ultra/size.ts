const DEFAULT_SIZE = { width: 1024, height: 1024 };

/** «1024x1536» → размеры; всё непонятное — стандартный квадрат */
export function parseImageSize(size: string | null): {
	width: number;
	height: number;
} {
	const match = size?.match(/^(\d{2,5})x(\d{2,5})$/);
	if (!match) return DEFAULT_SIZE;
	return { width: Number(match[1]), height: Number(match[2]) };
}
