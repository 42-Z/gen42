const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number,
): boolean {
	const now = Date.now();
	const record = rateLimitMap.get(key);

	if (!record || now > record.resetTime) {
		rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
		return true;
	}

	if (record.count >= limit) {
		return false;
	}

	record.count++;
	return true;
}

export function cleanupRateLimit() {
	const now = Date.now();
	for (const [key, record] of rateLimitMap.entries()) {
		if (now > record.resetTime) {
			rateLimitMap.delete(key);
		}
	}
}

setInterval(cleanupRateLimit, 5 * 60 * 1000);
