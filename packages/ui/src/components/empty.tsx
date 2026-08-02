import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/**
 * How much horizontal room the copy inside is allowed.
 *
 * `default` is a narrow measure, which is right for an empty table in the
 * middle of a page: prose past about sixty characters is harder to read, so a
 * one-line explanation is worth wrapping. It is wrong in a panel that is itself
 * wide and mostly empty — there the same limit sets a short sentence over two
 * ragged lines and wraps a row of three buttons onto two, which reads as
 * squashed rather than as considered.
 *
 * The variant lives on the container and reaches the parts through a group
 * selector, so a caller says how wide the empty state is once instead of
 * repeating a max-width on the header and again on the content.
 */
const emptyVariants = cva(
	// Sits at its natural height (a comfortable block) rather than stretching to
	// fill a flex-1 page shell. Opt into full-height centering per-usage with
	// `flex-1` on the className when needed.
				"group/empty flex w-full min-w-0 flex-col items-center justify-center gap-4 rounded-lg border-dashed px-6 py-12 text-center text-balance",
	{
		variants: {
			width: {
				default: "",
				wide: "",
			},
		},
		defaultVariants: {
			width: "default",
		},
	},
);

function Empty({
	className,
	width = "default",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyVariants>) {
	return (
		<div
			data-slot="empty"
			data-width={width}
			className={cn(emptyVariants({ width, className }))}
			{...props}
		/>
	);
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="empty-header"
			className={cn(
				"flex max-w-sm flex-col items-center gap-2",
				"group-data-[width=wide]/empty:max-w-xl",
				className,
			)}
			{...props}
		/>
	);
}

const emptyMediaVariants = cva(
	"mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				icon: "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function EmptyMedia({
	className,
	variant = "default",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
	return (
		<div
			data-slot="empty-icon"
			data-variant={variant}
			className={cn(emptyMediaVariants({ variant, className }))}
			{...props}
		/>
	);
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="empty-title"
			className={cn("font-heading text-sm font-medium", className)}
			{...props}
		/>
	);
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<div
			data-slot="empty-description"
			className={cn(
				"text-xs/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
				className,
			)}
			{...props}
		/>
	);
}

const emptyContentVariants = cva(
	"flex w-full max-w-sm min-w-0 items-center gap-2.5 text-xs text-balance group-data-[width=wide]/empty:max-w-2xl",
	{
		variants: {
			/**
			 * `stack` for one call to action under another; `row` for a set of
			 * equals, which is what a handful of suggested questions is. The row
			 * still wraps — it has to on a narrow sheet — but given the room it
			 * keeps them on one line.
			 */
			layout: {
				stack: "flex-col",
				row: "flex-row flex-wrap justify-center",
			},
		},
		defaultVariants: {
			layout: "stack",
		},
	},
);

function EmptyContent({
	className,
	layout,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyContentVariants>) {
	return (
		<div
			data-slot="empty-content"
			className={cn(emptyContentVariants({ layout, className }))}
			{...props}
		/>
	);
}

export {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
};
