// src/components/sheet/ResultFrame.tsx

import { IconPhotoOff } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flash } from "@/lib/sheet/flash";
import { impulse } from "@/lib/sheet/impulses";
import { SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";
import { cn } from "@/lib/utils";
import { SheetLayer } from "./SheetLayer";

interface ResultFrameProps {
	loading: boolean;
	/** Генерация возобновлена после обновления страницы: первая ступень давно пройдена */
	resumed?: boolean;
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

/**
 * Рамка будущей картинки. Ожидание — две ступени яркости потока спектра (запрос
 * отправлен → принят), затем дыхание; без слов и цифр. Готово — занавес
 * сдёргивается влево, картинка проявляется, волна уходит по странице («выдох»).
 */
export function ResultFrame({
	loading,
	resumed = false,
	image,
	className,
}: ResultFrameProps) {
	const frame = useRef<HTMLDivElement>(null);
	const flow = useRef<HTMLElement>(null);
	const pic = useRef<HTMLImageElement>(null);
	const was = useRef(false);
	const breath = useRef<Animation | null>(null);
	const timer = useRef<number | null>(null);
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
				fl.style.opacity = "0.4";
				if (announce) {
					impulse({ source: fr, sign: 1, weight: 0.3, mass: "heavy" });
				}
				if (!reduced()) {
					breath.current = fl.animate([{ opacity: 0.4 }, { opacity: 0.55 }], {
						duration: 2000,
						direction: "alternate",
						iterations: Number.POSITIVE_INFINITY,
						// ступенчатое дыхание: кадр рисуется только при заметном изменении яркости
						easing: "steps(6)",
					});
				}
			};
			if (resumed) {
				// после обновления страницы запрос давно принят: сразу вторая ступень
				settle(false);
			} else {
				fl.style.opacity = "0.25";
				timer.current = window.setTimeout(() => settle(true), 800);
			}
			// бесконечное дыхание не должно пережить рамку (переход в админку во время генерации)
			return () => {
				clearTimer();
				breath.current?.cancel();
				breath.current = null;
			};
		}
		clearTimer();
		breath.current?.cancel();
		breath.current = null;
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
	}, [loading, resumed, imageUrl, originalUrl, imageReady]);

	return (
		<div
			ref={frame}
			data-slot="result-frame"
			data-sheet="dark"
			aria-busy={loading || (Boolean(image) && !imageReady)}
			{...(image
				? {}
				: loading
					? {
							role: "status",
							"aria-busy": true,
							"aria-label": "Идёт генерация",
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
			</i>
		</div>
	);
}
