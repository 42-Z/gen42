import {
	IconBolt,
	IconBrain,
	IconCheck,
	IconChevronLeft,
	IconChevronRight,
	IconCoins,
	IconCopy,
	IconDownload,
	IconHistory,
	IconPhoto,
	IconPhotoOff,
	IconSparkles,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { imageExtension } from "@/lib/image-format";
import {
	type GenerationMode,
	type PublicImageModel,
	parseGenerationMode,
	type SpaceEngine,
	ULTRA_MODEL,
} from "@/lib/models";
import {
	addRun,
	canStart,
	dropRun,
	mergeRuns,
	parseSeriesIds,
	type Run,
	renameRun,
	restoreRuns,
	resultOf,
	type ServerRecord,
	seriesIds,
	settleRun,
} from "@/lib/series";
import { impulse } from "@/lib/sheet/impulses";
import { ULTRA_CLIENT_WAIT_MS } from "@/lib/ultra/constants";
import {
	parseUltraReasoning,
	ULTRA_DEFAULT_REASONING,
	ULTRA_REASONING_LEVELS,
	type UltraReasoning,
} from "@/lib/ultra/reasoning";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./ModelPicker";
import { ResultFrame } from "./sheet/ResultFrame";
import { useFlipList } from "./sheet/use-flip";

interface GenerateProps {
	balance: number | null;
	onBalanceChange: (balance: number) => void;
}

const HISTORY_LIMIT = 8;

type Mode = GenerationMode;
const MODE_STORAGE_KEY = "gen42-mode";

/** Выбранный уровень рассуждения «Ультры»: запоминается между визитами */
const REASONING_STORAGE_KEY = "gen42-reasoning";
const REASONING_LABELS: Record<UltraReasoning, string> = {
	medium: "Среднее",
	high: "Высокое",
	xhigh: "Очень высокое",
	max: "Максимальное",
};

/** Серия запусков: id рамок, по ним после обновления страницы возвращаются готовые и дожидаются идущие */
const SERIES_KEY = "gen42-series";
/** Ключи прежней версии (одна генерация): читаются один раз как затравка и удаляются */
const LEGACY_KEYS = ["gen42-pending", "gen42-result"];
const POLL_INTERVAL_MS = 2500;
/** Дольше воркфлоу (худший прогон ~14 минут) и короче закрытия зависших на сервере: см. `ULTRA_CLIENT_WAIT_MS` */
const POLL_TIMEOUT_MS = ULTRA_CLIENT_WAIT_MS;

/** id запуска придумывает клиент — иначе после обновления его не найти */
function newGenerationId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}
}

function readSeriesIds(): string[] {
	try {
		const ids = parseSeriesIds(localStorage.getItem(SERIES_KEY));
		for (const key of LEGACY_KEYS) {
			const legacy = localStorage.getItem(key);
			if (legacy) ids.push(legacy);
			localStorage.removeItem(key);
		}
		return [...new Set(ids)];
	} catch {
		return [];
	}
}

function writeSeriesIds(ids: string[]) {
	try {
		localStorage.setItem(SERIES_KEY, JSON.stringify(ids));
	} catch {
		/* хранилище недоступно — серия просто не переживёт обновление */
	}
}

function readStoredMode(): Mode {
	try {
		return parseGenerationMode(localStorage.getItem(MODE_STORAGE_KEY));
	} catch {
		return "image";
	}
}

function readStoredReasoning(): UltraReasoning {
	try {
		return (
			parseUltraReasoning(
				localStorage.getItem(REASONING_STORAGE_KEY) ?? undefined,
			) ?? ULTRA_DEFAULT_REASONING
		);
	} catch {
		return ULTRA_DEFAULT_REASONING;
	}
}

export function Generate({ balance, onBalanceChange }: GenerateProps) {
	const [prompt, setPrompt] = useState("");
	// запуски серии, у каждого своя рамка; ref — синхронный взгляд для асинхронных
	// обработчиков (опрос, ответы сервера), состояние — для отрисовки
	const [runs, setRuns] = useState<Run[]>([]);
	const runsRef = useRef<Run[]>([]);
	const [error, setError] = useState("");
	const [copiedRun, setCopiedRun] = useState<string | null>(null);
	const [history, setHistory] = useState<any[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [models, setModels] = useState<PublicImageModel[]>([]);
	const [engine, setEngine] = useState<SpaceEngine>("krea");
	const [mode, setMode] = useState<Mode>(readStoredMode);
	const [reasoning, setReasoning] =
		useState<UltraReasoning>(readStoredReasoning);
	const pollTimer = useRef<number | null>(null);
	const galleryRef = useRef<HTMLDivElement>(null);
	// запуск, чья картинка вошла в «Недавние» последней: из его рамки вылетает миниатюра
	const lastSettled = useRef<string | null>(null);
	useFlipList(galleryRef, history.map((img) => img.id).join(","), () =>
		document.querySelector<HTMLElement>(
			`[data-run="${lastSettled.current}"] [data-slot="result-frame"]`,
		),
	);
	// асинхронные продолжения не должны жить дольше экрана: он снимается при
	// переходе в админку
	const aliveRef = useRef(true);

	function commit(next: Run[]) {
		runsRef.current = next;
		setRuns(next);
		writeSeriesIds(seriesIds(next));
	}

	// Новый интерфейс ищет канонический id `ultra`; `turbo` в каталоге нужен старым вкладкам.
	const ultraModel = models.find((m) => m.id === "ultra");
	const activeMode: Mode = ultraModel ? mode : "image";
	const cost =
		activeMode === "ultra"
			? (ultraModel?.cost ?? ULTRA_MODEL.cost)
			: (models.find((m) => m.id === engine)?.cost ?? 1);
	const outOfCredits = balance !== null && balance < cost;

	function changeMode(next: string) {
		const value: Mode = next === "ultra" ? "ultra" : "image";
		setMode(value);
		try {
			localStorage.setItem(MODE_STORAGE_KEY, value);
		} catch {
			/* режим просто не запомнится */
		}
	}

	function changeReasoning(values: number[]) {
		const next = ULTRA_REASONING_LEVELS[values[0] ?? 0];
		if (!next) return;
		setReasoning(next);
		try {
			localStorage.setItem(REASONING_STORAGE_KEY, next);
		} catch {
			/* уровень просто не запомнится */
		}
	}

	useEffect(() => {
		aliveRef.current = true;
		loadHistory();
		loadModels();
		resumeRuns();
		return () => {
			aliveRef.current = false;
			if (pollTimer.current !== null) {
				clearTimeout(pollTimer.current);
				pollTimer.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!error) return;
		const source = document.getElementById("prompt");
		if (source) impulse({ source, sign: -1, weight: 0.3, mass: "medium" });
	}, [error]);

	async function loadModels() {
		try {
			const res = await fetch("/api/models");
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data) && data.length > 0) setModels(data);
			}
		} catch {
			/* останется модель по умолчанию */
		}
	}

	useEffect(() => {
		if (selected === null) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setSelected(null);
			if (e.key === "ArrowRight")
				setSelected((s) => (s === null ? s : (s + 1) % history.length));
			if (e.key === "ArrowLeft")
				setSelected((s) =>
					s === null ? s : (s - 1 + history.length) % history.length,
				);
		}
		document.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [selected, history.length]);

	async function loadHistory() {
		try {
			const res = await fetch("/api/generations");
			if (res.ok) {
				const data = await res.json();
				setHistory(Array.isArray(data) ? data.slice(0, HISTORY_LIMIT) : []);
			}
		} catch {
			/* лента просто останется пустой */
		}
	}

	async function refreshBalance() {
		try {
			const res = await fetch("/api/me");
			if (res.ok) {
				const me = await res.json();
				if (typeof me.balance === "number") onBalanceChange(me.balance);
			}
		} catch {
			/* баланс обновится при следующей загрузке */
		}
	}

	async function fetchGeneration(id: string): Promise<ServerRecord | null> {
		try {
			const res = await fetch(`/api/generations/${id}`);
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	}

	async function fetchRunning(): Promise<ServerRecord[]> {
		try {
			const res = await fetch("/api/generations/running");
			if (!res.ok) return [];
			const data = await res.json();
			return Array.isArray(data) ? data : [];
		} catch {
			return [];
		}
	}

	/** Итог запуска: картинка в его рамке или ошибка вместо ожидания */
	function settleRecord(id: string, record: ServerRecord) {
		if (record.status === "completed" && record.image_url) {
			lastSettled.current = id;
			commit(settleRun(runsRef.current, id, resultOf(record)));
			refreshBalance();
			loadHistory();
			return;
		}
		commit(dropRun(runsRef.current, id));
		setError(
			record.error || "Не удалось создать изображение, кредиты возвращены",
		);
		refreshBalance();
	}

	/** Один цикл опроса на все идущие запуски; сам себя планирует, пока что-то идёт */
	function schedulePoll() {
		if (pollTimer.current !== null) return;
		if (!runsRef.current.some((run) => run.status === "running")) return;
		pollTimer.current = window.setTimeout(pollRuns, POLL_INTERVAL_MS);
	}

	async function pollRuns() {
		pollTimer.current = null;
		if (!aliveRef.current) return;
		const active = runsRef.current.filter((run) => run.status === "running");
		const records = await Promise.all(
			active.map((run) => fetchGeneration(run.id)),
		);
		if (!aliveRef.current) return;
		active.forEach((run, index) => {
			const record = records[index];
			if (record && record.status !== "running") {
				settleRecord(run.id, record);
				return;
			}
			if (Date.now() < run.deadline) return;
			// сервер молчит дольше обычного — не держим рамку в ожидании
			commit(dropRun(runsRef.current, run.id));
			setError(
				record
					? "Не удалось дождаться результата, обновите страницу"
					: "Не удалось получить результат, обновите страницу",
			);
		});
		schedulePoll();
	}

	/**
	 * Обновление страницы не должно терять процесс: идущие запуски (свои из серии и
	 * из других вкладок) продолжают ждаться, готовые возвращаются картинкой.
	 */
	async function resumeRuns() {
		const ids = readSeriesIds();
		const [running, known] = await Promise.all([
			fetchRunning(),
			Promise.all(ids.map(fetchGeneration)),
		]);
		if (!aliveRef.current) return;
		const found = known.filter(
			(record): record is ServerRecord => record !== null,
		);
		const failed = found.find((record) => record.status === "failed");
		if (failed) {
			setError(
				failed.error || "Не удалось создать изображение, кредиты возвращены",
			);
		}
		const restored = restoreRuns(
			[...running, ...found],
			Date.now(),
			POLL_TIMEOUT_MS,
		);
		// промпт идущей генерации возвращается в поле
		const newest = restored.find((run) => run.status === "running");
		if (newest) setPrompt((current) => current || newest.prompt);
		commit(mergeRuns(runsRef.current, restored));
		schedulePoll();
	}

	async function handleGenerate() {
		if (!prompt.trim() || outOfCredits || !canStart(runsRef.current)) return;

		// id придумывает клиент: так запуск находится после обновления страницы
		const id = newGenerationId();
		setError("");
		commit(
			addRun(runsRef.current, {
				id,
				prompt,
				status: "running",
				resumed: false,
				deadline: Date.now() + POLL_TIMEOUT_MS,
				result: null,
			}),
		);
		schedulePoll();

		try {
			const res = await fetch("/api/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					activeMode === "ultra"
						? { prompt, engine: "ultra", id, reasoning }
						: {
								prompt,
								engine,
								id,
								...(engine === "krea" ? { model: "Turbo", steps: 8 } : {}),
								width: 1024,
								height: 1024,
								guidance: 0.0,
							},
				),
			});

			// ответ платформы может быть не-JSON (обрыв, лимит времени) — тогда пользователю
			// достаётся нейтральный текст, а не сообщение парсера
			const fallback =
				activeMode === "ultra"
					? "Не удалось создать изображение"
					: "Ошибка генерации";
			const data = await res.json().catch(() => null);
			if (!res.ok || !data) {
				throw new Error(data?.error || fallback);
			}

			// сервер принимает запуск в работу и отвечает сразу; если клиентский id был
			// занят, он выдал другой
			if (data.id && data.id !== id) {
				commit(renameRun(runsRef.current, id, data.id));
			}
			refreshBalance();
		} catch (err: any) {
			// обрыв связи или сбой ответа: строка на сервере — источник правды
			const record = await fetchGeneration(id);
			if (record?.status === "running") return;
			if (record) {
				settleRecord(id, record);
				return;
			}
			commit(dropRun(runsRef.current, id));
			setError(err.message);
			refreshBalance();
		}
	}

	async function downloadImage(url: string, seed: any) {
		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const objectUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = objectUrl;
			a.download = `gen42-${seed ?? Date.now()}.${imageExtension(blob.type)}`;
			a.click();
			URL.revokeObjectURL(objectUrl);
		} catch {
			window.open(url, "_blank");
		}
	}

	async function copySeed(run: Run) {
		const seed = run.result?.seed;
		if (seed === null || seed === undefined) return;
		try {
			await navigator.clipboard.writeText(String(seed));
			setCopiedRun(run.id);
			setTimeout(
				() => setCopiedRun((current) => (current === run.id ? null : current)),
				1500,
			);
		} catch {
			/* буфер обмена недоступен */
		}
	}

	function step(dir: 1 | -1) {
		setSelected((s) => {
			if (s === null || history.length === 0) return s;
			return (s + dir + history.length) % history.length;
		});
	}

	const selectedImg = selected !== null ? history[selected] : null;

	return (
		<div className="mx-auto max-w-3xl">
			<div className="animate-pop-in">
				{ultraModel && (
					<Tabs
						value={activeMode}
						onValueChange={changeMode}
						className="mb-8 items-center"
					>
						<TabsList>
							<TabsTrigger value="image">
								<IconPhoto />
								Изображение
							</TabsTrigger>
							<TabsTrigger value="ultra" data-weight="0.6">
								<IconBolt />
								{ultraModel.label}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				)}
				<div className="flex flex-col gap-2">
					<InputGroup>
						<InputGroupTextarea
							id="prompt"
							aria-label="Промпт"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							rows={4}
							maxLength={1000}
							className="min-h-36 text-lg leading-relaxed"
						/>
						<InputGroupAddon align="block-end" className="justify-between">
							{activeMode === "image" ? (
								<ModelPicker
									models={models}
									value={engine}
									onChange={setEngine}
								/>
							) : (
								// ползунок рассуждения занимает место чипа модели: аддон встаёт
								// после ввода в DOM (по документации InputGroup), а клики мимо
								// ручки не фокусируют текст
								<span
									className="flex items-center gap-2"
									onClick={(e) => e.stopPropagation()}
								>
									<IconBrain className="text-primary" aria-hidden="true" />
									<Slider
										min={0}
										max={ULTRA_REASONING_LEVELS.length - 1}
										step={1}
										value={[ULTRA_REASONING_LEVELS.indexOf(reasoning)]}
										onValueChange={changeReasoning}
										aria-label="Уровень рассуждения"
										aria-valuetext={REASONING_LABELS[reasoning]}
										className="w-24 sm:w-28"
									/>
								</span>
							)}
							<span className="relative">
								<Button
									type="button"
									size="icon-lg"
									weight={Math.min(1, cost / 10)}
									onClick={handleGenerate}
									disabled={!prompt.trim() || outOfCredits || !canStart(runs)}
									aria-label={
										outOfCredits
											? "Нет кредитов для генерации"
											: `Сгенерировать за ${cost}`
									}
								>
									<IconSparkles data-icon="inline-start" />
								</Button>
								<span
									aria-hidden="true"
									className="absolute -right-1.5 -top-1.5 flex items-center gap-0.5 rounded-full border border-border bg-background px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground"
								>
									<IconCoins className="size-3" strokeWidth={2.5} />
									{cost}
								</span>
							</span>
						</InputGroupAddon>
					</InputGroup>
				</div>

				{error && (
					<div
						className="mt-5 flex items-start gap-2.5 text-sm text-destructive"
						role="alert"
					>
						<IconPhotoOff className="mt-0.5 h-4 w-4 shrink-0" />
						<span>{error}</span>
					</div>
				)}
			</div>

			{(runs.length > 0 || history.length === 0) && (
				<div className="animate-pop-in mt-10">
					<div
						className={cn(
							"grid grid-cols-1 gap-4",
							runs.length > 1 && "sm:grid-cols-2",
						)}
					>
						{runs.length === 0 ? (
							<ResultFrame loading={false} image={null} />
						) : (
							runs.map((run) => (
								<div key={run.id} data-run={run.id}>
									<ResultFrame
										loading={run.status === "running"}
										resumed={run.resumed}
										image={
											run.result
												? {
														url: run.result.image_url,
														alt: run.prompt || "Сгенерированное изображение",
													}
												: null
										}
									/>
									{run.result && (
										<div className="mt-4 flex items-center justify-end gap-2">
											{run.result.seed !== null && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => copySeed(run)}
													title="Скопировать seed"
													aria-label={`Скопировать seed ${run.result.seed}`}
													className="tabular-nums"
												>
													{copiedRun === run.id ? (
														<IconCheck className="size-3.5 text-primary" />
													) : (
														<IconCopy className="size-3.5" />
													)}
													{run.result.seed}
												</Button>
											)}
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													downloadImage(run.result!.image_url, run.result!.seed)
												}
											>
												<IconDownload className="size-4" />
												Скачать
											</Button>
										</div>
									)}
								</div>
							))
						)}
					</div>
				</div>
			)}

			{history.length > 0 && (
				<section className="mt-12" aria-label="Недавние">
					<div className="flex items-center gap-2 text-muted-foreground">
						<IconHistory className="size-5" />
						<h2 className="sr-only">Недавние</h2>
					</div>
					<div
						ref={galleryRef}
						className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-4"
					>
						{history.map((img, idx) => (
							<button
								key={img.id}
								type="button"
								data-key={img.id}
								data-sheet="ring"
								data-impulse="tap"
								data-weight="0.3"
								onClick={() => setSelected(idx)}
								title={img.prompt}
								aria-label={`Открыть изображение: ${img.prompt}`}
								className="group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left outline-none transition-[scale] duration-300 hover:scale-[1.02]"
							>
								<img
									src={img.thumb_url ?? img.image_url}
									alt=""
									loading="lazy"
									decoding="async"
									className="block h-full w-full rounded-[22px] object-cover"
								/>
							</button>
						))}
					</div>
				</section>
			)}

			{selectedImg && (
				<div
					className="animate-pop-in fixed inset-0 z-[70] flex items-center justify-center bg-background/95 p-4 sm:p-10"
					role="dialog"
					aria-modal="true"
					aria-label={`Просмотр изображения ${selected! + 1} из ${history.length}`}
					onClick={() => setSelected(null)}
				>
					<div
						className="flex max-h-full w-full max-w-4xl flex-col items-center gap-5 overflow-y-auto"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="relative min-h-0 w-fit max-w-full">
							<img
								src={selectedImg.image_url}
								alt={selectedImg.prompt}
								className="max-h-[70dvh] w-auto max-w-full rounded-[22px] border border-border"
							/>
						</div>
						<div className="flex items-center justify-center gap-2">
							<span className="text-xs tabular-nums text-muted-foreground">
								{selected! + 1} / {history.length}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									downloadImage(selectedImg.image_url, selectedImg.seed)
								}
							>
								<IconDownload className="h-4 w-4" />
								Скачать
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setSelected(null)}
							>
								<IconX className="h-4 w-4" />
								Закрыть
							</Button>
						</div>
					</div>

					{history.length > 1 && (
						<>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={(e) => {
									e.stopPropagation();
									step(-1);
								}}
								aria-label="Предыдущее изображение"
								className="absolute left-3 top-1/2 -translate-y-1/2 sm:left-6"
							>
								<IconChevronLeft className="size-5" />
							</Button>
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={(e) => {
									e.stopPropagation();
									step(1);
								}}
								aria-label="Следующее изображение"
								className="absolute right-3 top-1/2 -translate-y-1/2 sm:right-6"
							>
								<IconChevronRight className="size-5" />
							</Button>
						</>
					)}

					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => setSelected(null)}
						aria-label="Закрыть"
						className="absolute right-5 top-5"
					>
						<IconX className="size-5" />
					</Button>
				</div>
			)}
		</div>
	);
}
