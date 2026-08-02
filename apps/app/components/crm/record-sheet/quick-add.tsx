"use client";

import { Button } from "@crm/ui/components/button";
import { DatePicker } from "@crm/ui/components/date-picker";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

/**
 * Adding a person or a deal without leaving the company you are looking at.
 *
 * An inline panel rather than a dialog over the sheet: you are already two
 * layers deep, a third one that has to be dismissed before you can see whether
 * the row landed is a layer too many. It also means adding three people in a
 * row is three forms, not three round trips through a modal.
 *
 * Only the fields you would actually have to hand go here. Everything else is
 * one click away on the record it just created.
 */
function QuickAddForm({
	submitLabel,
	pending,
	ready,
	onSubmit,
	onCancel,
	children,
}: {
	submitLabel: string;
	pending: boolean;
	ready: boolean;
	onSubmit: () => void;
	onCancel: () => void;
	children: React.ReactNode;
}) {
	return (
		<form
			className="flex shrink-0 flex-col gap-4 border-b px-5 py-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<div className="grid gap-4 sm:grid-cols-2">{children}</div>
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={pending}
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={pending || !ready}>
					{pending ? <Spinner /> : null}
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}

export function QuickAddContact({
	companyId,
	ownerId,
	onDone,
}: {
	companyId: string;
	/** Whoever owns the company — the person adding them almost never differs. */
	ownerId: string | null;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [title, setTitle] = useState("");

	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const titleId = useId();

	const create = useMutation(
		trpc.contacts.create.mutationOptions({
			onSuccess: async (contact) => {
				await cache.contact(contact.id);
				toast.success(`${contact.firstName} added.`);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<QuickAddForm
			submitLabel="Add contact"
			pending={create.isPending}
			ready={firstName.trim() !== ""}
			onCancel={onDone}
			onSubmit={() =>
				create.mutate({
					firstName,
					lastName: lastName || undefined,
					email: email || undefined,
					title: title || undefined,
					companyId,
					ownerId,
				})
			}
		>
			<Field>
				<FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
				<Input
					id={firstNameId}
					autoFocus
					value={firstName}
					onChange={(event) => setFirstName(event.target.value)}
					autoComplete="off"
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
		</QuickAddForm>
	);
}

export function QuickAddDeal({
	companyId,
	companyName,
	ownerId,
	onDone,
}: {
	companyId: string;
	companyName: string;
	/** The company's owner; falls back to whoever is signed in. */
	ownerId: string | null;
	onDone: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const [name, setName] = useState("");
	const [amount, setAmount] = useState("");
	const [closeDate, setCloseDate] = useState("");

	const nameId = useId();
	const amountId = useId();
	const closeId = useId();

	// The API refuses a deal without an owner, and asking who owns a deal on
	// the company you already own is a question with one answer.
	const me = useQuery(trpc.users.me.queryOptions());
	const owner = ownerId ?? me.data?.id ?? null;

	const create = useMutation(
		trpc.deals.create.mutationOptions({
			onSuccess: async (deal) => {
				await cache.deal(deal.id);
				toast.success(`${deal.name} created.`);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = () => {
		if (!owner) {
			toast.error("Could not work out who should own this deal.");
			return;
		}

		let amountCents: number | null = null;
		if (amount.trim() !== "") {
			const parsed = Number.parseFloat(amount);
			if (!Number.isFinite(parsed) || parsed < 0) {
				toast.error("Amount has to be a number.");
				return;
			}
			amountCents = Math.round(parsed * 100);
		}

		create.mutate({
			name,
			companyId,
			ownerId: owner,
			amountCents,
			expectedCloseDate: closeDate || null,
		});
	};

	return (
		<QuickAddForm
			submitLabel="Create deal"
			pending={create.isPending}
			ready={name.trim() !== ""}
			onCancel={onDone}
			onSubmit={submit}
		>
			<Field className="sm:col-span-2">
				<FieldLabel htmlFor={nameId}>Name</FieldLabel>
				<Input
					id={nameId}
					autoFocus
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={`${companyName} — expansion`}
					autoComplete="off"
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={amountId}>Amount</FieldLabel>
				<Input
					id={amountId}
					value={amount}
					onChange={(event) => setAmount(event.target.value)}
					placeholder="24000"
					autoComplete="off"
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={closeId}>Expected close</FieldLabel>
				<DatePicker
					id={closeId}
					value={closeDate}
					onChange={setCloseDate}
					placeholder="No date yet"
				/>
			</Field>
		</QuickAddForm>
	);
}
