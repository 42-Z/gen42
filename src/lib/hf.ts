interface GenerateParams {
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

const HF_API_BASE = "https://krea-krea-2.hf.space/gradio_api";
// Очередь ZeroGPU сама сдаётся до ~60s ("No GPU was available after 60s"),
// затем идёт генерация — опрос должен пережидать обе фазы
const POLL_TIMEOUT_MS = 120_000;

export async function generateImage(
	params: GenerateParams,
	apiKey: string,
): Promise<GenerateResult> {
	const {
		prompt,
		negativePrompt = "",
		model = "Turbo",
		width = 1024,
		height = 1024,
		steps = 8,
		seed = null,
	} = params;

	const submitResponse = await fetch(`${HF_API_BASE}/call/v2/generate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			prompt,
			negative_prompt: negativePrompt,
			model,
			steps,
			guidance: 0.0,
			width,
			height,
			seed: seed ?? 0,
			randomize: seed === null,
		}),
	});

	if (!submitResponse.ok) {
		if (submitResponse.status === 429 || submitResponse.status === 503) {
			throw new KeyExhaustedError(
				submitResponse.status,
				`Key exhausted: ${submitResponse.status}`,
			);
		}
		const error = await submitResponse.text();
		throw new Error(
			`HuggingFace API error: ${submitResponse.status} - ${error}`,
		);
	}

	const { event_id } = await submitResponse.json();

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

	try {
		const resultResponse = await fetch(
			`${HF_API_BASE}/call/v2/generate/${event_id}`,
			{
				headers: { Authorization: `Bearer ${apiKey}` },
				signal: controller.signal,
			},
		);

		if (!resultResponse.ok) {
			if (resultResponse.status === 429 || resultResponse.status === 503) {
				throw new KeyExhaustedError(
					resultResponse.status,
					`Key exhausted: ${resultResponse.status}`,
				);
			}
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
				if (Array.isArray(data) && data.length >= 2 && data[0]?.url) {
					return { imageUrl: data[0].url, seed: data[1] };
				}
			}
		}

		throw new Error("No result received from HuggingFace API");
	} finally {
		clearTimeout(timeout);
	}
}
