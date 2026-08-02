"use client";

import Asleep from "@carbon/icons-react/es/Asleep";
import Light from "@carbon/icons-react/es/Light";
import Logout from "@carbon/icons-react/es/Logout";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import { signOut } from "@crm/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import Logo from "@crm/ui/components/logo";
import { Separator } from "@crm/ui/components/separator";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";

type User = { name: string; email: string; image: string | null };

export function AppHeader({ user }: { user: User }) {
	async function handleSignOut() {
		const { error } = await signOut();

		if (error) {
			toast.error(error.message ?? "Could not sign out.");
			return;
		}

		// A full navigation rather than router.push: the session cookie is gone,
		// so every cached server render has to be thrown away and `proxy.ts`
		// re-evaluated from scratch.
		window.location.assign("/sign-in");
	}

	// h-12 rather than mvp's h-14. mvp fills its bar with h-8 controls (org
	// switcher, search, credits), so 56px reads tight there; this bar holds only
	// a logo, a label and an avatar, so the same 56px reads empty.
	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 [view-transition-name:app-header]">
			<div className="flex shrink-0 items-center gap-1">
				<Link
					href="/"
					aria-label="Homepage"
					className="flex size-8 items-center justify-center text-primary"
				>
					<Logo className="size-5" />
				</Link>
				<Separator orientation="vertical" className="mx-1 h-5 bg-transparent" />
				<span className="font-medium text-sm">Sales Ontology</span>
				<span className="hidden text-muted-foreground text-xs sm:inline">
					Inspired by Comp AI
				</span>
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<UserMenu
					user={user}
					onSignOut={() => {
						handleSignOut().catch(() => toast.error("Could not sign out."));
					}}
				/>
			</div>
		</header>
	);
}

function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Account menu"
					className="hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent"
				>
					<Avatar className="size-7">
						{user.image && <AvatarImage alt={user.name} src={user.image} />}
						<AvatarFallback className="text-xs">
							{initials(user.name)}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel className="flex items-center gap-2">
					<UserAvatar />
					<span className="min-w-0 truncate">{user.email}</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={(event) => {
						event.preventDefault();
						setTheme(isDark ? "light" : "dark");
					}}
				>
					{isDark ? <Light /> : <Asleep />}
					{isDark ? "Light mode" : "Dark mode"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onSignOut}>
					<Logout />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function initials(name: string): string {
	return (
		name
			.split(" ")
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}
