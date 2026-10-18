import { describe, expect, mock, test } from "bun:test";
import { runWithRotation } from "../spaces/attempts";
import { SpaceRunError } from "../spaces/run-error";
import type { AttemptOutcome } from "../spaces/types";

const OK: AttemptOutcome = {
	ok: true,
	imageKey: "generations/u1/1.png",
	seed: 7,
	apiKeyId: "k2",
	durationMs: 5,
};
const exhausted = (keyId: string): AttemptOutcome => ({
	ok: false,
	reason: "key_exhausted",
	keyId,
	status: 429,
	message: "quota",
});
const queueTimeout = (keyId: string): AttemptOutcome => ({
	ok: false,
	reason: "queue_timeout",
	keyId,
	message: "queue",
});

/** Часы, которые не уходят вперёд, пока тест сам их не сдвинет */
const frozen = (at = 0) => ({ startedAt: at, now: () => at });

/** Последовательность исходов: каждый вызов берёт следующий */
function sequence(...outcomes: AttemptOutcome[]) {
	let index = 0;
	return mock(async (_exclude: string[]) => outcomes[index++]!);
}

async function failureOf(promise: Promise<unknown>): Promise<SpaceRunError> {
	return promise.then(
		() => {
			throw new Error("ожидался сбой");
		},
		(error) => error as SpaceRunError,
	);
}

describe("runWithRotation", () => {
	test("успех с первой попытки", async () => {
		const attempt = sequence(OK);
		expect(await runWithRotation(attempt, frozen())).toEqual(OK);
		expect(attempt).toHaveBeenCalledTimes(1);
		expect(attempt.mock.calls[0]![0]).toEqual([]);
	});

	test("исчерпанный ключ исключается из следующей попытки", async () => {
		const attempt = sequence(exhausted("k1"), OK);
		await runWithRotation(attempt, frozen());
		expect(attempt.mock.calls[1]![0]).toEqual(["k1"]);
	});

	test("таймаут очереди: тот же ключ годится снова", async () => {
		const attempt = sequence(queueTimeout("k1"), OK);
		await runWithRotation(attempt, frozen());
		expect(attempt.mock.calls[1]![0]).toEqual([]);
	});

	test("нет ключей: сбой all_keys_exhausted без повторов", async () => {
		const attempt = sequence({ ok: false, reason: "no_keys" });
		const error = await failureOf(runWithRotation(attempt, frozen()));
		expect(error).toBeInstanceOf(SpaceRunError);
		expect(error.code).toBe("all_keys_exhausted");
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	test("прочая ошибка: сбой error с ключом HF, без повторов", async () => {
		const attempt = sequence({
			ok: false,
			reason: "error",
			keyId: "k1",
			message: "сломалось",
		});
		const error = await failureOf(runWithRotation(attempt, frozen()));
		expect(error.code).toBe("error");
		expect(error.message).toBe("сломалось");
		expect(error.apiKeyId).toBe("k1");
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	test("пять неудачных попыток подряд: all_keys_exhausted", async () => {
		const attempt = sequence(
			queueTimeout("k1"),
			queueTimeout("k1"),
			queueTimeout("k1"),
			queueTimeout("k1"),
			queueTimeout("k1"),
		);
		const error = await failureOf(runWithRotation(attempt, frozen()));
		expect(error.code).toBe("all_keys_exhausted");
		expect(attempt).toHaveBeenCalledTimes(5);
	});

	test("после срока новые попытки не стартуют", async () => {
		const attempt = sequence(OK);
		const error = await failureOf(
			runWithRotation(attempt, {
				startedAt: 1_000,
				now: () => 1_000 + 600_000,
			}),
		);
		expect(error.code).toBe("all_keys_exhausted");
		expect(attempt).not.toHaveBeenCalled();
	});

	test("срок проверяется перед каждой попыткой", async () => {
		let now = 0;
		const attempt = mock(async (_exclude: string[]) => {
			now += 400_000;
			return queueTimeout("k1");
		});
		const error = await failureOf(
			runWithRotation(attempt, { startedAt: 0, now: () => now }),
		);
		expect(error.code).toBe("all_keys_exhausted");
		// после двух попыток прошло 800 с > 600 с
		expect(attempt).toHaveBeenCalledTimes(2);
	});
});
