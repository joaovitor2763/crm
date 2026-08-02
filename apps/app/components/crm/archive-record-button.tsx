"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Renew from "@carbon/icons-react/es/Renew";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ArchiveRecordButton({
	kind,
	id,
	archived,
}: {
	kind: "company" | "contact" | "deal";
	id: string;
	archived: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const completed = async () => {
		if (kind === "company") await cache.company(id);
		else if (kind === "contact") await cache.contact(id);
		else await cache.deal(id);
		toast.success(archived ? "Record restored." : "Record archived.");
	};
	const company = useMutation(
		(archived
			? trpc.companies.restore
			: trpc.companies.archive
		).mutationOptions({
			onSuccess: completed,
			onError: (error) => toast.error(error.message),
		}),
	);
	const contact = useMutation(
		(archived ? trpc.contacts.restore : trpc.contacts.archive).mutationOptions({
			onSuccess: completed,
			onError: (error) => toast.error(error.message),
		}),
	);
	const deal = useMutation(
		(archived ? trpc.deals.restore : trpc.deals.archive).mutationOptions({
			onSuccess: completed,
			onError: (error) => toast.error(error.message),
		}),
	);
	const mutation =
		kind === "company" ? company : kind === "contact" ? contact : deal;

	return (
		<Button
			variant="outline"
			size="sm"
			aria-label={archived ? "Restore record" : "Archive record"}
			disabled={mutation.isPending}
			onClick={() => mutation.mutate({ id })}
		>
			<Icon icon={archived ? Renew : Archive} data-icon="inline-start" />
			<span className="hidden sm:inline">
				{archived ? "Restore" : "Archive"}
			</span>
		</Button>
	);
}
