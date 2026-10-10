import { deductCredits, refundCredits } from "./credits";
import { type SqlExecutor, sql } from "./db";
import { describeGenerationError } from "./generation-error";

/**
 * Дольше этого срока живой генерации не бывает: воркфлоу Турбо идёт до ~13–14 минут
 * (агент до 500 с, рисование до 270 с, очередь), остальные движки укладываются в
 * maxDuration (300 с). Строка `running` старше срока означает, что процесс умер.
 * Такая строка лениво помечается прерванной, а списанные кредиты возвращаются. Срок
 * больше худшего прогона: иначе живая генерация получила бы возврат кредитов и
 * ошибку, а потом всё равно дорисовалась.
 */
export const GENERATION_STALE_MS = 960_000;
const STALE_INTERVAL = `${GENERATION_STALE_MS / 1000} seconds`;

/** `error_message` для генераций, оборванных вместе с процессом */
export const INTERRUPTED_MESSAGE =
	"interrupted: процесс генерации прерван, кредиты возвращены";

/**
 * text[] с явным OID: без типа postgres.js полагается на карту типов, которую
 * получает при первом подключении, — на «холодном» соединении массив ушёл бы
 * как text и Postgres ответил бы «malformed array literal».
 */
const textArray = (values: string[]) => sql.array(values, 1009);

/** id, который прислал клиент: буквы, цифры, дефис и подчёркивание */
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface GenerationRecord {
	id: string;
	userId: string;
	prompt: string;
	engine: string;
	model: string;
	seed: number | null;
	width: number;
	height: number;
	steps: number;
	cost: number;
	imageKey: string | null;
	status: "running" | "completed" | "failed";
	errorMessage: string | null;
	durationMs: number | null;
	createdAt: string;
}

function toRecord(row: any): GenerationRecord {
	return {
		id: row.id,
		userId: row.user_id,
		prompt: row.prompt,
		engine: row.engine,
		model: row.model,
		seed: row.seed,
		width: row.width,
		height: row.height,
		steps: row.steps,
		cost: row.cost,
		imageKey: row.image_key,
		status: row.status,
		errorMessage: row.error_message,
		durationMs: row.duration_ms,
		createdAt: row.created_at,
	};
}

export interface StartGenerationParams {
	/** Желаемый id (обычно клиентский): если занят, будет сгенерирован новый */
	id?: string;
	userId: string;
	prompt: string;
	negativePrompt?: string | null;
	engine: string;
	model: string;
	width: number;
	height: number;
	steps: number;
}

/**
 * Строка `running` появляется до списания кредитов и основной работы:
 * обновление страницы не должно терять процесс — он находится по этой строке.
 * `cost` строки равен списанным кредитам и остаётся нулём, пока списания нет.
 * Возвращает фактический id записи.
 */
export async function startGeneration(
	params: StartGenerationParams,
): Promise<string> {
	const insert = async (id: string): Promise<string | null> => {
		const rows = await sql`
      INSERT INTO generations
        (id, user_id, prompt, negative_prompt, model, width, height, steps,
         engine, cost, status)
      VALUES
        (${id}, ${params.userId}, ${params.prompt},
         ${params.negativePrompt ?? null}, ${params.model}, ${params.width},
         ${params.height}, ${params.steps}, ${params.engine}, 0, 'running')
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
		return rows.length > 0 ? id : null;
	};

	const preferred =
		params.id && CLIENT_ID_RE.test(params.id) ? await insert(params.id) : null;
	if (preferred) return preferred;
	const fallback = await insert(crypto.randomUUID());
	if (!fallback) {
		throw new Error("Не удалось записать генерацию");
	}
	return fallback;
}

/**
 * Списание за генерацию одной транзакцией с отметкой на строке: `cost > 0` на
 * строке ⇔ кредиты реально списаны — не бывает списания без записи или записи
 * без списания. Бросает `InsufficientCreditsError` при нехватке кредитов.
 */
export async function chargeGeneration(params: {
	id: string;
	userId: string;
	cost: number;
}): Promise<void> {
	await sql.begin(async (tx) => {
		await deductCredits(params.userId, params.cost, tx);
		const marked = await tx`
      UPDATE generations SET cost = ${params.cost}
      WHERE id = ${params.id} AND status = 'running'
      RETURNING id
    `;
		if (marked.length === 0) {
			throw new Error("Генерация уже закрыта");
		}
	});
}

/** Общее для итога и сбоя: что собрал LLM/агент и сроки */
export interface GenerationOutcomeDetails {
	/** Итоговый промпт (для успешной) или что успел собрать LLM/агент (для сбоя) */
	enhancedPrompt?: string | null;
	/** seed результата (успех) или запрошенный seed (сбой) */
	seed?: number | null;
	durationMs: number;
	apiKeyId?: string | null;
	llmKeyId?: string | null;
	llmModel?: string | null;
	llmTokens?: number | null;
	enhanceMs?: number | null;
	styleVersion?: string | null;
	inputImages?: string[] | null;
}

export interface CompleteGenerationParams extends GenerationOutcomeDetails {
	id: string;
	imageKey: string;
	width: number;
	height: number;
}

export interface FailGenerationParams extends GenerationOutcomeDetails {
	id: string;
	error: unknown;
}

/**
 * true — строка переведена из `running`; false — её уже закрыл другой путь
 * (например, ленивое закрытие зависших).
 */
export async function completeGeneration(
	params: CompleteGenerationParams,
): Promise<boolean> {
	const rows = await sql`
      UPDATE generations
      SET status = 'completed', image_key = ${params.imageKey},
          seed = ${params.seed ?? null}, width = ${params.width},
          height = ${params.height},
          enhanced_prompt = ${params.enhancedPrompt ?? null},
          duration_ms = ${params.durationMs}, api_key_id = ${params.apiKeyId ?? null},
          llm_key_id = ${params.llmKeyId ?? null}, llm_model = ${params.llmModel ?? null},
          llm_tokens = ${params.llmTokens ?? null}, enhance_ms = ${params.enhanceMs ?? null},
          style_version = ${params.styleVersion ?? null},
          input_images = ${params.inputImages ? textArray(params.inputImages) : null}
      WHERE id = ${params.id} AND status = 'running'
      RETURNING id
    `;
	return rows.length > 0;
}

interface ClosedRow {
	id: string;
	user_id: string;
	cost: number;
}

/**
 * Возврат списанного по только что закрытым строкам: обнуление `cost` после
 * возврата помечает, что кредиты уже вернулись.
 */
async function refundClosed(tx: SqlExecutor, rows: ClosedRow[]): Promise<void> {
	for (const row of rows) {
		if (row.cost <= 0) continue;
		await refundCredits(row.user_id, row.cost, tx);
		await tx`UPDATE generations SET cost = 0 WHERE id = ${row.id}`;
	}
}

/**
 * Закрывает строку как неуспешную и возвращает списанные кредиты — одной
 * транзакцией. Закрытие происходит ровно один раз (по условию
 * `status = 'running'`), поэтому и возврат тоже: ни двойного возврата, ни
 * потерянного. Если закрыть не удалось, строку закроет ленивое закрытие
 * зависших — с тем же возвратом.
 */
export async function failGeneration(
	params: FailGenerationParams,
): Promise<boolean> {
	const seed = Number.isInteger(params.seed) ? (params.seed as number) : null;
	return sql.begin(async (tx) => {
		const closed = (await tx`
      UPDATE generations
      SET status = 'failed', error_message = ${describeGenerationError(params.error)},
          seed = ${seed}, enhanced_prompt = ${params.enhancedPrompt ?? null},
          duration_ms = ${params.durationMs}, api_key_id = ${params.apiKeyId ?? null},
          llm_key_id = ${params.llmKeyId ?? null}, llm_model = ${params.llmModel ?? null},
          llm_tokens = ${params.llmTokens ?? null}, enhance_ms = ${params.enhanceMs ?? null},
          style_version = ${params.styleVersion ?? null},
          input_images = ${params.inputImages ? textArray(params.inputImages) : null}
      WHERE id = ${params.id} AND status = 'running'
      RETURNING id, user_id, cost
    `) as unknown as ClosedRow[];
		if (closed.length === 0) return false;
		await refundClosed(tx, closed);
		return true;
	});
}

/**
 * Зависшие `running` закрываются лениво — при обращении к генерациям
 * пользователя. Кредиты за них возвращаются той же транзакцией.
 */
async function resolveStaleGenerations(userId: string): Promise<void> {
	try {
		await sql.begin(async (tx) => {
			const closed = (await tx`
        UPDATE generations
        SET status = 'failed', error_message = ${INTERRUPTED_MESSAGE}
        WHERE user_id = ${userId} AND status = 'running'
          AND created_at < NOW() - ${STALE_INTERVAL}::interval
        RETURNING id, user_id, cost
      `) as unknown as ClosedRow[];
			await refundClosed(tx, closed);
		});
	} catch (error) {
		// сбой закрытия не должен ломать чтение генераций
		console.error("Не удалось закрыть зависшие генерации:", error);
	}
}

/** Запись пользователя; чужие и несуществующие — null */
export async function getGeneration(
	userId: string,
	id: string,
): Promise<GenerationRecord | null> {
	await resolveStaleGenerations(userId);
	const rows = await sql`
      SELECT id, user_id, prompt, engine, model, seed, width, height, steps,
             cost, image_key, status, error_message, duration_ms, created_at
      FROM generations
      WHERE id = ${id} AND user_id = ${userId}
    `;
	return rows[0] ? toRecord(rows[0]) : null;
}

/** Самая свежая идущая генерация пользователя или null */
export async function getActiveGeneration(
	userId: string,
): Promise<GenerationRecord | null> {
	await resolveStaleGenerations(userId);
	const rows = await sql`
      SELECT id, user_id, prompt, engine, model, seed, width, height, steps,
             cost, image_key, status, error_message, duration_ms, created_at
      FROM generations
      WHERE user_id = ${userId} AND status = 'running'
      ORDER BY created_at DESC
      LIMIT 1
    `;
	return rows[0] ? toRecord(rows[0]) : null;
}
