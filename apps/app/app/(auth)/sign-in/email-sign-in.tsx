"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

export function EmailSignIn() {
	const [pending, setPending] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);

		const form = new FormData(event.currentTarget);
		const email = String(form.get("email") ?? "");
		const password = String(form.get("password") ?? "");

		const { error } = await signIn.email({
			email,
			password,
			rememberMe: true,
		});

		if (error) {
			toast.error(error.message ?? "Email or password is incorrect.");
			setPending(false);
			return;
		}

		window.location.assign("/");
	}

	return (
		<form className="grid gap-3" onSubmit={handleSubmit}>
			<FieldGroup className="gap-3">
				<Field>
					<FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
					<Input
						id="sign-in-email"
						autoComplete="email"
						disabled={pending}
						name="email"
						placeholder="you@company.com"
						required
						type="email"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
					<Input
						id="sign-in-password"
						autoComplete="current-password"
						disabled={pending}
						minLength={12}
						name="password"
						placeholder="Your password"
						required
						type="password"
					/>
				</Field>
			</FieldGroup>
			<Button className="w-full" disabled={pending} type="submit">
				{pending && <Spinner data-icon="inline-start" />}
				Sign in
			</Button>
		</form>
	);
}
