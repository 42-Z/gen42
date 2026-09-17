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

export interface ZeroGPUQuota {
	base: number;
	current: number;
	resetsAt: string | null;
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
		return { base: data.base, current: data.current, resetsAt: data.resetsAt };
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

const HF_API_BASE = "https://krea-krea-2.hf.space/gradio_api";
const POLL_TIMEOUT_MS = 45_000;

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

				if (/zero-?gpu|quota/i.test(`${payload?.title ?? ""} ${message}`)) {
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
