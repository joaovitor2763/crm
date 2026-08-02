import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";
import { EmailSignIn } from "./email-sign-in";

export const metadata: Metadata = {
	title: "Sign in",
};

export default async function SignInPage() {
	// The authoritative counterpart to the cookie sniff in `proxy.ts`, and the
	// reason that check is not in the proxy: only a session that verifies
	// against Postgres sends you back into the app. A cookie that no longer
	// resolves falls through to the form instead of ping-ponging with `/`.
	//
	// A database that cannot answer must not take this page down with it — it is
	// the one page that has to work when everything else is broken, so a failed
	// lookup counts as signed out.
	const session = await getSession().catch((error: unknown) => {
		console.error("Sign-in: could not read the session.", error);
		return null;
	});

	if (session) {
		redirect("/");
	}

	return (
		<AuthShell>
			<AuthHeading
				title="Welcome back"
				description="Sign in with your CRM credentials to continue."
			/>

			<EmailSignIn />

			<p className="text-center text-muted-foreground text-sm/5">
				Comp AI CRM is private. Only allow-listed accounts can sign in.
			</p>
		</AuthShell>
	);
}
