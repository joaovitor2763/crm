import { Spinner } from "@crm/ui/components/spinner";

/**
 * Shown by the App Router the instant a section navigation starts, while the
 * server component renders. Without this file a click sits on the old screen
 * until the new page's data round trips — which reads as the app hanging.
 */
export default function Loading() {
	return (
		<div className="flex flex-1 items-center justify-center py-24">
			<Spinner />
		</div>
	);
}
