/**
 * Проверка CORS бакета для прямой загрузки из браузера и попытка поставить
 * правило, если его нет.
 *
 * Запуск: NODE_ENV=development node_modules/.bin/bun --env-file=.env.development scripts/storage-cors.ts
 * Прод:   NODE_ENV=production node_modules/.bin/bun --env-file=.env scripts/storage-cors.ts
 *
 * Факт 2026-10-24: на dev и prod бакетах правило уже стоит (`GET ?cors` и
 * preflight отвечают 200), а `PutBucketCors` через S3 API Neon beta возвращает
 * `NoSuchBucket`. Если правила вдруг нет, ставьте его в Neon Console →
 * Object storage, а не этим скриптом.
 */
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) {
	console.error(
		"Нужны S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
	);
	process.exit(1);
}

const url = `${endpoint.replace(/\/$/, "")}/${bucket}?cors`;
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

function curl(args: string[]) {
	return Bun.spawnSync({
		cmd: [
			"curl",
			"--silent",
			"--show-error",
			"--fail-with-body",
			"--aws-sigv4",
			`aws:amz:${region}:s3`,
			"--user",
			`${accessKeyId}:${secretAccessKey}`,
			...args,
		],
		stdout: "pipe",
		stderr: "pipe",
	});
}

const current = curl(["-X", "GET", url]);
const currentBody = new TextDecoder().decode(current.stdout);
if (
	current.exitCode === 0 &&
	currentBody.includes("<AllowedMethod>PUT</AllowedMethod>") &&
	currentBody.includes("<AllowedOrigin>*</AllowedOrigin>")
) {
	console.log("CORS уже настроен:");
	console.log(currentBody);
	process.exit(0);
}

console.error(
	"CORS не настроен или не разрешает PUT, пробую поставить правило",
);
const put = curl([
	"-X",
	"PUT",
	"-H",
	"Content-Type: application/xml",
	"--data-binary",
	xml,
	url,
]);
if (put.exitCode !== 0) {
	console.error(new TextDecoder().decode(put.stdout));
	console.error(new TextDecoder().decode(put.stderr));
	console.error(
		"Neon beta не принял PutBucketCors. Поставьте правило в Neon Console → Object storage: AllowedOrigin *, методы GET/PUT/HEAD, заголовки *.",
	);
	process.exit(1);
}

const check = curl(["-X", "GET", url]);
if (check.exitCode !== 0) {
	console.error(new TextDecoder().decode(check.stderr));
	process.exit(check.exitCode ?? 1);
}
console.log(new TextDecoder().decode(check.stdout));
