// NOTE: every class below must be written out as a literal string. Tailwind's
// scanner only generates CSS for class names it finds verbatim in source — it
// cannot see dynamically built/interpolated ones, so no template helpers here.

const BAR = [
	"[&>td:first-child]:relative",
	"[&>td:first-child]:before:pointer-events-none [&>td:first-child]:before:absolute",
	"[&>td:first-child]:before:inset-y-0 [&>td:first-child]:before:left-0 [&>td:first-child]:before:w-0.5",
	"[&>td:first-child]:before:bg-foreground [&>td:first-child]:before:opacity-0",
	"[&:hover>td:first-child]:before:opacity-100",
	"[&:focus-visible>td:first-child]:before:opacity-100",
].join(" ");

// Content-first rows: slide the first cell's text right on hover.
export const ROW_ACCENT = [
	"cursor-pointer",
	"outline-none",
	BAR,
	"[&>td:first-child]:transition-[padding] [&>td:first-child]:duration-200 [&>td:first-child]:ease-out",
	"[&:hover>td:first-child]:pl-5",
	"[&:focus-visible>td:first-child]:pl-5",
].join(" ");

// Rows with a leading icon/expand column (a chevron isn't "the text"): keep the
// bar on the first cell but slide the second cell — the first real content.
export const ROW_ACCENT_EXPANDABLE = [
	"cursor-pointer",
	"outline-none",
	BAR,
	"[&>td:nth-child(2)]:transition-[padding] [&>td:nth-child(2)]:duration-200 [&>td:nth-child(2)]:ease-out",
	"[&:hover>td:nth-child(2)]:pl-5",
	"[&:focus-visible>td:nth-child(2)]:pl-5",
].join(" ");
