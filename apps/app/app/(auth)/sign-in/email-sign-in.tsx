"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
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
			<Input
				autoComplete="email"
				defaultValue="joao@g4educacao.com"
				disabled={pending}
				name="email"
				placeholder="Email"
				required
				type="email"
			/>
			<Input
				autoComplete="current-password"
				disabled={pending}
				minLength={12}
				name="password"
				placeholder="Password"
				required
				type="password"
			/>
			<Button className="w-full" disabled={pending} type="submit">
				{pending && <Spinner data-icon="inline-start" />}
				Sign in
			</Button>
		</form>
	);
}
