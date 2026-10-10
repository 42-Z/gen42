import { describe, expect, test } from "bun:test";
import { GENERATION_STALE_MS } from "../generations";
import {
	TURBO_AGENT_TIMEOUT_MS,
	TURBO_DRAW_TIMEOUT_MS,
} from "../turbo/constants";

describe("бюджеты времени Турбо", () => {
	test("срок агента 500 с: на max агент идёт ~335 с, на xhigh ~266 с", () => {
		expect(TURBO_AGENT_TIMEOUT_MS).toBe(500_000);
	});

	test("зависшие закрываются позже худшего прогона: агент, рисование и минута на очередь", () => {
		// иначе живая генерация получила бы возврат кредитов и ошибку, а потом дорисовалась
		const worstCase = TURBO_AGENT_TIMEOUT_MS + TURBO_DRAW_TIMEOUT_MS + 60_000;
		expect(GENERATION_STALE_MS).toBeGreaterThan(worstCase);
	});
});
