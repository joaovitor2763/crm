import { AppHeader } from "@/components/app-header";
import { AppIconRail } from "@/components/app-icon-rail";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { MobileNavProvider } from "@/components/mobile-nav";
import { requireSession } from "@/lib/session";

export default async function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	// Direct credentials are sufficient for the CRM itself. Google access is an
	// optional integration and can be connected later for mailbox/calendar sync.
	const { user } = await requireSession();

	return (
		<MobileNavProvider>
			<div className="isolate flex h-svh flex-col">
				<AppHeader
					user={{
						name: user.name,
						email: user.email,
						image: user.image ?? null,
					}}
				/>
				{/*
				 * No scroll container here: <PageShell> renders the scrolling
				 * <main>, so the page can own its own transition snapshot while
				 * the header and rail stay put.
				 */}
				<div className="flex min-h-0 flex-1">
					<AppIconRail />
					{children}
				</div>

				{/*
				 * Records open over whatever list you were on rather than as pages of
				 * their own, so the sheet lives in the shell — one instance, driven
				 * by `?record=`, reachable from every row, card and search hit.
				 */}
				<RecordSheetHost />

				{/* ⌘K from anywhere inside the app shell. */}
				<QuickSwitcher />
			</div>
		</MobileNavProvider>
	);
}
