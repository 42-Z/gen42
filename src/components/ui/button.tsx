import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { SheetLayer } from "@/components/sheet/SheetLayer";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "text-white disabled:bg-secondary",
				destructive:
					"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
				outline:
					"border border-input text-muted-foreground hover:text-foreground",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost:
					"hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
				lg: "h-10 px-6 has-[>svg]:px-4",
				icon: "size-9",
				"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

/** Какое окно листа несёт вариант: основная кнопка — хребет, контурная — тёмная полоса */
const WINDOW: Partial<
	Record<
		NonNullable<VariantProps<typeof buttonVariants>["variant"]>,
		"ridge" | "dark"
	>
> = {
	default: "ridge",
	outline: "dark",
};

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	weight,
	children,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		/** Вес импульса по цене действия, 0..1 */
		weight?: number;
	}) {
	const sheet = asChild ? undefined : WINDOW[variant ?? "default"];
	const sharedProps = {
		"data-slot": "button",
		"data-variant": variant,
		"data-size": size,
		"data-impulse": "tap",
		"data-weight": weight ?? (variant === "default" ? 0.5 : 0.25),
		...(sheet ? { "data-sheet": sheet } : {}),
		className: cn(buttonVariants({ variant, size, className })),
		...props,
	};

	if (asChild) {
		return <Slot.Root {...sharedProps}>{children}</Slot.Root>;
	}

	return (
		<button {...sharedProps}>
			{sheet ? <SheetLayer /> : null}
			{children}
		</button>
	);
}

export { Button, buttonVariants };
