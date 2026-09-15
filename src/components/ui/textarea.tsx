import type * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex field-sizing-content min-h-16 max-h-60 w-full rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-base text-foreground outline-none",
				"placeholder:text-muted-foreground",
				"transition-colors hover:border-primary/50",
				"focus-visible:border-primary",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"md:text-sm",
				"aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
