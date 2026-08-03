"use client";

import Building from "@carbon/icons-react/es/Building";
import type { CarbonIconType } from "@carbon/icons-react/es/CarbonIcon";
import ChevronLeft from "@carbon/icons-react/es/ChevronLeft";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import Column from "@carbon/icons-react/es/Column";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import OverflowMenuHorizontal from "@carbon/icons-react/es/OverflowMenuHorizontal";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMobileNav } from "@/components/mobile-nav";

type RailItem = {
	title: string;
	href: string;
	icon: CarbonIconType;
	match: "exact" | "prefix";
};

const SETTINGS_ITEM: RailItem = {
	title: "Settings",
	href: "/settings",
	icon: Settings,
	match: "prefix",
};

const ITEMS: RailItem[] = [
	{ title: "Overview", href: "/", icon: Dashboard, match: "exact" },
	{ title: "Companies", href: "/companies", icon: Building, match: "prefix" },
	{
		title: "Contacts",
		href: "/contacts",
		icon: UserMultiple,
		match: "prefix",
	},
	{ title: "Deals", href: "/deals", icon: Partnership, match: "prefix" },
	{
		title: "Dashboards",
		href: "/dashboards",
		icon: Dashboard,
		match: "prefix",
	},
	{
		title: "Automations",
		href: "/automations",
		icon: MagicWand,
		match: "prefix",
	},
	{ title: "Studio", href: "/studio", icon: Column, match: "prefix" },
	SETTINGS_ITEM,
];

function isActive(item: RailItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && pathname.startsWith(item.href))
	);
}

function MobileTabLink({ item, active }: { item: RailItem; active: boolean }) {
	return (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex h-14 min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 text-muted-foreground text-[10px] outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
				active && "bg-primary/10 text-primary",
			)}
		>
			<Icon icon={item.icon} />
			<span className="truncate">{item.title}</span>
		</Link>
	);
}

function RailLink({
	item,
	active,
	expanded,
}: {
	item: RailItem;
	active: boolean;
	expanded: boolean;
}) {
	const link = (
		<Button
			asChild
			variant="ghost"
			size={expanded ? "default" : "icon"}
			className={cn(
				"relative text-muted-foreground",
				expanded && "w-full justify-start gap-3 px-3",
				active &&
					"bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary",
			)}
		>
			<Link
				href={item.href}
				aria-current={active ? "page" : undefined}
				transitionTypes={["nav-lateral"]}
			>
				<Icon icon={item.icon} />
				<span className={expanded ? "truncate" : "sr-only"}>{item.title}</span>
			</Link>
		</Button>
	);

	if (expanded) return link;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{link}</TooltipTrigger>
			<TooltipContent side="right">{item.title}</TooltipContent>
		</Tooltip>
	);
}

function MobileRailLink({
	item,
	active,
	onNavigate,
}: {
	item: RailItem;
	active: boolean;
	onNavigate: () => void;
}) {
	return (
		<Button
			asChild
			variant="ghost"
			className={cn(
				"justify-start gap-3 text-muted-foreground",
				active &&
					"bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
			)}
		>
			<Link
				href={item.href}
				aria-current={active ? "page" : undefined}
				onClick={onNavigate}
			>
				<Icon icon={item.icon} />
				<span>{item.title}</span>
			</Link>
		</Button>
	);
}

export function AppIconRail() {
	const pathname = usePathname();
	const { open, setOpen } = useMobileNav();
	const [expanded, setExpanded] = useState(true);
	const primaryItems = ITEMS.slice(0, 4);
	const moreActive = ITEMS.slice(4).some((item) => isActive(item, pathname));
	const groups = [
		{ label: "CRM", items: ITEMS.slice(0, 4) },
		{ label: "Build", items: ITEMS.slice(4, 7) },
	];

	return (
		<>
			<aside
				className={cn(
					"hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex [view-transition-name:app-rail] motion-reduce:transition-none",
					expanded ? "w-52" : "w-14",
				)}
			>
				<div
					className={cn(
						"flex h-11 items-center",
						expanded ? "px-3" : "justify-center",
					)}
				>
					{expanded ? (
						<span className="truncate font-medium text-xs">Workspace</span>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className={cn("text-muted-foreground", expanded && "ml-auto")}
						aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
						aria-expanded={expanded}
						onClick={() => setExpanded((value) => !value)}
					>
						<Icon icon={expanded ? ChevronLeft : ChevronRight} />
					</Button>
				</div>

				<nav
					aria-label="Primary"
					className="flex min-h-0 flex-1 flex-col px-2 pb-2"
				>
					{groups.map((group, index) => (
						<div
							key={group.label}
							className={cn("flex flex-col gap-1", index > 0 && "mt-4")}
						>
							{expanded ? (
								<p className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
									{group.label}
								</p>
							) : index > 0 ? (
								<div className="mx-2 mb-1 border-t" />
							) : null}
							{group.items.map((item) => (
								<RailLink
									key={item.href}
									item={item}
									active={isActive(item, pathname)}
									expanded={expanded}
								/>
							))}
						</div>
					))}
					<div className="mt-auto border-t pt-2">
						<RailLink
							item={SETTINGS_ITEM}
							active={isActive(SETTINGS_ITEM, pathname)}
							expanded={expanded}
						/>
					</div>
				</nav>
			</aside>

			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent
					id="mobile-app-menu"
					side="left"
					className="w-64 gap-0 p-0"
				>
					<SheetHeader>
						<SheetTitle>Sales Ontology</SheetTitle>
					</SheetHeader>
					<nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-2">
						{ITEMS.map((item) => (
							<MobileRailLink
								key={item.href}
								item={item}
								active={isActive(item, pathname)}
								onNavigate={() => setOpen(false)}
							/>
						))}
					</nav>
				</SheetContent>
			</Sheet>

			<div className="pointer-events-none fixed inset-x-3 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),--spacing(3))] md:hidden">
				<nav
					aria-label="Primary"
					className="pointer-events-auto mx-auto flex max-w-md overflow-hidden rounded-xl border bg-background/95 shadow-lg supports-backdrop-filter:backdrop-blur-md"
				>
					{primaryItems.map((item) => (
						<MobileTabLink
							key={item.href}
							item={item}
							active={isActive(item, pathname)}
						/>
					))}
					<button
						type="button"
						aria-label="Open more navigation"
						aria-controls="mobile-app-menu"
						aria-expanded={open}
						className={cn(
							"flex h-14 min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 text-muted-foreground text-[10px] outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
							moreActive && "bg-primary/10 text-primary",
						)}
						onClick={() => setOpen(true)}
					>
						<Icon icon={OverflowMenuHorizontal} />
						<span>More</span>
					</button>
				</nav>
			</div>
		</>
	);
}
