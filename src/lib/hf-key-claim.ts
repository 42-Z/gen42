import { sql } from "./db";
import { GENERATION_STALE_MS } from "./generations";
import { AllKeysExhaustedError, type ApiKeyRow, rankHfKeys } from "./keys";

const STALE_INTERVAL = `${GENERATION_STALE_MS / 1000} seconds`;

/** Строка запуска уже закрыта (ленивое закрытие или другой закрывающий), кредиты возвращены: ключ брать нельзя */
export class GenerationClosedError extends Error {
	constructor(generationId: string) {
		super(`Запуск ${generationId} уже закрыт`);
	}
}

/**
 * Выбирает ключ HF для попытки Space с учётом запусков, которые уже идут, и закрепляет его
 * за строкой запуска (`generations.api_key_id`). Следующие запуски по этой записи видят,
 * сколько работы уже на ключе. Выбор и запись идут в одной транзакции под общим замком:
 * два запуска, стартовавшие одновременно, не берут один и тот же остаток квоты. Строка,
 * зависшая дольше `GENERATION_STALE_MS`, ключ не занимает. Бросает
 * `AllKeysExhaustedError`, если подходящих ключей нет, и `GenerationClosedError`, если
 * запуск уже закрыт: иначе попытка потратила бы прогон ZeroGPU и сохранила картинку
 * после возврата кредитов.
 */
export async function claimHfKey(params: {
	generationId: string;
	excludeIds: string[];
}): Promise<ApiKeyRow> {
	const { generationId, excludeIds } = params;
	return sql.begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(hashtext('hf-key-claim'))`;
		const keys = (await tx`
      SELECT * FROM api_keys
      WHERE provider = 'huggingface' AND is_active = TRUE
    `) as unknown as ApiKeyRow[];
		const busyRows = (await tx`
      SELECT api_key_id, count(*)::int AS busy FROM generations
      WHERE status = 'running' AND api_key_id IS NOT NULL
        AND id <> ${generationId}
        AND created_at > NOW() - ${STALE_INTERVAL}::interval
      GROUP BY api_key_id
    `) as unknown as Array<{ api_key_id: string; busy: number }>;

		const inFlight = new Map(
			busyRows.map((row) => [row.api_key_id, Number(row.busy)]),
		);
		const [key] = rankHfKeys(keys, inFlight, new Set(excludeIds));
		if (!key) {
			throw new AllKeysExhaustedError();
		}
		const claimed = await tx`
      UPDATE generations SET api_key_id = ${key.id}
      WHERE id = ${generationId} AND status = 'running'
      RETURNING id
    `;
		if (claimed.length === 0) {
			throw new GenerationClosedError(generationId);
		}
		return key;
	});
}
