import { Button } from "@crm/ui/components/button";
import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";

export type StudioNavigationItem = {
	id: string;
	label: string;
	description: string;
	icon?: ReactNode;
};

export function StudioNavigation({
	items,
	value,
	onValueChange,
	ariaLabel = "Revenue Architecture Studio",
}: {
	items: StudioNavigationItem[];
	value: string;
	onValueChange: (value: string) => void;
	ariaLabel?: string;
}) {
	return (
		<nav aria-label={ariaLabel} className="grid gap-1">
			{items.map((item) => {
				const active = item.id === value;

				return (
					<Button
						key={item.id}
						type="button"
						variant="ghost"
						className={cn(
							"h-auto min-h-10 justify-start gap-3 px-3 py-2 text-left",
							active &&
								"bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
						)}
						aria-current={active ? "page" : undefined}
						aria-pressed={active}
						onClick={() => onValueChange(item.id)}
					>
						{item.icon ? (
							<span data-icon="inline-start" className="mt-0.5 shrink-0">
								{item.icon}
							</span>
						) : null}
						<span className="grid min-w-0 gap-0.5">
							<span className="truncate">{item.label}</span>
							<span className="truncate text-muted-foreground text-[11px]">
								{item.description}
							</span>
						</span>
					</Button>
				);
			})}
		</nav>
	);
}
