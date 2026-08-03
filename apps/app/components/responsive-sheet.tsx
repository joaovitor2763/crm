"use client";

import {
	type SheetSize,
	Sheet as UISheet,
	SheetContent as UISheetContent,
	SheetDescription as UISheetDescription,
	SheetHeader as UISheetHeader,
	SheetTitle as UISheetTitle,
} from "@crm/ui/components/sheet";
import { useIsMobile } from "@crm/ui/hooks/use-mobile";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { createContext, useContext } from "react";

/**
 * A side sheet on desktop and a full-screen detail surface on a phone.
 *
 * Everything in this app that would have been a sub-page is a sheet, and a
 * 5xl panel sliding in from the right of a 390px screen is not a sheet, it is
 * a broken page. Swapping the primitive here rather than at each call site
 * means no screen has to know which one it got.
 */
const ResponsiveContext = createContext(false);
const useResponsive = () => useContext(ResponsiveContext);

type RootProps = {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean;
	children?: React.ReactNode;
};

function Sheet({ children, ...props }: RootProps) {
	const isMobile = useIsMobile();
	return (
		<ResponsiveContext.Provider value={isMobile}>
			<UISheet {...props}>{children}</UISheet>
		</ResponsiveContext.Provider>
	);
}

function SheetContent({
	children,
	side,
	size,
	showCloseButton,
	className,
	...props
}: React.ComponentProps<"div"> & {
	side?: "top" | "right" | "bottom" | "left";
	size?: SheetSize;
	showCloseButton?: boolean;
	/** Radix's "where does focus land" hook — both branches forward it. */
	onOpenAutoFocus?: (event: Event) => void;
}) {
	if (useResponsive()) {
		// Record detail is a sub-page on a phone. A bottom drawer leaves too little
		// room for a header, facts, tabs, a composer and a timeline, and makes the
		// browser chrome overlap the last actions.
		return (
			<UISheetContent
				side="right"
				size={size}
				showCloseButton={showCloseButton}
				className={cn("h-dvh! w-screen! max-w-none! border-0", className)}
				{...props}
			>
				{children}
			</UISheetContent>
		);
	}
	return (
		<UISheetContent
			side={side}
			size={size}
			showCloseButton={showCloseButton}
			className={className}
			{...props}
		>
			{children}
		</UISheetContent>
	);
}

function SheetHeader(props: React.ComponentProps<"div">) {
	return <UISheetHeader {...props} />;
}

function SheetTitle(props: {
	className?: string;
	size?: "default" | "lg";
	children?: React.ReactNode;
}) {
	return <UISheetTitle {...props} />;
}

function SheetDescription(props: {
	className?: string;
	children?: React.ReactNode;
}) {
	return <UISheetDescription {...props} />;
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle };
