import {
	getImageModel,
	IDEOGRAM_MODE,
	type ImageEngine,
	resolveImageEngine,
} from "./models";

interface GenerateParams {
	/** Движок генерации; по умолчанию Krea 2 */
	engine?: ImageEngine;
	prompt: string;
	negativePrompt?: string;
	model?: "Turbo" | "Raw";
	width?: number;
	height?: number;
	steps?: number;
	seed?: number | null;
}

interface GenerateResult {
	imageUrl: string;
	seed: number;
}

/** Настройки Ideogram 4: без пользовательских опций, фиксированный пресет */
const IDEOGRAM_UPSAMPLER = "Ideogram (remote)";

export interface ZeroGPURuns {
	used: number | null;
	limit: number | null;
	remaining: number | null;
	resetsAt: string | null;
}

export interface ZeroGPUQuota {
	base: number;
	current: number;
	resetsAt: string | null;
	runs: ZeroGPURuns | null;
}

function quotaNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRuns(value: unknown): ZeroGPURuns | null {
	if (typeof value !== "object" || value === null) return null;
	const runs = value as Record<string, unknown>;
	return {
		used: quotaNumber(runs.used),
		limit: quotaNumber(runs.limit),
		remaining: quotaNumber(runs.remaining),
		resetsAt: typeof runs.resetsAt === "string" ? runs.resetsAt : null,
	};
}

export async function getZeroGPUQuota(
	apiKey: string,
): Promise<ZeroGPUQuota | null> {
	try {
		const res = await fetch(
			"https://huggingface.co/api/spaces/zero-gpu/quota",
			{
				headers: { Authorization: `Bearer ${apiKey}` },
			},
		);
		if (!res.ok) return null;
		const data = await res.json();
		return {
			base: data.base,
			current: data.current,
			resetsAt: data.resetsAt,
			runs: parseRuns(data.runs),
		};
	} catch {
		return null;
	}
}

export class KeyExhaustedError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export class QueueTimeoutError extends Error {
	constructor(message: string) {
		super(message);
	}
}

function assertNotExhausted(response: Response): void {
	if (response.ok) return;
	if (response.status === 429 || response.status === 503) {
		throw new KeyExhaustedError(
			response.status,
			`Key exhausted: ${response.status}`,
		);
	}
}

/**
 * Вызывает именованный эндпоинт Gradio Space: отправляет payload, затем
 * опрашивает SSE и разбирает `event: error` в доменные ошибки.
 * Возвращает массив `data` из финального события.
 */
async function callSpace(options: {
	apiBase: string;
	apiName: string;
	payload: Record<string, unknown>;
	apiKey: string;
	timeoutMs: number;
}): Promise<unknown[]> {
	const { apiBase, apiName, payload, apiKey, timeoutMs } = options;

	const submitResponse = await fetch(`${apiBase}/call/v2/${apiName}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(payload),
	});

	if (!submitResponse.ok) {
		assertNotExhausted(submitResponse);
		const error = await submitResponse.text();
		throw new Error(
			`HuggingFace API error: ${submitResponse.status} - ${error}`,
		);
	}

	const { event_id } = await submitResponse.json();

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		// Именованный эндпоинт отдаёт результат по /call/v2/{api}/{event};
		// часть Space-ов принимает только /call/{api}/{event}.
		let resultResponse = await fetch(
			`${apiBase}/call/v2/${apiName}/${event_id}`,
			{
				headers: { Authorization: `Bearer ${apiKey}` },
				signal: controller.signal,
			},
		);
		if (resultResponse.status === 404) {
			resultResponse = await fetch(`${apiBase}/call/${apiName}/${event_id}`, {
				headers: { Authorization: `Bearer ${apiKey}` },
				signal: controller.signal,
			});
		}

		if (!resultResponse.ok) {
			assertNotExhausted(resultResponse);
			throw new Error(`HuggingFace polling error: ${resultResponse.status}`);
		}

		const text = await resultResponse.text();

		for (const line of text.split("\n")) {
			if (line.startsWith("event: error")) {
				const errorLine = text.split("\n").find((l) => l.startsWith("data: "));
				const payload = errorLine
					? (JSON.parse(errorLine.slice(6)) as {
							error?: string;
							title?: string;
						})
					: null;
				const message =
					payload?.error ?? payload?.title ?? "unknown generation error";
				const title = payload?.title ?? "";

				if (/queue timeout|no gpu was available/i.test(`${title} ${message}`)) {
					throw new QueueTimeoutError(`ZeroGPU queue: ${message}`);
				}
				if (/zero-?gpu|quota/i.test(`${title} ${message}`)) {
					throw new KeyExhaustedError(429, `ZeroGPU quota: ${message}`);
				}
				throw new Error(`HuggingFace generation error: ${message}`);
			}
			if (line.startsWith("data: ")) {
				const data = JSON.parse(line.slice(6));
				// финальное событие — кортеж [картинка, seed]; промежуточные
				// стриминговые массивы пропускаем
				if (
					Array.isArray(data) &&
					data.length >= 2 &&
					(data[0] as { url?: string })?.url
				) {
					return data;
				}
			}
		}

		throw new Error("No result received from HuggingFace API");
	} finally {
		clearTimeout(timeout);
	}
}

function buildPayload(
	engine: ImageEngine,
	params: GenerateParams,
): Record<string, unknown> {
	const {
		prompt,
		negativePrompt = "",
		model = "Turbo",
		width = 1024,
		height = 1024,
		steps = 8,
		seed = null,
	} = params;

	if (engine === "ideogram") {
		// Ideogram 4 не принимает negative prompt и свой model: качество
		// задаётся пресетом mode, промпт дополнительно апсемплится в JSON-капшн.
		return {
			prompt,
			mode: IDEOGRAM_MODE,
			upsampler: IDEOGRAM_UPSAMPLER,
			width,
			height,
			seed: seed ?? 0,
			randomize_seed: seed === null,
		};
	}

	return {
		prompt,
		negative_prompt: negativePrompt,
		model,
		steps,
		guidance: 0.0,
		width,
		height,
		seed: seed ?? 0,
		randomize: seed === null,
	};
}

function extractResult(data: unknown[]): GenerateResult {
	const image = data[0] as { url?: string } | undefined;
	if (!image?.url) {
		throw new Error("No image URL received from HuggingFace API");
	}
	const seed = data[1];
	if (typeof seed !== "number" || !Number.isFinite(seed)) {
		throw new Error("No valid seed received from HuggingFace API");
	}
	return { imageUrl: image.url, seed };
}

export async function generateImage(
	params: GenerateParams,
	apiKey: string,
): Promise<GenerateResult> {
	const engine = resolveImageEngine(params.engine);
	const model = getImageModel(engine);

	const data = await callSpace({
		apiBase: model.apiBase,
		apiName: model.apiName,
		payload: buildPayload(engine, params),
		apiKey,
		timeoutMs: model.pollTimeoutMs,
	});

	return extractResult(data);
}
