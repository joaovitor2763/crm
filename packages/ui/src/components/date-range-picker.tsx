"use client";

import CalendarGlyph from "@carbon/icons-react/es/Calendar";
import { Button } from "@crm/ui/components/button";
import { Calendar } from "@crm/ui/components/calendar";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
// The same trigger as a select, for the same reason as `DatePicker`: a range
// sits beside a grain select in every filter row that uses it.
import { selectTriggerVariants } from "@crm/ui/components/select";
import { formatDay, fromDay, toDay } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

/** A window of days, as the day strings the APIs store. `""` means unset. */
export type DayRange = { from: string; to: string };

/**
 * Picking a from/to window from one calendar instead of two `<input
 * type="date">`s.
 *
 * Two native inputs is how every filter row here started, and it is the worst
 * version of this control twice over: the browser draws its own picker (which
 * ignores every token in the repo), and "from" and "to" validate nothing
 * against each other, so a window ending before it starts is representable.
 * One range calendar can't express that state, and one trigger reads as the
 * single fact it is: a window.
 */
export function DateRangePicker({
	id,
	value,
	onChange,
	placeholder = "All time",
	numberOfMonths = 2,
	variant,
	className,
}: {
	id?: string;
	value: DayRange;
	/** Both ends move together; either may come back `""`. */
	onChange: (next: DayRange) => void;
	placeholder?: string;
	numberOfMonths?: 1 | 2;
	className?: string;
} & VariantProps<typeof selectTriggerVariants>) {
	const [open, setOpen] = useState(false);
	const selected: DateRange | undefined =
		value.from || value.to
			? { from: fromDay(value.from), to: fromDay(value.to) }
			: undefined;
	const hasValue = Boolean(value.from || value.to);

	const label = hasValue
		? `${value.from ? formatDay(value.from) : "…"} – ${value.to ? formatDay(value.to) : "…"}`
		: placeholder;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					id={id}
					data-slot="date-range-picker-trigger"
					data-size="default"
					data-placeholder={hasValue ? undefined : ""}
					className={cn(selectTriggerVariants({ variant }), "w-full", className)}
				>
					<span className="line-clamp-1">{label}</span>
					<Icon
						icon={CalendarGlyph}
						className="size-4 text-muted-foreground transition-opacity"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent size="fit" align="start">
				<Calendar
					mode="range"
					selected={selected}
					numberOfMonths={numberOfMonths}
					defaultMonth={selected?.from}
					onSelect={(next) =>
						onChange({
							from: next?.from ? toDay(next.from) : "",
							to: next?.to ? toDay(next.to) : "",
						})
					}
					autoFocus
				/>
				{hasValue ? (
					<div className="border-t p-1">
						<Button
							variant="ghost"
							size="sm"
							className="w-full justify-start"
							onClick={() => {
								setOpen(false);
								onChange({ from: "", to: "" });
							}}
						>
							Clear
						</Button>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
