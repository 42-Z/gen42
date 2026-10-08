import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";
import { TurboError } from "../turbo/errors";
import {
	isAuthFailure,
	prefixedMessage,
	rethrowModelError,
	toFailure,
} from "../turbo/failure";

function apiError(statusCode: number) {
	return new APICallError({
		message: "boom",
		url: "https://chatgpt.com/backend-api/codex/responses",
		requestBodyValues: {},
		statusCode,
		isRetryable: false,
	});
}

describe("toFailure", () => {
	test("TurboError сохраняет код и подробности", () => {
		const failure = toFailure(
			new TurboError("generation_rejected", "отказ", {
				details: { prompt: "p", inputImages: ["a/b.png"] },
			}),
		);
		expect(failure).toEqual({
			code: "generation_rejected",
			message: "отказ",
			prompt: "p",
			inputImages: ["a/b.png"],
		});
	});

	test("код в начале сообщения переживает границу шага", () => {
		const failure = toFailure(
			new Error(prefixedMessage("codex_auth_required", "токен умер")),
			{ prompt: "p" },
		);
		expect(failure).toEqual({
			code: "codex_auth_required",
			message: "токен умер",
			prompt: "p",
			inputImages: [],
		});
	});

	test("срок вышел: по имени ошибки и по тексту SDK", () => {
		const byName = Object.assign(new Error("x"), { name: "TimeoutError" });
		expect(toFailure(byName).code).toBe("agent_timeout");
		const byText = new Error("The generation deadline expired.");
		expect(toFailure(byText).code).toBe("agent_timeout");
	});

	test("нарушение toolChoice — agent_no_generation", () => {
		const error = Object.assign(
			new Error(
				"Model response did not contain a tool call even though tool choice was required.",
			),
			{ name: "AI_ToolChoiceViolationError" },
		);
		const failure = toFailure(error);
		expect(failure.code).toBe("agent_no_generation");
		expect(failure.message).toBe(
			"Агент завершил работу, не вызвав generateImage",
		);
	});

	test("401 провайдера — codex_auth_required, 500 — agent_failed", () => {
		expect(toFailure(apiError(401)).code).toBe("codex_auth_required");
		expect(toFailure(apiError(500)).code).toBe("agent_failed");
	});

	test("не ошибка вместо ошибки — agent_failed", () => {
		expect(toFailure("странно")).toMatchObject({
			code: "agent_failed",
			message: "странно",
		});
	});
});

describe("isAuthFailure", () => {
	test("распознаёт 401/403 и коды обновления токена, в том числе в cause", () => {
		expect(isAuthFailure(apiError(403))).toBe(true);
		expect(isAuthFailure({ code: "refresh_failed" })).toBe(true);
		expect(isAuthFailure(new Error("x", { cause: apiError(401) }))).toBe(true);
		expect(isAuthFailure(apiError(429))).toBe(false);
	});
});

describe("rethrowModelError", () => {
	test("вход Codex умер: код едет в тексте ошибки", () => {
		const error = apiError(401);
		expect(() => rethrowModelError(error)).toThrow(
			/^codex_auth_required: boom/,
		);
	});

	test("прочие ошибки пробрасываются как есть", () => {
		const error = apiError(500);
		let thrown: unknown;
		try {
			rethrowModelError(error);
		} catch (caught) {
			thrown = caught;
		}
		expect(thrown).toBe(error);
	});
});
