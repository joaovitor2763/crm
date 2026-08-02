import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/**
 * `field-sizing-content` means the box is already the height of what is in it —
 * the only question a size answers is how tall it is when empty.
 *
 * `sm` is one line, for a field that is always on screen waiting to be typed
 * into. A four-line box sitting empty at the top of a panel is a form; a single
 * line is a place to start.
 */
const textareaVariants = cva(
	"flex field-sizing-content w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
	{
		variants: {
			size: { default: "min-h-16", sm: "min-h-8" },
		},
		defaultVariants: { size: "default" },
	},
);

function Textarea({
	className,
	size,
	...props
}: Omit<React.ComponentProps<"textarea">, "size"> &
	VariantProps<typeof textareaVariants>) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(textareaVariants({ size }), className)}
			{...props}
		/>
	);
}

export { Textarea, textareaVariants };
