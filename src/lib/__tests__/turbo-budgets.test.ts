import { describe, expect, test } from "bun:test";
import { GENERATION_STALE_MS } from "../generations";
import {
	TURBO_AGENT_TIMEOUT_MS,
	TURBO_CLIENT_WAIT_MS,
	TURBO_DRAW_TIMEOUT_MS,
} from "../turbo/constants";

/** Замер 2026-10-10 на запросе про концерт: агент на уровне max, один прогон */
const MEASURED_MAX_LEVEL_AGENT_MS = 335_000;
/** Очередь, реплей воркфлоу и запись результата: оценка, не замер */
const QUEUE_ALLOWANCE_MS = 60_000;

describe("бюджеты времени Турбо", () => {
	test("срок агента с запасом больше замера на максимальном уровне", () => {
		expect(TURBO_AGENT_TIMEOUT_MS).toBeGreaterThan(
			MEASURED_MAX_LEVEL_AGENT_MS * 1.25,
		);
	});

	test("порядок: худший прогон < ожидание страницы < закрытие зависших", () => {
		// ожидание короче худшего прогона: страница сдастся над живой генерацией;
		// закрытие короче ожидания: живая генерация получит возврат и ошибку, а потом
		// всё равно дорисуется
		const worstCase =
			TURBO_AGENT_TIMEOUT_MS + TURBO_DRAW_TIMEOUT_MS + QUEUE_ALLOWANCE_MS;
		expect(TURBO_CLIENT_WAIT_MS).toBeGreaterThan(worstCase);
		expect(GENERATION_STALE_MS).toBeGreaterThan(TURBO_CLIENT_WAIT_MS);
	});
});
