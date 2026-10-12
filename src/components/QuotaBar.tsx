import { SheetLayer } from "@/components/sheet/SheetLayer";
import { cn } from "@/lib/utils";

/**
 * Тон заливки по остатку — только фиолетовые оттенки листа: от спектра (много)
 * через хребет (средне) к притушенному хребту (мало). Остаток читается ещё и по
 * длине, поэтому тон не единственный носитель смысла.
 */
function tone(ratio: number): { sheet: "spectrum" | "ridge"; dim: boolean } {
	if (ratio > 0.5) return { sheet: "spectrum", dim: false };
	if (ratio > 0.2) return { sheet: "ridge", dim: false };
	return { sheet: "ridge", dim: true };
}

/** Полоса остатка лимита: дорожка — тёмное окно, заливка — лист до значения (scaleX) */
export function QuotaBar({
	remaining,
	total,
	title,
	className,
}: {
	remaining: number;
	total: number;
	title: string;
	className?: string;
}) {
	const ratio = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
	const { sheet, dim } = tone(ratio);
	return (
		<div
			data-sheet="dark"
			className={cn(
				"h-2 rounded-full border border-border",
				className ?? "w-40",
			)}
			title={title}
		>
			<SheetLayer />
			<div
				data-sheet={sheet}
				className={cn(
					"h-full origin-left rounded-full transition-[transform,opacity]",
					dim && "opacity-60",
				)}
				style={{
					transform: `scaleX(${ratio})`,
					transitionDuration: "var(--spring-medium-ms)",
					transitionTimingFunction: "var(--spring-medium)",
				}}
			>
				<SheetLayer />
			</div>
		</div>
	);
}
