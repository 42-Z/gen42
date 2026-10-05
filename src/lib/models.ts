export type SpaceEngine = "krea" | "ideogram";
export type ImageEngine = SpaceEngine | "turbo";

export interface ImageModelDef {
	/** Отображаемое имя для интерфейса */
	label: string;
	/** Стоимость одной генерации в кредитах */
	cost: number;
	/** Базовый адрес Gradio API Space */
	apiBase: string;
	/** Именованный эндпоинт Space */
	apiName: string;
	/** Сколько ждать результат (очередь ZeroGPU + генерация), мс */
	pollTimeoutMs: number;
}

export const IMAGE_MODELS: Record<SpaceEngine, ImageModelDef> = {
	krea: {
		label: "Krea 2",
		cost: 1,
		apiBase: "https://krea-krea-2.hf.space/gradio_api",
		apiName: "generate",
		pollTimeoutMs: 120_000,
	},
	ideogram: {
		label: "Ideogram 4",
		cost: 3,
		apiBase: "https://ideogram-ai-ideogram4.hf.space/gradio_api",
		apiName: "generate",
		pollTimeoutMs: 180_000,
	},
};

/** Турбо: агент подбирает изображения из библиотеки и рисует через подписку ChatGPT. Без адреса Space. */
export const TURBO_MODEL = { label: "Турбо", cost: 10 } as const;

export const DEFAULT_IMAGE_ENGINE: SpaceEngine = "krea";

/** Пресет Ideogram 4: режим и число шагов фиксированы */
export const IDEOGRAM_MODE = "Default · 20 steps";
export const IDEOGRAM_STEPS = 20;

/** Имена движков для клиентского фолбэка, пока список моделей не загрузился */
export const IMAGE_ENGINE_LABELS: Record<ImageEngine, string> = {
	krea: IMAGE_MODELS.krea.label,
	ideogram: IMAGE_MODELS.ideogram.label,
	turbo: TURBO_MODEL.label,
};

export function isSpaceEngine(value: unknown): value is SpaceEngine {
	return value === "krea" || value === "ideogram";
}

export function isImageEngine(value: unknown): value is ImageEngine {
	return isSpaceEngine(value) || value === "turbo";
}

/**
 * Приводит произвольное значение из запроса к известному движку. Турбо принимается
 * только при рабочем входе Codex: иначе он «неизвестен», как любое другое значение.
 */
export function resolveImageEngine(
	value: unknown,
	turboAvailable = false,
): ImageEngine {
	if (value === "turbo") return turboAvailable ? "turbo" : DEFAULT_IMAGE_ENGINE;
	return isSpaceEngine(value) ? value : DEFAULT_IMAGE_ENGINE;
}

export function getImageModel(engine: SpaceEngine): ImageModelDef {
	return IMAGE_MODELS[engine];
}

export function getEngineCost(engine: ImageEngine): number {
	return engine === "turbo" ? TURBO_MODEL.cost : IMAGE_MODELS[engine].cost;
}

export interface PublicImageModel {
	id: ImageEngine;
	label: string;
	cost: number;
}

/** Безопасный для клиента список моделей (без внутренних адресов Space); Турбо — только когда доступен */
export function publicImageModels(
	options: { turbo?: boolean } = {},
): PublicImageModel[] {
	const spaces = (Object.keys(IMAGE_MODELS) as SpaceEngine[]).map((id) => ({
		id,
		label: IMAGE_MODELS[id].label,
		cost: IMAGE_MODELS[id].cost,
	}));
	return options.turbo
		? [
				...spaces,
				{ id: "turbo", label: TURBO_MODEL.label, cost: TURBO_MODEL.cost },
			]
		: spaces;
}
