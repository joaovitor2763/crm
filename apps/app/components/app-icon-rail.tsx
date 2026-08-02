"use client";

import Building from "@carbon/icons-react/es/Building";
import type { CarbonIconType } from "@carbon/icons-react/es/CarbonIcon";
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
import { usePathname, useSearchParams } from "next/navigation";
import { useMobileNav } from "@/components/mobile-nav";

type RailItem = {
	title: string;
	href: string;
	icon: CarbonIconType;
	match: "exact" | "prefix";
	studioView?: "automations" | "dashboards";
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
		href: "/studio?view=dashboards",
		icon: Dashboard,
		match: "exact",
		studioView: "dashboards",
	},
	{
		title: "Automations",
		href: "/studio?view=automations",
		icon: MagicWand,
		match: "exact",
		studioView: "automations",
	},
	{ title: "Studio", href: "/studio", icon: Column, match: "prefix" },
	{ title: "Settings", href: "/settings", icon: Settings, match: "prefix" },
];

function isActive(
	item: RailItem,
	pathname: string,
	studioView: string | null,
): boolean {
	if (item.studioView) {
		return pathname === "/studio" && studioView === item.studioView;
	}
	if (item.href === "/studio" && pathname.startsWith("/studio")) {
		return studioView !== "dashboards" && studioView !== "automations";
	}
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

function RailLink({ item, active }: { item: RailItem; active: boolean }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					asChild
					variant="ghost"
					size="icon"
					className={cn(
						"text-muted-foreground",
						active &&
							"bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
					)}
				>
					<Link
						href={item.href}
						aria-current={active ? "page" : undefined}
						transitionTypes={["nav-lateral"]}
					>
						<Icon icon={item.icon} />
						<span className="sr-only">{item.title}</span>
					</Link>
				</Button>
			</TooltipTrigger>
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
	const searchParams = useSearchParams();
	const { open, setOpen } = useMobileNav();
	const studioView = searchParams.get("view");
	const primaryItems = ITEMS.slice(0, 4);
	const moreActive = ITEMS.slice(4).some((item) =>
		isActive(item, pathname, studioView),
	);

	return (
		<>
			<nav
				aria-label="Primary"
				className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 md:flex [view-transition-name:app-rail]"
			>
				{ITEMS.map((item) => (
					<RailLink
						key={item.href}
						item={item}
						active={isActive(item, pathname, studioView)}
					/>
				))}
			</nav>

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
								active={isActive(item, pathname, studioView)}
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
							active={isActive(item, pathname, studioView)}
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
