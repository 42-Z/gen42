import { SheetLayer } from "@/components/sheet/SheetLayer";
import { cn } from "@/lib/utils";

/** Полоса остатка лимита: дорожка — тёмное окно, заливка — спектр до значения (scaleX) */
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
				data-sheet="spectrum"
				className="h-full origin-left rounded-full transition-[transform]"
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
