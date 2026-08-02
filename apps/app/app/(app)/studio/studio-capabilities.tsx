import { Button } from "@crm/ui/components/button";
import { CapabilityCard } from "@crm/ui/components/capability-card";
import Link from "next/link";

export function StudioAccounts() {
	return (
		<CapabilityCard
			title="Account model"
			description="A configurable account entity is not exposed by the current API contract."
			status="Capability pending"
			action={
				<>
					<Button asChild variant="outline" size="sm">
						<Link href="/companies">Open companies</Link>
					</Button>
					<Button asChild variant="ghost" size="sm">
						<Link href="/deals">Open deals</Link>
					</Button>
				</>
			}
		>
			The current CRM keeps companies, contacts and deals as separate governed
			records. The Studio reserves this surface for account aggregation rules
			and will only activate it when those rules have a persisted schema.
		</CapabilityCard>
	);
}

export function StudioLineage() {
	return (
		<CapabilityCard
			title="Lineage and guided merge"
			description="Merge safety needs durable history and attribute-level provenance."
			status="Capability pending"
			action={
				<Button asChild variant="outline" size="sm">
					<Link href="/companies">Inspect source records</Link>
				</Button>
			}
		>
			No merge endpoint exists in the current tRPC router, so this view does not
			pretend to merge records. The planned flow will preview conflicts,
			preserve field history, retain source IDs and require an explicit human
			confirmation.
		</CapabilityCard>
	);
}
