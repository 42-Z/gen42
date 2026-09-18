export type ImageEngine = "krea" | "ideogram";

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

export const IMAGE_MODELS: Record<ImageEngine, ImageModelDef> = {
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

export const DEFAULT_IMAGE_ENGINE: ImageEngine = "krea";

/** Пресет Ideogram 4: режим и число шагов фиксированы */
export const IDEOGRAM_MODE = "Default · 20 steps";
export const IDEOGRAM_STEPS = 20;

/** Имена движков для клиентского фолбэка, пока список моделей не загрузился */
export const IMAGE_ENGINE_LABELS: Record<ImageEngine, string> = {
	krea: IMAGE_MODELS.krea.label,
	ideogram: IMAGE_MODELS.ideogram.label,
};

export function isImageEngine(value: unknown): value is ImageEngine {
	return value === "krea" || value === "ideogram";
}

/** Приводит произвольное значение из запроса к известному движку */
export function resolveImageEngine(value: unknown): ImageEngine {
	return isImageEngine(value) ? value : DEFAULT_IMAGE_ENGINE;
}

export function getImageModel(engine: ImageEngine): ImageModelDef {
	return IMAGE_MODELS[engine];
}

export interface PublicImageModel {
	id: ImageEngine;
	label: string;
	cost: number;
}

/** Безопасный для клиента список моделей (без внутренних адресов Space) */
export function publicImageModels(): PublicImageModel[] {
	return (Object.keys(IMAGE_MODELS) as ImageEngine[]).map((id) => ({
		id,
		label: IMAGE_MODELS[id].label,
		cost: IMAGE_MODELS[id].cost,
	}));
}
