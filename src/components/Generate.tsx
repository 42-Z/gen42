import {
	IconBolt,
	IconBrain,
	IconCheck,
	IconCoins,
	IconCopy,
	IconDownload,
	IconFileText,
	IconHistory,
	IconPaperclip,
	IconPhoto,
	IconPhotoOff,
	IconSparkles,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { SheetLayer } from "@/components/sheet/SheetLayer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadAttachment } from "@/lib/attachment-client";
import {
	type GenerationView,
	ULTRA_REASONING_LABELS,
} from "@/lib/generation-view";
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
	setRunPhase,
	settleRun,
} from "@/lib/series";
import { impulse } from "@/lib/sheet/impulses";
import {
	ATTACHMENT_BAD_TYPE_ERROR,
	ATTACHMENT_EMPTY_ERROR,
	ATTACHMENT_TOO_BIG_ERROR,
	ATTACHMENT_TOO_MANY_ERROR,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENT_TEXT_BYTES,
	MAX_ATTACHMENTS,
} from "@/lib/ultra/attachments";
import { ULTRA_CLIENT_WAIT_MS } from "@/lib/ultra/constants";
import {
	parseUltraReasoning,
	ULTRA_DEFAULT_REASONING,
	ULTRA_REASONING_LEVELS,
	type UltraReasoning,
} from "@/lib/ultra/reasoning";
import { cn } from "@/lib/utils";
import { GenerationViewer } from "./GenerationViewer";
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

interface LocalAttachment {
	id: string;
	file: File;
	previewUrl: string | null;
}

const ATTACHMENT_NAME_RE = /\.(png|jpe?g|webp|txt|md)$/i;

function attachmentProblem(attachments: LocalAttachment[]): string | null {
	if (attachments.length > MAX_ATTACHMENTS) return ATTACHMENT_TOO_MANY_ERROR;
	for (const { file } of attachments) {
		if (!ATTACHMENT_NAME_RE.test(file.name)) return ATTACHMENT_BAD_TYPE_ERROR;
		if (file.size <= 0) return ATTACHMENT_EMPTY_ERROR;
		const text = /\.(txt|md)$/i.test(file.name);
		if (text && file.size > MAX_ATTACHMENT_TEXT_BYTES) {
			return ATTACHMENT_TOO_BIG_ERROR;
		}
		if (!text && file.size > MAX_ATTACHMENT_BYTES) {
			return ATTACHMENT_TOO_BIG_ERROR;
		}
	}
	return null;
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
	const [history, setHistory] = useState<GenerationView[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [models, setModels] = useState<PublicImageModel[]>([]);
	const [engine, setEngine] = useState<SpaceEngine>("krea");
	const [mode, setMode] = useState<Mode>(readStoredMode);
	const [reasoning, setReasoning] =
		useState<UltraReasoning>(readStoredReasoning);
	// вложения живут до запуска: в хранилище они уходят отдельными запросами
	const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
	const [uploading, setUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const attachmentsRef = useRef<LocalAttachment[]>([]);
	attachmentsRef.current = attachments;
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

	// адреса миниатюр живут, пока экран не уйдёт вместе с вложениями
	useEffect(
		() => () => {
			for (const attachment of attachmentsRef.current) {
				if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
			}
		},
		[],
	);

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

	async function loadHistory() {
		try {
			const res = await fetch("/api/generations");
			if (res.ok) {
				const data = await res.json();
				setHistory(
					Array.isArray(data)
						? (data.slice(0, HISTORY_LIMIT) as GenerationView[])
						: [],
				);
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

	function addAttachments(files: FileList | null) {
		if (!files || files.length === 0) return;
		const next = Array.from(files).map((file) => {
			const image =
				file.type.startsWith("image/") ||
				/\.(png|jpe?g|webp)$/i.test(file.name);
			return {
				id: newGenerationId(),
				file,
				previewUrl: image ? URL.createObjectURL(file) : null,
			};
		});
		setAttachments((current) => [...current, ...next]);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function removeAttachment(id: string) {
		setAttachments((current) => {
			const target = current.find((attachment) => attachment.id === id);
			if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
			return current.filter((attachment) => attachment.id !== id);
		});
	}

	function clearAttachments() {
		setAttachments((current) => {
			for (const attachment of current) {
				if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
			}
			return [];
		});
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
		// сначала стадии всех идущих одним обновлением, потом итоги: settleRecord
		// читает runsRef и должен видеть уже обновлённую серию
		let withPhases = runsRef.current;
		active.forEach((run, index) => {
			const record = records[index];
			if (record?.status !== "running") return;
			withPhases = setRunPhase(
				withPhases,
				run.id,
				record.phase ?? null,
				record.phase_at ?? null,
			);
		});
		if (withPhases !== runsRef.current) commit(withPhases);
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
		if (
			!prompt.trim() ||
			outOfCredits ||
			!canStart(runsRef.current) ||
			uploading
		)
			return;

		const useAttachments = activeMode === "ultra" && attachments.length > 0;
		if (useAttachments) {
			const problem = attachmentProblem(attachments);
			if (problem) {
				setError(problem);
				return;
			}
		}

		// id придумывает клиент: так запуск находится после обновления страницы
		const id = newGenerationId();
		setError("");

		// файлы уходят до запуска: если вложение не принято, кредиты не тратятся
		if (useAttachments) {
			setUploading(true);
			try {
				for (const attachment of attachmentsRef.current) {
					await uploadAttachment(attachment.file, id);
				}
			} catch (err: any) {
				setUploading(false);
				setError(err.message);
				return;
			}
			setUploading(false);
		}

		commit(
			addRun(runsRef.current, {
				id,
				prompt,
				status: "running",
				resumed: false,
				deadline: Date.now() + POLL_TIMEOUT_MS,
				result: null,
				phase: null,
				phaseAt: null,
			}),
		);
		schedulePoll();

		try {
			const res = await fetch("/api/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					activeMode === "ultra"
						? {
								prompt,
								engine: "ultra",
								id,
								reasoning,
								...(useAttachments ? { attachmentScope: id } : {}),
							}
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
			if (useAttachments) clearAttachments();
			refreshBalance();
		} catch (err: any) {
			// обрыв связи или сбой ответа: строка на сервере — источник правды
			const record = await fetchGeneration(id);
			if (record?.status === "running") {
				if (useAttachments) clearAttachments();
				return;
			}
			if (record) {
				settleRecord(id, record);
				return;
			}
			commit(dropRun(runsRef.current, id));
			setError(err.message);
			refreshBalance();
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
					{activeMode === "ultra" && attachments.length > 0 && (
						<div
							role="group"
							className="flex flex-wrap gap-2"
							aria-label="Вложения"
						>
							{attachments.map((attachment) => (
								<div
									key={attachment.id}
									data-sheet="ring"
									className="relative size-14 overflow-hidden rounded-[14px] border border-border/60 bg-secondary/60"
								>
									<SheetLayer />
									{attachment.previewUrl ? (
										<img
											src={attachment.previewUrl}
											alt=""
											className="size-full object-cover"
										/>
									) : (
										<span className="flex size-full items-center justify-center text-muted-foreground">
											<IconFileText aria-hidden="true" className="size-5" />
										</span>
									)}
									{uploading && (
										<span
											aria-hidden="true"
											className="absolute inset-0 bg-background/50"
										/>
									)}
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										onClick={() => removeAttachment(attachment.id)}
										disabled={uploading}
										aria-label={`Убрать вложение ${attachment.file.name}`}
										className="absolute right-0.5 top-0.5 rounded-full bg-background/80"
									>
										<IconX />
									</Button>
								</div>
							))}
						</div>
					)}
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
										aria-valuetext={ULTRA_REASONING_LABELS[reasoning]}
										className="w-24 sm:w-28"
									/>
									<InputGroupButton
										type="button"
										variant="outline"
										size="icon-sm"
										weight={0.3}
										onClick={() => fileInputRef.current?.click()}
										disabled={uploading}
										aria-label="Приложить файлы"
										className="size-9 rounded-full border-primary/40 bg-primary/10 text-primary hover:border-primary/70 hover:bg-primary/15"
									>
										<IconPaperclip />
									</InputGroupButton>
									<input
										ref={fileInputRef}
										type="file"
										multiple
										accept=".png,.jpg,.jpeg,.webp,.txt,.md,image/png,image/jpeg,image/webp,text/plain,text/markdown"
										className="hidden"
										onChange={(event) => addAttachments(event.target.files)}
									/>
								</span>
							)}
							<span className="relative">
								<Button
									type="button"
									size="icon-lg"
									weight={Math.min(1, cost / 10)}
									data-loading={uploading ? "true" : undefined}
									onClick={handleGenerate}
									disabled={
										!prompt.trim() ||
										outOfCredits ||
										!canStart(runs) ||
										uploading
									}
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
										phase={run.phase}
										phaseAt={run.phaseAt}
										image={
											run.result
												? {
														url: run.result.preview_url ?? run.result.image_url,
														originalUrl: run.result.image_url,
														alt: run.prompt || "Сгенерированное изображение",
														width: run.result.width,
														height: run.result.height,
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
											<Button variant="outline" size="sm" asChild>
												<a
													href={`/api/generations/${encodeURIComponent(run.id)}/download`}
													download
													data-impulse="tap"
													data-weight="0.25"
												>
													<IconDownload className="size-4" />
													Скачать
												</a>
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
						{history.map((img) => (
							<Dialog
								key={img.id}
								open={selectedId === img.id}
								onOpenChange={(open) => setSelectedId(open ? img.id : null)}
							>
								<DialogTrigger asChild>
									<button
										type="button"
										data-key={img.id}
										data-sheet="ring"
										data-impulse="tap"
										data-weight="0.3"
										title={img.prompt}
										aria-label={`Открыть изображение: ${img.prompt}`}
										className="group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left outline-none transition-[scale] duration-300 hover:scale-[1.02]"
									>
										<img
											src={img.thumb_url ?? img.image_url}
											alt=""
											width={img.width ?? 640}
											height={img.height ?? 640}
											loading="lazy"
											decoding="async"
											className="block h-full w-full rounded-[22px] object-cover"
										/>
									</button>
								</DialogTrigger>
								{selectedId === img.id && (
									<GenerationViewer key={img.id} generation={img} />
								)}
							</Dialog>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
