export type SpaceEngine = "krea" | "ideogram";
export type ImageEngine = SpaceEngine | "ultra";
export type GenerationMode = "image" | "ultra";

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

/** Движок «Ультра»: агент подбирает изображения из библиотеки и рисует через подписку ChatGPT. Без адреса Space. */
export const ULTRA_MODEL = { label: "Ультра", cost: 10 } as const;

export const DEFAULT_IMAGE_ENGINE: SpaceEngine = "krea";

/** Пресет Ideogram 4: режим и число шагов фиксированы */
export const IDEOGRAM_MODE = "Default · 20 steps";
export const IDEOGRAM_STEPS = 20;

/** Имена движков для клиентского фолбэка, пока список моделей не загрузился */
export const IMAGE_ENGINE_LABELS: Record<ImageEngine, string> = {
	krea: IMAGE_MODELS.krea.label,
	ideogram: IMAGE_MODELS.ideogram.label,
	ultra: ULTRA_MODEL.label,
};

export function isSpaceEngine(value: unknown): value is SpaceEngine {
	return value === "krea" || value === "ideogram";
}

export function isImageEngine(value: unknown): value is ImageEngine {
	return isSpaceEngine(value) || value === "ultra";
}

/** Считывает режим из браузера; старое значение сохраняется после переименования. */
export function parseGenerationMode(value: unknown): GenerationMode {
	return value === "ultra" || value === "turbo" ? "ultra" : "image";
}

/**
 * Приводит произвольное значение из запроса к известному движку. Старое значение
 * `turbo` принимается как алиас для уже открытых вкладок. «Ультра» доступна только
 * при рабочем входе Codex: иначе значение считается неизвестным.
 */
export function resolveImageEngine(
	value: unknown,
	ultraAvailable = false,
): ImageEngine {
	if (value === "ultra" || value === "turbo") {
		return ultraAvailable ? "ultra" : DEFAULT_IMAGE_ENGINE;
	}
	return isSpaceEngine(value) ? value : DEFAULT_IMAGE_ENGINE;
}

export function getImageModel(engine: SpaceEngine): ImageModelDef {
	return IMAGE_MODELS[engine];
}

export function getEngineCost(engine: ImageEngine): number {
	return engine === "ultra" ? ULTRA_MODEL.cost : IMAGE_MODELS[engine].cost;
}

/** `turbo` — только совместимость с уже загруженными старыми интерфейсами. */
export type PublicImageModelId = ImageEngine | "turbo";

export interface PublicImageModel {
	id: PublicImageModelId;
	label: string;
	cost: number;
}

/** Безопасный для клиента список моделей (без внутренних адресов Space); «Ультра» — только когда доступен */
export function publicImageModels(
	options: { ultra?: boolean } = {},
): PublicImageModel[] {
	const spaces = (Object.keys(IMAGE_MODELS) as SpaceEngine[]).map((id) => ({
		id,
		label: IMAGE_MODELS[id].label,
		cost: IMAGE_MODELS[id].cost,
	}));
	if (!options.ultra) return spaces;

	const ultra: PublicImageModel = {
		id: "ultra",
		label: ULTRA_MODEL.label,
		cost: ULTRA_MODEL.cost,
	};
	const legacyTurbo: PublicImageModel = { ...ultra, id: "turbo" };
	return [...spaces, ultra, legacyTurbo];
}
