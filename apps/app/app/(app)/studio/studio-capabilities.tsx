"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { StudioAccounts } from "./studio-accounts";

export { StudioAccounts };

export function StudioLineage({
	canManage,
	canConfigure,
}: {
	canManage: boolean;
	canConfigure: boolean;
}) {
	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Lineage and merge safety</CardTitle>
					<CardDescription>
						Every account attribute change, relation movement and merge keeps an
						operation-level history for review.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-muted-foreground text-xs">
					Select an account below to inspect its attribute history, lineage
					events and guided merge preview. The merge action requires a second
					explicit confirmation.
				</CardContent>
			</Card>
			<StudioAccounts canManage={canManage} canConfigure={canConfigure} />
		</div>
	);
}
