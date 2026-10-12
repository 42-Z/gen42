// src/components/sheet/Balance.tsx
import { IconCoins } from "@tabler/icons-react";
import { useLayoutEffect, useRef } from "react";
import { impulse } from "@/lib/sheet/impulses";
import { springLinear } from "@/lib/sheet/springs";
import { cn } from "@/lib/utils";

/** Плашка баланса: смена числа — старое уходит, новое приходит с другой стороны, плашка отвечает импульсом */
export function Balance({ value }: { value: number }) {
	const pill = useRef<HTMLDivElement>(null);
	const box = useRef<HTMLSpanElement>(null);
	const cur = useRef<HTMLSpanElement>(null);
	const prev = useRef(value);

	useLayoutEffect(() => {
		const from = prev.current;
		prev.current = value;
		if (from === value || !pill.current || !box.current || !cur.current) return;
		const grew = value > from;
		impulse({
			source: pill.current,
			sign: grew ? 1 : -1,
			weight: Math.min(1, Math.abs(value - from) / 42),
			mass: "light",
		});
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const dir = grew ? 1 : -1;
		const ghost = document.createElement("span");
		ghost.className = "absolute top-0 left-0";
		ghost.textContent = String(from);
		box.current.appendChild(ghost);
		ghost
			.animate(
				[
					{ transform: "translate(0,0)", opacity: 1 },
					{ transform: `translate(0,${-110 * dir}%)`, opacity: 0 },
				],
				{ duration: 360, easing: springLinear("light") },
			)
			.finished.then(
				() => ghost.remove(),
				() => ghost.remove(),
			);
		cur.current.animate(
			[
				{ transform: `translate(0,${110 * dir}%)`, opacity: 0 },
				{ transform: "translate(0,0)", opacity: 1 },
			],
			{ duration: 360, easing: "cubic-bezier(.3,.9,.3,1)" },
		);
	}, [value]);

	return (
		<div
			ref={pill}
			role="status"
			aria-label={`Баланс: ${value}`}
			className={cn(
				"flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-sm tabular-nums",
				value > 0 ? "text-foreground" : "text-destructive",
			)}
		>
			<IconCoins className="size-4 text-muted-foreground" strokeWidth={1.75} />
			<span ref={box} className="relative inline-block overflow-hidden">
				<span ref={cur} className="block">
					{value}
				</span>
			</span>
		</div>
	);
}
