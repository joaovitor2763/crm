"use client";

import { Button } from "@crm/ui/components/button";
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
	return (
		<div className="flex flex-col gap-5">
			<nav
				aria-label="Settings sections"
				className="no-scrollbar flex max-w-full gap-1 overflow-x-auto border-b pb-2"
			>
				{sections.map((section) => (
					<Button
						key={section.id}
						type="button"
						variant={active.id === section.id ? "secondary" : "ghost"}
						size="sm"
						className="shrink-0"
						aria-current={active.id === section.id ? "page" : undefined}
						onClick={() => void setRequested(section.id)}
					>
						{section.label}
					</Button>
				))}
			</nav>
			<div>
				<div className="mb-4">
					<h2 className="font-medium text-lg">{active.label}</h2>
					<p className="text-muted-foreground text-sm">{active.description}</p>
				</div>
				{active.content}
			</div>
		</div>
	);
}
