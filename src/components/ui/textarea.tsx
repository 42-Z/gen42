import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full border-0 border-b border-border bg-transparent px-0 py-2.5 text-base text-foreground outline-none",
        "placeholder:text-muted-foreground/60",
        "transition-colors hover:border-muted-foreground/50",
        "focus-visible:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "md:text-sm",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
