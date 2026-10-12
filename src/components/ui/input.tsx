import type * as React from "react";
import { useFieldFx } from "@/components/sheet/use-field-fx";
import { cn } from "@/lib/utils";

function Input({
	className,
	type,
	ref,
	...props
}: React.ComponentProps<"input">) {
	const fx = useFieldFx<HTMLInputElement>(ref);
	return (
		<input
			ref={fx}
			type={type}
			data-slot="input"
			data-impulse="field"
			className={cn(
				"w-full min-w-0 rounded-2xl border border-border bg-secondary/60 px-4 py-2.5 text-base text-foreground outline-none",
				"placeholder:text-muted-foreground",
				"transition-colors hover:border-primary/50",
				"focus-visible:border-primary",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"md:text-sm",
				"aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
