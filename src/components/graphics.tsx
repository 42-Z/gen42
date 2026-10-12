import { cn } from "@/lib/utils";

/* «gen42»: слово залито листом; размер задаёт знак (BrandMark) */
export function PopLogo({ className }: { className?: string }) {
	return <span className={cn("logo font-display", className)}>gen42</span>;
}
