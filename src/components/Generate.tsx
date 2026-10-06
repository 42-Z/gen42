import {
	IconBolt,
	IconCheck,
	IconChevronLeft,
	IconChevronRight,
	IconCoins,
	IconCopy,
	IconDownload,
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { imageExtension } from "@/lib/image-format";
import {
	type PublicImageModel,
	type SpaceEngine,
	TURBO_MODEL,
} from "@/lib/models";
import { cn } from "@/lib/utils";
import {
	EmptyCanvasArt,
	PopSpinner,
	SparkStar,
	StickerBurst,
} from "./graphics";
import { ModelPicker } from "./ModelPicker";
import { PopWait } from "./PopWait";

interface GenerateProps {
	balance: number | null;
	onBalanceChange: (balance: number) => void;
}

const HISTORY_LIMIT = 8;

type Mode = "image" | "turbo";
const MODE_STORAGE_KEY = "gen42-mode";

/** Идущая генерация: по этому ключу она возобновляется после обновления страницы */
const PENDING_KEY = "gen42-pending";
/** Последняя показанная картинка: она не должна пропадать при обновлении */
const RESULT_KEY = "gen42-result";
const POLL_INTERVAL_MS = 2500;
/** Серверная генерация живёт не дольше 5 минут; дольше не ждём */
const POLL_TIMEOUT_MS = 8 * 60_000;

/** id генерации придумывает клиент — иначе после обновления её не найти */
function newGenerationId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}
}

function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function rememberPending(id: string) {
	try {
		localStorage.setItem(PENDING_KEY, id);
	} catch {
		/* хранилище недоступно — генерация просто не переживёт обновление */
	}
}

function forgetPending() {
	try {
		localStorage.removeItem(PENDING_KEY);
	} catch {
		/* нечего забывать */
	}
}

function rememberResult(id: string) {
	try {
		localStorage.removeItem(PENDING_KEY);
		localStorage.setItem(RESULT_KEY, id);
	} catch {
		/* хранилище недоступно — просто не запомнится */
	}
}

function readStoredMode(): Mode {
	try {
		return localStorage.getItem(MODE_STORAGE_KEY) === "turbo"
			? "turbo"
			: "image";
	} catch {
		return "image";
	}
}

export function Generate({ balance, onBalanceChange }: GenerateProps) {
	const [prompt, setPrompt] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [resultPrompt, setResultPrompt] = useState("");
	const [error, setError] = useState("");
	const [seedCopied, setSeedCopied] = useState(false);
	const [history, setHistory] = useState<any[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [models, setModels] = useState<PublicImageModel[]>([]);
	const [engine, setEngine] = useState<SpaceEngine>("krea");
	const [mode, setMode] = useState<Mode>(readStoredMode);
	const pollTimer = useRef<number | null>(null);
	// асинхронные продолжения не должны жить дольше экрана: он снимается при
	// переходе в админку
	const aliveRef = useRef(true);

	// Турбо виден, только пока сервер отдаёт его в списке: иначе экран один, обычный
	const turboModel = models.find((m) => m.id === "turbo");
	const activeMode: Mode = turboModel ? mode : "image";
	const cost =
		activeMode === "turbo"
			? (turboModel?.cost ?? TURBO_MODEL.cost)
			: (models.find((m) => m.id === engine)?.cost ?? 1);
	const outOfCredits = balance !== null && balance < cost;

	function changeMode(next: string) {
		const value: Mode = next === "turbo" ? "turbo" : "image";
		setMode(value);
		try {
			localStorage.setItem(MODE_STORAGE_KEY, value);
		} catch {
			/* режим просто не запомнится */
		}
	}

	useEffect(() => {
		aliveRef.current = true;
		loadHistory();
		loadModels();
		resumeGeneration();
		return () => {
			aliveRef.current = false;
			if (pollTimer.current !== null) clearTimeout(pollTimer.current);
		};
	}, []);

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

	async function fetchGeneration(id: string): Promise<any | null> {
		try {
			const res = await fetch(`/api/generations/${id}`);
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	}

	async function fetchActiveGeneration(): Promise<any | null> {
		try {
			const res = await fetch("/api/generations/active");
			if (!res.ok) return null;
			return await res.json();
		} catch {
			return null;
		}
	}

	function showResult(rec: any) {
		setResult({
			id: rec.id,
			image_url: rec.image_url,
			seed: rec.seed,
			engine: rec.engine,
			cost: rec.cost,
			duration: rec.duration,
		});
		setResultPrompt(rec.prompt ?? "");
	}

	/** Итог генерации: картинка или ошибка вместо ожидания */
	function settleGeneration(rec: any) {
		setLoading(false);
		if (rec.status === "completed") {
			rememberResult(rec.id);
			showResult(rec);
			refreshBalance();
			loadHistory();
			return;
		}
		forgetPending();
		setError(rec.error || "Не удалось создать изображение, кредиты возвращены");
		refreshBalance();
	}

	function pollGeneration(id: string, deadline: number) {
		if (pollTimer.current !== null) clearTimeout(pollTimer.current);
		pollTimer.current = window.setTimeout(async () => {
			if (!aliveRef.current) return;
			const rec = await fetchGeneration(id);
			if (!aliveRef.current) return;
			if (rec) {
				if (rec.status === "running") {
					if (Date.now() < deadline) {
						pollGeneration(id, deadline);
						return;
					}
					// сервер молчит дольше обычного — не держим экран в ожидании
					forgetPending();
					setLoading(false);
					setError("Не удалось дождаться результата, обновите страницу");
					return;
				}
				settleGeneration(rec);
				return;
			}
			// запрос не прошёл — пробуем ещё, вдруг это сбой сети
			if (Date.now() < deadline) {
				pollGeneration(id, deadline);
				return;
			}
			forgetPending();
			setLoading(false);
			setError("Не удалось получить результат, обновите страницу");
		}, POLL_INTERVAL_MS);
	}

	function waitForGeneration(rec: any) {
		if (!aliveRef.current) return;
		setPrompt(rec.prompt ?? "");
		setResult(null);
		setResultPrompt("");
		setError("");
		setSeedCopied(false);
		setLoading(true);
		pollGeneration(rec.id, Date.now() + POLL_TIMEOUT_MS);
	}

	/**
	 * Обновление страницы не должно терять процесс: идущая генерация
	 * (запомненная или из другой вкладки) продолжает ждаться здесь, а последняя
	 * картинка возвращается на экран.
	 */
	async function resumeGeneration() {
		const pendingId = readStored(PENDING_KEY);
		if (pendingId) {
			const rec = await fetchGeneration(pendingId);
			if (rec?.status === "running") {
				waitForGeneration(rec);
				return;
			}
			forgetPending();
			if (rec) {
				settleGeneration(rec);
				return;
			}
		}

		const active = await fetchActiveGeneration();
		if (active) {
			waitForGeneration(active);
			return;
		}

		const lastId = readStored(RESULT_KEY);
		if (lastId) {
			const rec = await fetchGeneration(lastId);
			if (rec?.status === "completed") showResult(rec);
		}
	}

	async function handleGenerate() {
		if (!prompt.trim() || outOfCredits || loading) return;

		// id придумывает клиент: так генерация находится после обновления страницы
		const id = newGenerationId();
		rememberPending(id);

		setLoading(true);
		setError("");
		setResult(null);
		setResultPrompt("");
		setSeedCopied(false);

		try {
			const res = await fetch("/api/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					activeMode === "turbo"
						? { prompt, engine: "turbo", id }
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
				activeMode === "turbo"
					? "Не удалось создать изображение"
					: "Ошибка генерации";
			const data = await res.json().catch(() => null);
			if (!res.ok || !data) {
				// сервер ответил — генерация завершена, возобновлять нечего
				forgetPending();
				throw new Error(data?.error || fallback);
			}

			rememberResult(data.id ?? id);
			setLoading(false);
			setResult(data);
			setResultPrompt(prompt);
			refreshBalance();
			loadHistory();
		} catch (err: any) {
			// обрыв связи или сбой ответа: строка на сервере — источник правды
			const rec = await fetchGeneration(id);
			if (rec?.status === "running") {
				waitForGeneration(rec);
				return;
			}
			if (rec) {
				settleGeneration(rec);
				return;
			}
			forgetPending();
			setLoading(false);
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

	async function copySeed() {
		if (result?.seed === null || result?.seed === undefined) return;
		try {
			await navigator.clipboard.writeText(String(result.seed));
			setSeedCopied(true);
			setTimeout(() => setSeedCopied(false), 1500);
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
				{turboModel && (
					<Tabs
						value={activeMode}
						onValueChange={changeMode}
						className="mb-8 items-center"
					>
						<TabsList>
							<TabsTrigger value="image" disabled={loading}>
								<IconPhoto />
								Изображение
							</TabsTrigger>
							<TabsTrigger value="turbo" disabled={loading}>
								<IconBolt />
								{turboModel.label}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				)}
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<SparkStar className="h-4 w-4" />
						<Label
							htmlFor="prompt"
							className="font-display text-lg font-bold text-foreground"
						>
							Промпт
						</Label>
					</div>
					<InputGroup>
						<InputGroupTextarea
							id="prompt"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							rows={4}
							maxLength={1000}
							className="min-h-36 text-lg leading-relaxed"
						/>
						<InputGroupAddon
							align="block-end"
							className={cn(
								activeMode === "image" ? "justify-between" : "justify-end",
							)}
						>
							{activeMode === "image" && (
								<ModelPicker
									models={models}
									value={engine}
									onChange={setEngine}
									disabled={loading}
								/>
							)}
							<span className="relative">
								<Button
									type="button"
									size="icon-lg"
									onClick={handleGenerate}
									disabled={loading || !prompt.trim() || outOfCredits}
									aria-label={
										outOfCredits
											? "Нет кредитов для генерации"
											: `Сгенерировать за ${cost}`
									}
								>
									{loading ? (
										<PopSpinner className="size-5" />
									) : (
										<IconSparkles data-icon="inline-start" />
									)}
								</Button>
								<span
									aria-hidden="true"
									className="absolute -right-1.5 -top-1.5 flex items-center gap-0.5 rounded-full bg-[#ffd54a] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#0d0b1e]"
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

			{loading && (
				<div className="animate-pop-in mt-10">
					<PopWait className="aspect-square w-full" />
				</div>
			)}

			{!loading && !result && history.length === 0 && (
				<div className="animate-pop-in mt-10 flex flex-col items-center py-10 [animation-delay:140ms]">
					<span role="img" aria-label="Пустой холст">
						<EmptyCanvasArt className="h-44 w-auto" />
					</span>
				</div>
			)}

			{result && (
				<div className="animate-pop-in relative mt-10">
					<StickerBurst className="animate-float-slow absolute -right-4 -top-8 h-16 w-16 sm:-right-8" />
					<div className="group relative overflow-hidden rounded-[22px]">
						<img
							src={result.image_url}
							alt={resultPrompt || prompt || "Сгенерированное изображение"}
							className="block w-full transition-transform duration-500 group-hover:scale-[1.015]"
						/>
					</div>
					<div className="mt-4 flex items-center justify-end gap-2">
						{result.seed !== null && result.seed !== undefined && (
							<button
								type="button"
								onClick={copySeed}
								title="Скопировать seed"
								aria-label={`Скопировать seed ${result.seed}`}
								className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm tabular-nums text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
							>
								{seedCopied ? (
									<IconCheck className="h-3.5 w-3.5 text-primary" />
								) : (
									<IconCopy className="h-3.5 w-3.5" />
								)}
								{result.seed}
							</button>
						)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => downloadImage(result.image_url, result.seed)}
						>
							<IconDownload className="h-4 w-4" />
							Скачать
						</Button>
					</div>
				</div>
			)}

			{history.length > 0 && (
				<section className="mt-12" aria-label="Недавние">
					<div className="flex items-center gap-2">
						<SparkStar className="h-4 w-4" />
						<h2 className="font-display text-lg font-bold text-foreground">
							Недавние
						</h2>
					</div>
					<div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
						{history.map((img, idx) => (
							<button
								key={img.id}
								type="button"
								onClick={() => setSelected(idx)}
								title={img.prompt}
								aria-label={`Открыть изображение: ${img.prompt}`}
								className="group relative block aspect-square overflow-hidden rounded-[22px] border border-border/60 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<img
									src={img.image_url}
									alt=""
									loading="lazy"
									className="block h-full w-full rounded-[22px] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
								/>
							</button>
						))}
					</div>
				</section>
			)}

			{selectedImg && (
				<div
					className="animate-pop-in fixed inset-0 z-[70] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md sm:p-10"
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
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									step(-1);
								}}
								aria-label="Предыдущее изображение"
								className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 p-3 text-foreground transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 sm:left-6"
							>
								<IconChevronLeft className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									step(1);
								}}
								aria-label="Следующее изображение"
								className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/90 p-3 text-foreground transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 sm:right-6"
							>
								<IconChevronRight className="h-5 w-5" />
							</button>
						</>
					)}

					<button
						type="button"
						onClick={() => setSelected(null)}
						className="absolute right-5 top-5 rounded-full border border-border bg-card/80 p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95]"
						aria-label="Закрыть"
					>
						<IconX className="h-5 w-5" />
					</button>
				</div>
			)}
		</div>
	);
}
