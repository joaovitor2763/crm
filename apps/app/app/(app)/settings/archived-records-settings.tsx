"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Empty } from "@crm/ui/components/empty";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ArchivedRecordsSettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const companies = useQuery(trpc.companies.archived.queryOptions());
	const contacts = useQuery(trpc.contacts.archived.queryOptions());
	const deals = useQuery(trpc.deals.archived.queryOptions());
	const companyRestore = useMutation(
		trpc.companies.restore.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.company(variables.id);
				toast.success("Company restored.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const contactRestore = useMutation(
		trpc.contacts.restore.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.contact(variables.id);
				toast.success("Contact restored.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const dealRestore = useMutation(
		trpc.deals.restore.mutationOptions({
			onSuccess: async (_, variables) => {
				await cache.deal(variables.id);
				toast.success("Deal restored.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const empty =
		(companies.data?.length ?? 0) === 0 &&
		(contacts.data?.length ?? 0) === 0 &&
		(deals.data?.length ?? 0) === 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Archived records</CardTitle>
			</CardHeader>
			<CardContent>
				{empty ? <Empty>No archived records.</Empty> : null}
				{(companies.data ?? []).map((company) => (
					<ArchivedRow
						key={`company-${company.id}`}
						kind="Company"
						name={company.name}
						detail={company.domain}
						archivedAt={company.archivedAt}
						onOpen={() => openRecord({ kind: "company", id: company.id })}
						onRestore={() => companyRestore.mutate({ id: company.id })}
						pending={companyRestore.isPending}
					/>
				))}
				{(contacts.data ?? []).map((contact) => (
					<ArchivedRow
						key={`contact-${contact.id}`}
						kind="Contact"
						name={[contact.firstName, contact.lastName]
							.filter(Boolean)
							.join(" ")}
						detail={contact.email}
						archivedAt={contact.archivedAt}
						onOpen={() => openRecord({ kind: "contact", id: contact.id })}
						onRestore={() => contactRestore.mutate({ id: contact.id })}
						pending={contactRestore.isPending}
					/>
				))}
				{(deals.data ?? []).map((deal) => (
					<ArchivedRow
						key={`deal-${deal.id}`}
						kind="Deal"
						name={deal.name}
						detail={`${deal.company.name} · ${deal.pipeline.name}${deal.pipeline.archived ? " (archived pipeline)" : ""}`}
						archivedAt={deal.archivedAt}
						onOpen={() => openRecord({ kind: "deal", id: deal.id })}
						onRestore={() => dealRestore.mutate({ id: deal.id })}
						pending={dealRestore.isPending}
					/>
				))}
			</CardContent>
		</Card>
	);
}

function ArchivedRow({
	kind,
	name,
	detail,
	archivedAt,
	onOpen,
	onRestore,
	pending,
}: {
	kind: string;
	name: string;
	detail: string | null;
	archivedAt: string | null;
	onOpen: () => void;
	onRestore: () => void;
	pending: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
			<button type="button" className="min-w-0 text-left" onClick={onOpen}>
				<p className="font-medium">{name}</p>
				<p className="text-muted-foreground text-xs">
					{kind}
					{detail ? ` · ${detail}` : ""}
					{archivedAt ? ` · ${new Date(archivedAt).toLocaleDateString()}` : ""}
				</p>
			</button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={onRestore}
				disabled={pending}
			>
				Restore
			</Button>
		</div>
	);
}
