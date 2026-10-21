import { MAX_RUNNING_GENERATIONS } from "./generation-limits";
import type { GenerationInfo } from "./generation-view";
import type { UltraPhase } from "./ultra/phase";

/** Сколько рамок серии держит страница; готовые сверх предела остаются только в «Недавних» */
export const MAX_SERIES_RUNS = 8;

export interface RunResult extends GenerationInfo {
	image_url: string;
	seed: number | null;
}

/** Один запуск серии: своя рамка на странице */
export interface Run {
	id: string;
	prompt: string;
	status: "running" | "done";
	/** Возобновлён после обновления страницы: рамка пропускает первую ступень ожидания */
	resumed: boolean;
	/** Когда страница перестаёт ждать (мс, `Date.now()`) */
	deadline: number;
	result: RunResult | null;
	/** Стадия «Ультры» для анимации ожидания; у остальных движков null */
	phase: UltraPhase | null;
	/** Время смены стадии (ISO): по нему видно, не застряла ли она */
	phaseAt: string | null;
}

/** Запись генерации в форме `generationJson` сервера (нужные странице поля) */
export interface ServerRecord extends GenerationInfo {
	id: string;
	status: "running" | "completed" | "failed";
	prompt: string;
	image_url: string | null;
	seed: number | null;
	error: string | null;
	created_at: string;
}

export function runningCount(runs: Run[]): number {
	return runs.filter((run) => run.status === "running").length;
}

/** Новый запуск разрешён, пока идущих меньше потолка сервера */
export function canStart(
	runs: Run[],
	limit: number = MAX_RUNNING_GENERATIONS,
): boolean {
	return runningCount(runs) < limit;
}

/** Готовые сверх предела уходят начиная с самых старых; идущие не вытесняются никогда */
function trimSeries(runs: Run[]): Run[] {
	const result = [...runs];
	while (result.length > MAX_SERIES_RUNS) {
		const oldestDone = result.findLastIndex((run) => run.status === "done");
		if (oldestDone === -1) break;
		result.splice(oldestDone, 1);
	}
	return result;
}

/**
 * Новый запуск встаёт первым. Если идущих нет, это начало новой серии: готовые рамки
 * прежней уходят (они остаются в «Недавних»).
 */
export function addRun(runs: Run[], run: Run): Run[] {
	return trimSeries(runningCount(runs) === 0 ? [run] : [run, ...runs]);
}

export function settleRun(runs: Run[], id: string, result: RunResult): Run[] {
	return runs.map((run) =>
		run.id === id ? { ...run, status: "done", resumed: false, result } : run,
	);
}

/**
 * Стадия идущего запуска из опроса. Возвращает тот же массив, если ничего не
 * изменилось: опрос каждые 2,5 с не должен перерисовывать серию зря.
 */
export function setRunPhase(
	runs: Run[],
	id: string,
	phase: UltraPhase | null,
	phaseAt: string | null,
): Run[] {
	let changed = false;
	const next = runs.map((run) => {
		if (run.id !== id || (run.phase === phase && run.phaseAt === phaseAt)) {
			return run;
		}
		changed = true;
		return { ...run, phase, phaseAt };
	});
	return changed ? next : runs;
}

export function dropRun(runs: Run[], id: string): Run[] {
	return runs.filter((run) => run.id !== id);
}

/** Сервер выдал другой id (клиентский был занят) */
export function renameRun(runs: Run[], from: string, to: string): Run[] {
	return runs.map((run) => (run.id === from ? { ...run, id: to } : run));
}

export function resultOf(
	record: Pick<ServerRecord, "image_url" | "seed"> & GenerationInfo,
): RunResult {
	return {
		...record,
		image_url: record.image_url ?? "",
		seed: record.seed ?? null,
	};
}

/**
 * Запуски из записей сервера: идущие продолжают ожидание, готовые возвращаются
 * картинкой, неуспешные выпадают. Записи без повторов, свежие первыми.
 */
export function restoreRuns(
	records: ServerRecord[],
	now: number,
	waitMs: number,
): Run[] {
	const unique = new Map<string, ServerRecord>();
	for (const record of records) {
		if (!unique.has(record.id)) unique.set(record.id, record);
	}
	return [...unique.values()]
		.sort(
			(a, b) =>
				(Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0),
		)
		.slice(0, MAX_SERIES_RUNS)
		.flatMap((record): Run[] => {
			if (record.status === "running") {
				return [
					{
						id: record.id,
						prompt: record.prompt,
						status: "running",
						resumed: true,
						deadline: now + waitMs,
						result: null,
						phase: record.phase ?? null,
						phaseAt: record.phase_at ?? null,
					},
				];
			}
			if (record.status === "completed" && record.image_url) {
				return [
					{
						id: record.id,
						prompt: record.prompt,
						status: "done",
						resumed: false,
						deadline: now,
						result: resultOf(record),
						phase: null,
						phaseAt: null,
					},
				];
			}
			return [];
		});
}

/** Восстановленное добавляется к тому, что уже есть на странице; текущие запуски впереди */
export function mergeRuns(current: Run[], restored: Run[]): Run[] {
	const known = new Set(current.map((run) => run.id));
	return trimSeries([
		...current,
		...restored.filter((run) => !known.has(run.id)),
	]);
}

export function seriesIds(runs: Run[]): string[] {
	return runs.map((run) => run.id);
}

/** id серии из `localStorage`: устойчив к мусору */
export function parseSeriesIds(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const data: unknown = JSON.parse(raw);
		if (!Array.isArray(data)) return [];
		return data
			.filter(
				(id): id is string =>
					typeof id === "string" && id.length > 0 && id.length <= 64,
			)
			.slice(0, MAX_SERIES_RUNS);
	} catch {
		return [];
	}
}
