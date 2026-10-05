import { cn } from "@/lib/utils";
import { PopWaitArt } from "./PopWaitArt";

/**
 * Ожидание генерации: процедурная сцена из хрустальных осколков и лучей
 * (PopWaitArt) — ни буквы, ни цифры, каждый запуск рисуется заново.
 * Текст остаётся только для чтения с экрана.
 */
export function PopWait({
	className,
	label,
}: {
	className?: string;
	label?: string;
}) {
	return (
		<div
			role="status"
			aria-live="polite"
			className={cn("pop-skeleton", className)}
		>
			<PopWaitArt />
			<p className="sr-only">{label ?? "Собираем кадр"}</p>
		</div>
	);
}
