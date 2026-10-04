import { tool } from "ai";
import { z } from "zod";
import { CodexImageError, type EditImageResult } from "./codex-images";
import { TurboError } from "./errors";
import { type Library, MAX_INPUT_IMAGES, type ResolvedImage } from "./library";

/** Сколько раз агент может поправить аргументы generateImage после ошибки проверки */
const MAX_ARGUMENT_RETRIES = 2;

export type EditFn = (params: {
	prompt: string;
	images: ResolvedImage[];
	signal?: AbortSignal;
}) => Promise<EditImageResult>;

/** Итог запуска: инструменты кладут сюда результат, агент картинку не видит */
export interface TurboRun {
	png: Uint8Array | null;
	prompt: string | null;
	inputImages: string[];
	/** Размер, который выбрал сервер (например «1024x1536») */
	size: string | null;
	failure: TurboError | null;
	argumentErrors: number;
}

export function createTurboRun(): TurboRun {
	return {
		png: null,
		prompt: null,
		inputImages: [],
		size: null,
		failure: null,
		argumentErrors: 0,
	};
}

/** Запуск закончен: картинка получена или генерацию окончательно отклонили */
export function isRunFinished(run: TurboRun): boolean {
	return run.png !== null || run.failure !== null;
}

export type GenerateImageOutput =
	| { ok: true }
	| { ok: false; retryable: boolean; error: string };

export function createTurboTools(deps: {
	library: Library;
	edit: EditFn;
	run: TurboRun;
}) {
	const { library, edit, run } = deps;

	return {
		listFolder: tool({
			description:
				"Показывает файлы папки библиотеки с типом (изображение или текст). Вход: имя папки из дерева, например «пятерка».",
			inputSchema: z.object({
				path: z.string().describe("Имя папки из дерева библиотеки"),
			}),
			execute: async ({ path }) => library.listFolder(path),
		}),

		readFile: tool({
			description:
				"Читает файл библиотеки. Текст приходит строкой, изображение ты видишь сам. Вход: полный путь «папка/файл».",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Полный путь, например «эмблемы/flag_of_42.png»"),
			}),
			execute: async ({ path }) => library.readFile(path),
			toModelOutput: ({ output }) => {
				if (output.ok && output.kind === "image") {
					return {
						type: "content",
						value: [
							{ type: "text", text: `Изображение ${output.path}` },
							{
								type: "file",
								mediaType: output.mediaType,
								data: { type: "data", data: output.base64 },
							},
						],
					};
				}
				return { type: "json", value: output };
			},
		}),

		generateImage: tool({
			description: `Рисует итоговую картинку по промпту и выбранным изображениям. Вызывается один раз за прогон, это финальный шаг. images — от 0 до ${MAX_INPUT_IMAGES} путей «папка/файл»; порядок задаёт номера Image 1…N в промпте.`,
			inputSchema: z.object({
				prompt: z.string().describe("Готовый промпт на английском"),
				images: z
					.array(z.string())
					.describe("Пути входных изображений, пустой массив — без них"),
			}),
			execute: async (
				{ prompt, images },
				{ abortSignal },
			): Promise<GenerateImageOutput> => {
				const rejectArguments = (error: string): GenerateImageOutput => {
					run.argumentErrors += 1;
					if (run.argumentErrors > MAX_ARGUMENT_RETRIES) {
						run.failure = new TurboError(
							"agent_no_generation",
							`Агент не смог собрать допустимые аргументы generateImage: ${error}`,
						);
						return { ok: false, retryable: false, error };
					}
					return { ok: false, retryable: true, error };
				};

				if (prompt.trim().length === 0) {
					return rejectArguments("Пустой промпт");
				}
				const resolved = await library.resolveImages(images);
				if (!resolved.ok) {
					return rejectArguments(resolved.error);
				}

				try {
					const result = await edit({
						prompt,
						images: resolved.images,
						...(abortSignal ? { signal: abortSignal } : {}),
					});
					run.png = result.png;
					run.prompt = prompt;
					run.inputImages = resolved.images.map((image) => image.path);
					run.size = result.size;
					return { ok: true };
				} catch (error) {
					const unauthorized =
						error instanceof CodexImageError &&
						(error.status === 401 || error.status === 403);
					run.failure = new TurboError(
						unauthorized ? "codex_auth_required" : "generation_rejected",
						error instanceof Error ? error.message : String(error),
						{
							cause: error,
							details: {
								prompt,
								inputImages: resolved.images.map((image) => image.path),
							},
						},
					);
					return {
						ok: false,
						retryable: false,
						error: "Генерация отклонена или не удалась",
					};
				}
			},
		}),
	};
}
