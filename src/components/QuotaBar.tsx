import { cn } from "@/lib/utils";

/** Полоса остатка лимита: доля remaining/total, цвет по порогам */
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
	const ratio = total > 0 ? remaining / total : 0;
	return (
		<div
			className={cn(
				"h-2 overflow-hidden rounded-full",
				ratio <= 0 ? "bg-destructive/20" : "bg-secondary",
				className ?? "w-40",
			)}
			title={title}
		>
			<div
				className={cn(
					"h-full rounded-full transition-all",
					ratio > 0.5
						? "bg-primary"
						: ratio > 0.2
							? "bg-[#ffd54a]"
							: "bg-destructive",
				)}
				style={{ width: `${Math.min(ratio * 100, 100)}%` }}
			/>
		</div>
	);
}
