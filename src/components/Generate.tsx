import {
	IconCheck,
	IconChevronLeft,
	IconChevronRight,
	IconCoins,
	IconCopy,
	IconDownload,
	IconPhotoOff,
	IconSparkles,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	EmptyCanvasArt,
	PopSkeleton,
	PopSpinner,
	SparkStar,
	StickerBurst,
} from "./graphics";

interface GenerateProps {
	balance: number | null;
	onBalanceChange: (balance: number) => void;
}

const HISTORY_LIMIT = 8;

export function Generate({ balance, onBalanceChange }: GenerateProps) {
	const [prompt, setPrompt] = useState("");
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState("");
	const [seedCopied, setSeedCopied] = useState(false);
	const [history, setHistory] = useState<any[]>([]);
	const [selected, setSelected] = useState<number | null>(null);

	const outOfCredits = balance === 0;

	useEffect(() => {
		loadHistory();
	}, []);

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

	async function handleGenerate() {
		if (!prompt.trim() || outOfCredits) return;

		setLoading(true);
		setError("");
		setResult(null);
		setSeedCopied(false);

		try {
			const res = await fetch("/api/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt,
					model: "Turbo",
					width: 1024,
					height: 1024,
					steps: 8,
					guidance: 0.0,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Ошибка генерации");
			}

			const data = await res.json();
			setResult(data);
			refreshBalance();
			loadHistory();
		} catch (err: any) {
			setError(err.message);
			refreshBalance();
		} finally {
			setLoading(false);
		}
	}

	async function downloadImage(url: string, seed: any) {
		try {
			const res = await fetch(url);
			const blob = await res.blob();
			const objectUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = objectUrl;
			a.download = `gen42-${seed ?? Date.now()}.png`;
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
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<SparkStar className="h-4 w-4" />
						<Label
							htmlFor="prompt"
							className="font-display text-lg font-bold text-foreground"
						>
							Промпт
						</Label>
					</div>
					<Textarea
						id="prompt"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						rows={4}
						maxLength={1000}
						className="min-h-36 resize-none text-lg leading-relaxed"
					/>
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

				<div className="mt-6 flex items-center justify-end gap-4">
					<span className="relative">
						<button
							type="button"
							onClick={handleGenerate}
							disabled={loading || !prompt.trim() || outOfCredits}
							aria-label={
								outOfCredits
									? "Нет кредитов для генерации"
									: "Сгенерировать за 1 кредит"
							}
							className="pop-gradient-bg rounded-full p-4 text-white shadow-[0_12px_36px_-12px_rgb(255_92_168/0.65)] transition-all outline-none hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40"
						>
							{loading ? (
								<PopSpinner className="h-6 w-6" />
							) : (
								<IconSparkles className="h-6 w-6" />
							)}
						</button>
						<span
							aria-hidden="true"
							className="absolute -right-1.5 -top-1.5 flex items-center gap-0.5 rounded-full bg-[#ffd54a] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#0d0b1e]"
						>
							<IconCoins className="h-3 w-3" strokeWidth={2.5} />1
						</span>
					</span>
				</div>
			</div>

			{loading && (
				<div
					className="animate-pop-in mt-10"
					aria-live="polite"
					aria-label="Генерация идёт"
				>
					<PopSkeleton className="aspect-square w-full" />
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
							alt={prompt || "Сгенерированное изображение"}
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
