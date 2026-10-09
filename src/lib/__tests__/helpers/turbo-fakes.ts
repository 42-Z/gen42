import { mock } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { Library, type LibraryStorage } from "../../turbo/library";
import type { EditFn } from "../../turbo/ops";
import type { TurboRuntime } from "../../turbo/workflow-runtime";

/** Настоящий PNG 1×1: его умеет декодировать Bun.Image (превью) */
export const TINY_PNG = new Uint8Array(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64",
	),
);
export const RESULT_PNG = new Uint8Array([9, 9, 9]);

export const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** Библиотека в памяти: папка «пятерка» с картинкой и описаниями */
export function libraryStorage(): LibraryStorage {
	const objects: Record<string, Uint8Array> = {
		"library/пятерка/a.png": TINY_PNG,
		"library/пятерка/описания.txt": new TextEncoder().encode("a.png — первая"),
	};
	return {
		list: async (prefix) =>
			Object.entries(objects)
				.filter(([key]) => key.startsWith(prefix))
				.map(([key, bytes]) => ({ key, size: bytes.byteLength })),
		read: async (key) => objects[key] ?? null,
	};
}

/** Ответ подставной модели: один или несколько вызовов инструментов */
export function toolCalls(
	...calls: { id: string; name: string; input: unknown }[]
) {
	return {
		content: calls.map((call) => ({
			type: "tool-call" as const,
			toolCallId: call.id,
			toolName: call.name,
			input: JSON.stringify(call.input),
		})),
		finishReason: { unified: "tool-calls" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

/** Ответ подставной модели: обычный текст */
export function text(value: string) {
	return {
		content: [{ type: "text" as const, text: value }],
		finishReason: { unified: "stop" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function defaultRuntime() {
	return {
		library: new Library(libraryStorage()),
		agentModel: () => new MockLanguageModelV4({ doGenerate: [text("пусто")] }),
		edit: mock<EditFn>(async () => ({
			png: RESULT_PNG,
			size: "1024x1536",
			quality: "medium",
		})),
		storeImage: mock(async (_key: string, _png: Uint8Array) => {}),
		completeGeneration: mock(async (_params: unknown) => true),
		failGeneration: mock(async (_params: unknown) => true),
		recordCodexError: mock(async (_message: string) => {}),
		now: () => 1_700_000_000_000,
	};
}

type DefaultRuntime = ReturnType<typeof defaultRuntime>;

/**
 * Окружение шагов для тестов: всё в памяти, вызовы записываются. Подменённые поля
 * имеют тип подмены, остальные остаются моками (`runtime.edit.mock.calls`).
 */
export function makeRuntime(): DefaultRuntime;
export function makeRuntime<T extends Partial<TurboRuntime>>(
	overrides: T,
): Omit<DefaultRuntime, keyof T> & T;
export function makeRuntime(overrides: Partial<TurboRuntime> = {}): unknown {
	return { ...defaultRuntime(), ...overrides };
}
