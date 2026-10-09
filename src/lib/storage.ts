// Глобальный `Bun.S3Client`, а не `import … from "bun"`: сборщик Workflow бандлит код
// шагов через esbuild и не умеет разрешать импорт "bun" в финальном бандле
const s3Client = new Bun.S3Client({
	accessKeyId: process.env.S3_ACCESS_KEY_ID!,
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
	endpoint: process.env.S3_ENDPOINT!,
	region: process.env.S3_REGION!,
	bucket: process.env.S3_BUCKET!,
});

export async function uploadImage(
	key: string,
	buffer: Buffer,
	contentType: string,
): Promise<void> {
	const file = s3Client.file(key);
	await file.write(
		new Response(new Uint8Array(buffer), {
			headers: { "Content-Type": contentType },
		}),
	);
}

export async function getImageUrl(
	key: string,
	expiresIn = 3600,
): Promise<string> {
	const file = s3Client.file(key);
	return file.presign({
		expiresIn,
	});
}

export async function deleteImage(key: string): Promise<void> {
	const file = s3Client.file(key);
	await file.delete();
}

export interface StoredObject {
	key: string;
	size: number;
}

/** Все объекты под префиксом (постранично) */
export async function listObjects(prefix: string): Promise<StoredObject[]> {
	const objects: StoredObject[] = [];
	let continuationToken: string | undefined;
	do {
		const page = await s3Client.list({
			prefix,
			...(continuationToken ? { continuationToken } : {}),
		});
		for (const item of page.contents ?? []) {
			objects.push({ key: item.key, size: item.size ?? 0 });
		}
		continuationToken = page.isTruncated
			? page.nextContinuationToken
			: undefined;
	} while (continuationToken);
	return objects;
}

/** Содержимое объекта; нет объекта — null */
export async function readObject(key: string): Promise<Uint8Array | null> {
	const file = s3Client.file(key);
	if (!(await file.exists())) return null;
	return file.bytes();
}
