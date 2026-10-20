// src/components/sheet/ResultFrame.tsx

import { IconPhotoOff } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flash } from "@/lib/sheet/flash";
import { impulse } from "@/lib/sheet/impulses";
import { SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";
import {
	GENERATION_STATUS_LABEL,
	ULTRA_PHASE_LABELS,
	type UltraPhase,
} from "@/lib/ultra/phase";
import { cn } from "@/lib/utils";
import { SheetLayer } from "./SheetLayer";

interface ResultFrameProps {
	loading: boolean;
	/** Генерация возобновлена после обновления страницы: первая ступень давно пройдена */
	resumed?: boolean;
	/** Стадия «Ультры»: от неё зависит движение спектра */
	phase?: UltraPhase | null;
	/** Когда стадия сменилась (ISO): застрявшая короткая стадия гаснет в «думает» */
	phaseAt?: string | null;
	image: {
		url: string;
		originalUrl?: string | null;
		alt: string;
		width?: number;
		height?: number;
	} | null;
	className?: string;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Короткие стадии живут меньше, чем успевает прийти следующий опрос */
const TRANSIENT_PHASE_MS = 8000;

const TRANSIENT_PHASES = new Set<UltraPhase>(["prepare", "library", "review"]);

interface Veil {
	phase: UltraPhase;
	key: number;
	leaving?: boolean;
}

/**
 * Рамка будущей картинки. Ожидание — две ступени яркости потока спектра (запрос
 * отправлен → принят), затем движение спектра по стадии прогона; без слов и
 * цифр. Готово — занавес сдёргивается влево, картинка проявляется, волна уходит
 * по странице («выдох»).
 */
export function ResultFrame({
	loading,
	resumed = false,
	phase = null,
	phaseAt = null,
	image,
	className,
}: ResultFrameProps) {
	const frame = useRef<HTMLDivElement>(null);
	const flow = useRef<HTMLElement>(null);
	const pic = useRef<HTMLImageElement>(null);
	const was = useRef(false);
	const timer = useRef<number | null>(null);
	const veilSeq = useRef(0);
	const [visualPhase, setVisualPhase] = useState<UltraPhase | null>(null);
	const [veils, setVeils] = useState<Veil[]>([]);
	const [useOriginal, setUseOriginal] = useState(false);
	const [imageReady, setImageReady] = useState(false);
	const [imageFailed, setImageFailed] = useState(false);
	const imageUrl = image?.url;
	const originalUrl = image?.originalUrl;
	const src = useOriginal && originalUrl ? originalUrl : imageUrl;
	const failImage = useCallback(
		(current: HTMLImageElement, expected: string | undefined) => {
			if (current.getAttribute("src") !== expected) return;
			if (!useOriginal && originalUrl && originalUrl !== imageUrl) {
				setUseOriginal(true);
				return;
			}
			setImageFailed(true);
			setImageReady(true);
		},
		[imageUrl, originalUrl, useOriginal],
	);
	const markImageReady = useCallback(
		(current: HTMLImageElement) => {
			const expected = src;
			void current.decode().then(
				() => {
					if (current.getAttribute("src") === expected) setImageReady(true);
				},
				() => failImage(current, expected),
			);
		},
		[failImage, src],
	);

	useEffect(() => {
		setUseOriginal(false);
		setImageFailed(false);
	}, [imageUrl, originalUrl]);

	useEffect(() => {
		setImageReady(false);
		const current = pic.current;
		if (current?.complete && current.naturalWidth > 0) markImageReady(current);
	}, [src, markImageReady]);

	// Короткая стадия не должна висеть до следующего опроса: если она не
	// обновилась за TRANSIENT_PHASE_MS, агент уже думает над прочитанным.
	useEffect(() => {
		if (!phase) {
			setVisualPhase(null);
			return;
		}
		const started = phaseAt ? Date.parse(phaseAt) : Number.NaN;
		const age = Number.isFinite(started)
			? Math.max(0, Date.now() - started)
			: 0;
		if (TRANSIENT_PHASES.has(phase) && age >= TRANSIENT_PHASE_MS) {
			setVisualPhase("thinking");
			return;
		}
		setVisualPhase(phase);
		if (!TRANSIENT_PHASES.has(phase)) return;
		const hold = window.setTimeout(
			() => setVisualPhase("thinking"),
			TRANSIENT_PHASE_MS - age,
		);
		return () => window.clearTimeout(hold);
	}, [phase, phaseAt]);

	// Смена стадии: старый слой спектра гаснет, новый приходит на его место —
	// так переключение не выглядит рывком.
	useEffect(() => {
		if (!loading || !visualPhase) {
			setVeils((current) => (current.length > 0 ? [] : current));
			return;
		}
		const key = ++veilSeq.current;
		setVeils((current) => [
			...current
				.filter((veil) => !veil.leaving)
				.map((veil) => ({ ...veil, leaving: true })),
			{ phase: visualPhase, key },
		]);
		const done = window.setTimeout(() => {
			setVeils((current) => current.filter((veil) => veil.key === key));
		}, 400);
		return () => window.clearTimeout(done);
	}, [loading, visualPhase]);

	useEffect(() => {
		const fl = flow.current;
		const fr = frame.current;
		if (!fl || !fr) return;
		const clearTimer = () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = null;
		};
		if (loading) {
			was.current = true;
			remeasure(fr);
			fl.dataset.on = "true";
			const settle = (announce: boolean) => {
				// Дальше движение делает фазовый слой; мигание прозрачностью убрано.
				fl.style.opacity = "0.6";
				if (announce) {
					impulse({ source: fr, sign: 1, weight: 0.3, mass: "heavy" });
				}
			};
			if (resumed || phase) {
				// после обновления или при уже известной стадии запрос давно принят
				settle(false);
			} else {
				fl.style.opacity = "0.25";
				timer.current = window.setTimeout(() => settle(true), 800);
			}
			return clearTimer;
		}
		clearTimer();
		const finish = () => {
			fl.style.opacity = "0";
			fl.dataset.on = "false";
		};
		if (!was.current) {
			finish();
			return;
		}
		if (!image) {
			was.current = false;
			finish();
			return;
		}
		// Не раскрываем занавес, пока браузер не получил и не декодировал копию.
		if (!imageReady) return;
		was.current = false;
		if (reduced()) {
			finish();
			impulse({ source: fr, sign: 1, weight: 1, mass: "heavy" });
			flash();
			return;
		}
		pic.current?.animate(
			[{ transform: "scale(1.04)" }, { transform: "scale(1)" }],
			{ duration: 700, easing: springLinear("heavy") },
		);
		const curtain = fl.animate(
			[{ transform: "translate(0,0)" }, { transform: "translate(-102%,0)" }],
			{
				duration: SPRINGS.heavy.move + 150,
				easing: springLinear("heavy"),
				fill: "forwards",
			},
		);
		curtain.finished.then(
			() => {
				finish();
				curtain.cancel();
				impulse({ source: fr, sign: 1, weight: 1, mass: "heavy" });
				flash();
			},
			() => finish(),
		);
		return clearTimer;
	}, [loading, resumed, phase, imageUrl, originalUrl, imageReady]);

	return (
		<div
			ref={frame}
			data-slot="result-frame"
			data-sheet="dark"
			data-phase={visualPhase ?? undefined}
			aria-busy={loading || (Boolean(image) && !imageReady)}
			{...(image
				? {}
				: loading
					? {
							role: "status",
							"aria-busy": true,
							"aria-label": visualPhase
								? ULTRA_PHASE_LABELS[visualPhase]
								: GENERATION_STATUS_LABEL,
						}
					: { role: "img", "aria-label": "Пустой холст" })}
			className={cn(
				"relative aspect-square w-full overflow-hidden rounded-[22px] border border-border",
				className,
			)}
		>
			<SheetLayer />
			{image && src && !imageFailed && (
				<img
					ref={pic}
					src={src}
					alt={image.alt}
					width={image.width ?? 1024}
					height={image.height ?? 1024}
					loading="eager"
					decoding="async"
					onLoad={(event) => markImageReady(event.currentTarget)}
					onError={(event) => failImage(event.currentTarget, src)}
					className="absolute inset-0 block size-full object-cover"
				/>
			)}
			{imageFailed && (
				<span
					role="img"
					aria-label="Не удалось загрузить изображение"
					className="absolute inset-0 flex items-center justify-center text-muted-foreground"
				>
					<IconPhotoOff />
				</span>
			)}
			<i
				ref={flow}
				data-sheet="spectrum"
				aria-hidden="true"
				className="frame-flow"
			>
				<SheetLayer />
				{veils.map((veil) => (
					<i
						key={veil.key}
						data-phase={veil.phase}
						data-leaving={veil.leaving ? "true" : undefined}
						aria-hidden="true"
						className="frame-fluid"
					>
						<i className="frame-blob" />
						<i className="frame-blob" />
						<i className="frame-blob" />
					</i>
				))}
			</i>
		</div>
	);
}
