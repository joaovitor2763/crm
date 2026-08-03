"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { cn } from "@crm/ui/lib/utils";
import { parseAsString, useQueryState } from "nuqs";
import type { ReactNode } from "react";

export function SettingsSections({
	sections,
}: {
	sections: Array<{
		id: string;
		label: string;
		description: string;
		content: ReactNode;
	}>;
}) {
	const [requested, setRequested] = useQueryState(
		"section",
		parseAsString.withDefault(sections[0]?.id ?? "profile"),
	);
	const active =
		sections.find((section) => section.id === requested) ?? sections[0];
	if (!active) return null;
	const groups = [
		{
			label: "Workspace",
			sections: sections.filter((section) =>
				["workspace", "connections", "governance", "admins"].includes(
					section.id,
				),
			),
		},
		{
			label: "Intelligence",
			sections: sections.filter((section) =>
				["ai", "access"].includes(section.id),
			),
		},
		{
			label: "Data lifecycle",
			sections: sections.filter((section) =>
				["marketing", "archive"].includes(section.id),
			),
		},
	].filter((group) => group.sections.length > 0);

	return (
		<div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
			<div className="lg:hidden">
				<Select
					value={active.id}
					onValueChange={(value) => void setRequested(value)}
				>
					<SelectTrigger className="w-full" aria-label="Settings section">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{groups.map((group) =>
							group.sections.map((section) => (
								<SelectItem key={section.id} value={section.id}>
									{section.label}
								</SelectItem>
							)),
						)}
					</SelectContent>
				</Select>
			</div>

			<nav
				aria-label="Settings sections"
				className="sticky top-0 hidden self-start rounded-lg border bg-card p-2 shadow-xs lg:block"
			>
				{groups.map((group, groupIndex) => (
					<details
						key={group.label}
						open
						className={cn("group/settings", groupIndex > 0 && "mt-3")}
					>
						<summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
							<Icon
								icon={ChevronDown}
								size={16}
								className="transition-transform group-open/settings:rotate-180 motion-reduce:transition-none"
							/>
							{group.label}
						</summary>
						<div className="flex flex-col gap-0.5">
							{group.sections.map((section) => (
								<Button
									key={section.id}
									type="button"
									variant={active.id === section.id ? "secondary" : "ghost"}
									className="h-auto w-full justify-start px-2 py-2 text-left"
									aria-current={active.id === section.id ? "page" : undefined}
									onClick={() => void setRequested(section.id)}
								>
									<span className="truncate">{section.label}</span>
								</Button>
							))}
						</div>
					</details>
				))}
			</nav>

			<section aria-labelledby="settings-section-title" className="min-w-0">
				<header className="mb-5 border-b pb-4">
					<h2
						id="settings-section-title"
						className="font-medium text-xl tracking-tight"
					>
						{active.label}
					</h2>
					<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
						{active.description}
					</p>
				</header>
				{active.content}
			</section>
		</div>
	);
}
