import { cn } from "@/lib/utils";

/* «gen42»: слово залито листом */
export function PopLogo({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"logo font-display text-2xl font-extrabold tracking-tight",
				className,
			)}
		>
			gen42
		</span>
	);
}
