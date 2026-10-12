// src/components/sheet/ResultFrame.tsx
import { useEffect, useRef } from "react";
import { impulse } from "@/lib/sheet/impulses";
import { SPRINGS, springLinear } from "@/lib/sheet/springs";
import { remeasure } from "@/lib/sheet/windows";
import { cn } from "@/lib/utils";
import { SheetLayer } from "./SheetLayer";

interface ResultFrameProps {
	loading: boolean;
	image: { url: string; alt: string } | null;
	className?: string;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Рамка будущей картинки. Ожидание — две ступени яркости потока спектра (запрос
 * отправлен → принят), затем дыхание; без слов и цифр. Готово — занавес
 * сдёргивается влево, картинка проявляется, волна уходит по странице («выдох»).
 */
export function ResultFrame({ loading, image, className }: ResultFrameProps) {
	const frame = useRef<HTMLDivElement>(null);
	const flow = useRef<HTMLElement>(null);
	const pic = useRef<HTMLImageElement>(null);
	const was = useRef(false);
	const breath = useRef<Animation | null>(null);
	const timer = useRef<number | null>(null);

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
			fl.style.opacity = "0.25";
			timer.current = window.setTimeout(() => {
				fl.style.opacity = "0.4";
				impulse({ source: fr, sign: 1, weight: 0.3, mass: "heavy" });
				if (!reduced()) {
					breath.current = fl.animate([{ opacity: 0.4 }, { opacity: 0.55 }], {
						duration: 2000,
						direction: "alternate",
						iterations: Number.POSITIVE_INFINITY,
						easing: "ease-in-out",
					});
				}
			}, 800);
			return clearTimer;
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
		was.current = false;
		if (!image) {
			finish();
			return;
		}
		if (reduced()) {
			finish();
			impulse({ source: fr, sign: 1, weight: 1, mass: "heavy" });
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
			},
			() => finish(),
		);
		return clearTimer;
	}, [loading]);

	return (
		<div
			ref={frame}
			data-sheet="dark"
			{...(image ? {} : { role: "img", "aria-label": "Пустой холст" })}
			className={cn(
				"relative aspect-square w-full overflow-hidden rounded-[22px] border border-border",
				className,
			)}
		>
			<SheetLayer />
			{image && (
				<img
					ref={pic}
					src={image.url}
					alt={image.alt}
					className="absolute inset-0 block size-full object-cover"
				/>
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
