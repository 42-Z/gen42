// src/components/sheet/BrandMark.tsx
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { PopLogo } from "@/components/graphics";
import {
	DOODLE_MS,
	DOODLE_PLAY_EVENT,
	DOODLES_STORAGE_KEY,
	type DoodleKind,
	isDoodleKind,
	nextDelay,
	pickDoodle,
} from "@/lib/sheet/doodles";
import { cn } from "@/lib/utils";
import { Doodle } from "./doodles";

/** Через сколько повторить попытку показа, если вкладка скрыта или дудл уже идёт, мс */
const RETRY_MS = 5_000;

function timerOff(): boolean {
	try {
		return (
			matchMedia("(prefers-reduced-motion: reduce)").matches ||
			localStorage.getItem(DOODLES_STORAGE_KEY) === "off"
		);
	} catch {
		return false;
	}
}

/**
 * Знак «gen42»: слово, которое время от времени уступает место дудлу про 42 и
 * возвращается. Дудл монтируется только на время показа, поэтому в покое ни
 * анимаций, ни слоёв нет. Показ по таймеру можно выключить ключом
 * `gen42-doodles = off`; вручную его запускает событие `doodle:play` на знаке.
 */
export function BrandMark({ className }: { className?: string }) {
	const root = useRef<HTMLSpanElement>(null);
	const [kind, setKind] = useState<DoodleKind | null>(null);
	const last = useRef<DoodleKind | null>(null);
	const busy = useRef(false);
	const hideTimer = useRef<number | undefined>(undefined);

	const play = useCallback((wanted?: DoodleKind) => {
		if (busy.current) return;
		busy.current = true;
		const next = wanted ?? pickDoodle(last.current);
		last.current = next;
		setKind(next);
		hideTimer.current = window.setTimeout(() => {
			busy.current = false;
			setKind(null);
		}, DOODLE_MS);
	}, []);

	// ручной запуск: событие на корне знака
	useEffect(() => {
		const el = root.current;
		if (!el) return;
		const onPlay = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			play(isDoodleKind(detail) ? detail : undefined);
		};
		el.addEventListener(DOODLE_PLAY_EVENT, onPlay);
		return () => el.removeEventListener(DOODLE_PLAY_EVENT, onPlay);
	}, [play]);

	// показ по таймеру: первая пауза короче, дальше пауза идёт после конца показа
	useEffect(() => {
		let timer: number | undefined;
		const schedule = (delay: number, first: boolean) => {
			timer = window.setTimeout(() => {
				if (timerOff() || document.hidden || busy.current) {
					schedule(RETRY_MS, first);
					return;
				}
				play();
				schedule(DOODLE_MS + nextDelay(false), false);
			}, delay);
		};
		schedule(nextDelay(true), true);
		return () => {
			window.clearTimeout(timer);
			window.clearTimeout(hideTimer.current);
			busy.current = false;
		};
	}, [play]);

	return (
		<span
			ref={root}
			className={cn("brand text-3xl", className)}
			data-doodle={kind ? "on" : undefined}
			style={
				kind ? ({ "--d-ms": `${DOODLE_MS}ms` } as CSSProperties) : undefined
			}
		>
			<PopLogo />
			{kind && <Doodle key={kind} kind={kind} />}
		</span>
	);
}
