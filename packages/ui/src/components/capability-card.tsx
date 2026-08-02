import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import type { ReactNode } from "react";

export function CapabilityCard({
	title,
	description,
	status = "Planned",
	children,
	action,
}: {
	title: string;
	description: string;
	status?: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
				<CardAction>
					<StatusIndicator tone="info" label={status} />
				</CardAction>
			</CardHeader>
			<CardContent>
				<div className="text-muted-foreground text-sm">{children}</div>
				{action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
			</CardContent>
		</Card>
	);
}
