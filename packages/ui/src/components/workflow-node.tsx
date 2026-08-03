import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@crm/ui/lib/utils";

const workflowNodeVariants = cva(
	"flex w-64 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow]",
	{
		variants: {
			kind: {
				trigger: "border-primary/50",
				condition: "border-warning/50",
				delay: "border-info/50",
				action: "border-border",
			},
			selected: {
				true: "ring-2 ring-ring ring-offset-2 ring-offset-background",
				false: null,
			},
		},
		defaultVariants: { kind: "action", selected: false },
	},
);

function WorkflowNode({
	className,
	kind,
	selected,
	...props
}: React.ComponentProps<"article"> &
	VariantProps<typeof workflowNodeVariants>) {
	return (
		<article
			data-slot="workflow-node"
			data-kind={kind}
			data-selected={selected}
			className={cn(workflowNodeVariants({ kind, selected }), className)}
			{...props}
		/>
	);
}

function WorkflowNodeHeader({
	className,
	...props
}: React.ComponentProps<"header">) {
	return (
		<header
			data-slot="workflow-node-header"
			className={cn(
				"flex cursor-grab items-center gap-3 border-b bg-muted/30 px-3 py-2 active:cursor-grabbing",
				className,
			)}
			{...props}
		/>
	);
}

function WorkflowNodeIcon({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="workflow-node-icon"
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded-md border bg-background",
				className,
			)}
			{...props}
		/>
	);
}

function WorkflowNodeHeading({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="workflow-node-heading"
			className={cn("min-w-0 flex-1", className)}
			{...props}
		/>
	);
}

function WorkflowNodeEyebrow({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="workflow-node-eyebrow"
			className={cn(
				"font-medium text-[0.625rem] text-muted-foreground uppercase tracking-wide",
				className,
			)}
			{...props}
		/>
	);
}

function WorkflowNodeTitle({
	className,
	...props
}: React.ComponentProps<"h4">) {
	return (
		<h4
			data-slot="workflow-node-title"
			className={cn("truncate font-medium text-sm", className)}
			{...props}
		/>
	);
}

function WorkflowNodeBody({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="workflow-node-body"
			className={cn("flex min-h-16 flex-col justify-center gap-1 px-3 py-2", className)}
			{...props}
		/>
	);
}

function WorkflowNodeDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="workflow-node-description"
			className={cn("line-clamp-2 text-muted-foreground text-xs/relaxed", className)}
			{...props}
		/>
	);
}

export {
	WorkflowNode,
	WorkflowNodeBody,
	WorkflowNodeDescription,
	WorkflowNodeEyebrow,
	WorkflowNodeHeader,
	WorkflowNodeHeading,
	WorkflowNodeIcon,
	WorkflowNodeTitle,
};
