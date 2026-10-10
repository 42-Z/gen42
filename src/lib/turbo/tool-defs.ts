import { tool } from "ai";
import { z } from "zod";
import {
	type ListFolderResult,
	MAX_INPUT_IMAGES,
	type ReadFileResult,
} from "./library";
import { pickRandom } from "./random";

/**
 * Итог проверки generateImage: рисование идёт после остановки агента отдельным
 * шагом воркфлоу, поэтому «ok: true» значит «принято».
 */
export type CheckImageOutput =
	| { ok: true }
	| { ok: false; retryable: true; error: string };

/** Исполнители инструментов: в воркфлоу это шаги, в скрипте eval обычные функции */
export interface TurboToolExecutors {
	listFolder(input: { path: string }): Promise<ListFolderResult>;
	readFile(input: { path: string }): Promise<ReadFileResult>;
	checkImage(input: {
		prompt: string;
		images: string[];
	}): Promise<CheckImageOutput>;
}

/**
 * Описания и схемы инструментов агента. Исполнитель вызывается только с входом
 * инструмента: SDK передаёт `execute` вторым аргументом всю историю сообщений
 * (с картинками), а шаг сериализует все свои аргументы. `random` подменяется в
 * тестах; в воркфлоу это `Math.random()` с зерном прогона.
 */
export function createTurboTools(
	executors: TurboToolExecutors,
	random: () => number = Math.random,
) {
	return {
		random: tool({
			description:
				"Возвращает случайный элемент списка. Вход: options — варианты одного решения кадра, от двух, разительно разные по виду, а не по оттенку. На каждое решение свой вызов, все вызовы одним раундом.",
			inputSchema: z.object({
				options: z
					.array(z.string())
					.describe("Варианты одного решения, из которых выбрать"),
			}),
			execute: async ({ options }) => pickRandom(options, random),
		}),

		listFolder: tool({
			description:
				"Показывает файлы папки библиотеки с типом (изображение или текст). Вход: имя папки из дерева, например «пятерка».",
			inputSchema: z.object({
				path: z.string().describe("Имя папки из дерева библиотеки"),
			}),
			execute: (input) => executors.listFolder(input),
		}),

		readFile: tool({
			description:
				"Читает файл библиотеки. Текст приходит строкой, изображение ты видишь сам. Вход: полный путь «папка/файл».",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Полный путь, например «эмблемы/flag_of_42.png»"),
			}),
			execute: (input) => executors.readFile(input),
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
			description: `Принимает итоговый промпт и выбранные изображения и проверяет аргументы. ok: true — принято, запуск закончен, картинку рисует сервер. ok: false — исправь аргументы по полю error и вызови снова. images — от 0 до ${MAX_INPUT_IMAGES} путей «папка/файл»; порядок задаёт номера Image 1…N в промпте.`,
			inputSchema: z.object({
				prompt: z.string().describe("Готовый промпт на английском"),
				images: z
					.array(z.string())
					.describe("Пути входных изображений, пустой массив — без них"),
			}),
			execute: (input) => executors.checkImage(input),
		}),
	};
}
