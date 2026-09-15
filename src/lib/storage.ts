import { S3Client } from "bun";

const s3Client = new S3Client({
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
