import { describe, expect, test } from "bun:test";
import { GENERATION_STALE_MS } from "../generations";
import { IMAGE_MODELS } from "../models";
import { SPACE_RUN_DEADLINE_MS } from "../spaces/constants";
import {
	ULTRA_AGENT_TIMEOUT_MS,
	ULTRA_CLIENT_WAIT_MS,
	ULTRA_DRAW_TIMEOUT_MS,
} from "../ultra/constants";

/** Замер 2026-10-10 на запросе про концерт: агент на уровне max, один прогон */
const MEASURED_MAX_LEVEL_AGENT_MS = 335_000;
/** Очередь, реплей воркфлоу и запись результата: оценка, не замер */
const QUEUE_ALLOWANCE_MS = 60_000;

describe("бюджеты времени «Ультра»", () => {
	test("срок агента с запасом больше замера на максимальном уровне", () => {
		expect(ULTRA_AGENT_TIMEOUT_MS).toBeGreaterThan(
			MEASURED_MAX_LEVEL_AGENT_MS * 1.25,
		);
	});

	test("порядок: худший прогон < ожидание страницы < закрытие зависших", () => {
		// ожидание короче худшего прогона: страница сдастся над живой генерацией;
		// закрытие короче ожидания: живая генерация получит возврат и ошибку, а потом
		// всё равно дорисуется
		const worstCase =
			ULTRA_AGENT_TIMEOUT_MS + ULTRA_DRAW_TIMEOUT_MS + QUEUE_ALLOWANCE_MS;
		expect(ULTRA_CLIENT_WAIT_MS).toBeGreaterThan(worstCase);
		expect(GENERATION_STALE_MS).toBeGreaterThan(ULTRA_CLIENT_WAIT_MS);
	});
});

describe("бюджеты времени Krea 2 и Ideogram 4", () => {
	/** Обогащение промпта идёт до 25 с (`ENHANCE_DEADLINE_MS`) плюс запись: оценка, не замер */
	const ENHANCE_ALLOWANCE_MS = 30_000;

	test("порядок: худший прогон < ожидание страницы < закрытие зависших", () => {
		// попытка, начатая на последней минуте срока, идёт до таймаута опроса Space
		const longestPoll = Math.max(
			...Object.values(IMAGE_MODELS).map((model) => model.pollTimeoutMs),
		);
		const worstCase =
			SPACE_RUN_DEADLINE_MS +
			longestPoll +
			ENHANCE_ALLOWANCE_MS +
			QUEUE_ALLOWANCE_MS;
		expect(ULTRA_CLIENT_WAIT_MS).toBeGreaterThan(worstCase);
		expect(GENERATION_STALE_MS).toBeGreaterThan(ULTRA_CLIENT_WAIT_MS);
	});
});
