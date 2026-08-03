import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { PageTransition } from "./page-transition";

function PageShell({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<PageTransition>
			<main
				data-slot="page-shell-scroll"
				className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-muted/20 px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-6"
			>
				<div
					data-slot="page-shell"
					className={cn(
						"mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col gap-6",
						className,
					)}
					{...props}
				/>
			</main>
		</PageTransition>
	);
}

/**
 * No breadcrumbs: the app is five lists and a sheet, so there is never a trail
 * to draw. A record's own trail lives in the sheet, where the nesting is.
 */
function PageShellHeader({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<header
			data-slot="page-shell-header"
			className={cn(
				"flex flex-col gap-3 [view-transition-name:page-header]",
				className,
			)}
			{...props}
		>
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
				{children}
			</div>
		</header>
	);
}

function PageShellHeading({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-heading"
			className={cn("contents", className)}
			{...props}
		/>
	);
}

function PageShellTitle({ className, ...props }: React.ComponentProps<"h1">) {
	return (
		<h1
			data-slot="page-shell-title"
			className={cn(
				"col-start-1 row-start-1 min-w-0 self-center text-balance font-medium text-2xl tracking-tight md:text-3xl",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="page-shell-description"
			className={cn(
				"col-span-full row-start-2 text-balance text-muted-foreground text-sm",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-actions"
			className={cn(
				"col-start-2 row-start-1 flex flex-wrap items-center gap-2 self-center justify-self-end",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellContent({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-content"
			className={cn(
				"@container/page-content flex flex-1 flex-col gap-6",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
};
