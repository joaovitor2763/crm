"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const NONE = "none";

export function CreateContactSheet({
	/** Pre-selects a company when opened from that company's page. */
	companyId,
}: {
	companyId?: string;
}) {
	const openRecord = useOpenRecord();
	const trpc = useTRPC();
	const cache = useCrmCache();

	// URL state, like every other view state here — see CreateCompanySheet.
	const [open, setOpen] = useQueryState(
		"new",
		parseAsBoolean.withDefault(false),
	);
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [title, setTitle] = useState("");
	const [company, setCompany] = useState(companyId ?? NONE);
	const [ownerId, setOwnerId] = useState(NONE);
	const [utmSource, setUtmSource] = useState("");
	const [utmMedium, setUtmMedium] = useState("");
	const [utmCampaign, setUtmCampaign] = useState("");
	const [utmTerm, setUtmTerm] = useState("");
	const [utmContent, setUtmContent] = useState("");

	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const titleId = useId();

	const users = useQuery(trpc.users.list.queryOptions());
	const companies = useQuery(trpc.companies.options.queryOptions({ q: "" }));

	const create = useMutation(
		trpc.contacts.create.mutationOptions({
			onSuccess: async (contact) => {
				await cache.contact(contact.id);
				toast.success(
					`${[contact.firstName, contact.lastName].filter(Boolean).join(" ")} added.`,
				);
				await setOpen(null);
				setFirstName("");
				setLastName("");
				setEmail("");
				setTitle("");
				setUtmSource("");
				setUtmMedium("");
				setUtmCampaign("");
				setUtmTerm("");
				setUtmContent("");
				openRecord({ kind: "contact", id: contact.id });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Icon icon={Add} data-icon="inline-start" />
					New contact
				</Button>
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New contact</SheetTitle>
					<SheetDescription>
						Email addresses are unique, so importing the same person twice
						updates them rather than duplicating them.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-contact"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({
							firstName,
							lastName: lastName || undefined,
							email: email || undefined,
							title: title || undefined,
							companyId: company === NONE ? null : company,
							ownerId: ownerId === NONE ? null : ownerId,
							utmSource: utmSource || undefined,
							utmMedium: utmMedium || undefined,
							utmCampaign: utmCampaign || undefined,
							utmTerm: utmTerm || undefined,
							utmContent: utmContent || undefined,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
							<Input
								id={firstNameId}
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={lastNameId}>Last name</FieldLabel>
							<Input
								id={lastNameId}
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={emailId}>Email</FieldLabel>
							<Input
								id={emailId}
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={titleId}>Title</FieldLabel>
							<Input
								id={titleId}
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Head of Security"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-contact-company">Company</FieldLabel>
							<Select value={company} onValueChange={setCompany}>
								<SelectTrigger id="create-contact-company">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>No company</SelectItem>
									{(companies.data ?? []).map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="create-contact-owner">Owner</FieldLabel>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger id="create-contact-owner">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>Unassigned</SelectItem>
									{(users.data ?? []).map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="contact-utm-source">UTM source</FieldLabel>
							<Input
								id="contact-utm-source"
								value={utmSource}
								onChange={(event) => setUtmSource(event.target.value)}
								placeholder="google"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="contact-utm-medium">UTM medium</FieldLabel>
							<Input
								id="contact-utm-medium"
								value={utmMedium}
								onChange={(event) => setUtmMedium(event.target.value)}
								placeholder="cpc"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="contact-utm-campaign">
								UTM campaign
							</FieldLabel>
							<Input
								id="contact-utm-campaign"
								value={utmCampaign}
								onChange={(event) => setUtmCampaign(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="contact-utm-term">UTM term</FieldLabel>
							<Input
								id="contact-utm-term"
								value={utmTerm}
								onChange={(event) => setUtmTerm(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="contact-utm-content">UTM content</FieldLabel>
							<Input
								id="contact-utm-content"
								value={utmContent}
								onChange={(event) => setUtmContent(event.target.value)}
							/>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-contact"
						disabled={create.isPending || firstName.trim() === ""}
					>
						{create.isPending ? <Spinner /> : null}
						Add contact
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
