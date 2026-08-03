"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { cn } from "@crm/ui/lib/utils";
import { useState } from "react";

export type SearchComboboxOption = {
	value: string;
	label: string;
	description?: string;
	/** Searchable aliases that do not need to clutter the visible option. */
	keywords?: string[];
};

export function SearchCombobox({
	value,
	onValueChange,
	options,
	placeholder = "Select…",
	searchPlaceholder = "Search…",
	emptyMessage = "No options found.",
	disabled,
	className,
	ariaLabel,
	id,
}: {
	value: string;
	onValueChange: (value: string) => void;
	options: SearchComboboxOption[];
	placeholder?: string;
	searchPlaceholder?: string;
	emptyMessage?: string;
	disabled?: boolean;
	className?: string;
	ariaLabel?: string;
	id?: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.value === value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					size="sm"
					role="combobox"
					aria-expanded={open}
					aria-label={ariaLabel ?? placeholder}
					disabled={disabled}
					className={cn("justify-between font-normal", className)}
				>
					<span className="truncate">{selected?.label ?? placeholder}</span>
					<ChevronDown className="shrink-0 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				size="fit"
				className="w-[var(--radix-popover-trigger-width)] min-w-56 max-w-[calc(100vw-2rem)]"
			>
				<Command>
					<CommandInput placeholder={searchPlaceholder} />
					<CommandList className="max-h-[min(18rem,var(--radix-popover-content-available-height))] overscroll-contain">
						<CommandEmpty>{emptyMessage}</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									value={`${option.value} ${option.label} ${option.description ?? ""} ${option.keywords?.join(" ") ?? ""}`}
									data-checked={option.value === value}
									onSelect={() => {
										onValueChange(option.value);
										setOpen(false);
									}}
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate">{option.label}</span>
										{option.description ? (
											<span className="block truncate text-muted-foreground">
												{option.description}
											</span>
										) : null}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
