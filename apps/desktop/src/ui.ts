// Shared Tailwind class strings. Extracted from Settings so a second screen
// does not fork its own slightly-different input and button. Colours are the
// semantic tokens from App.css, so nothing here needs a `dark:` twin.

/** Page shell: one column, centred, breathing room that grows with the window. */
export const page = "mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12";
/** Dashboard width. Four summary tiles and a bar chart need more room than a
 *  form does; at max-w-3xl the tiles truncate their own figures. */
export const pageWide = "mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12";
export const h1 = "text-2xl font-semibold tracking-tight sm:text-3xl";
export const h2 = "text-base font-semibold tracking-tight";
/** Grouping surface. Sections read as separate objects instead of one long page. */
export const card = "rounded-2xl border border-line bg-surface p-5 sm:p-6";

export const input =
  // No min-width here: call sites set their own, and two competing min-w
  // utilities on one element resolve by stylesheet order, not by call site.
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted outline-none transition-colors " +
  "focus:border-accent focus:ring-2 focus:ring-accent/20";
export const button =
  "rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink cursor-pointer " +
  "transition-opacity hover:opacity-90 active:opacity-75 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const cancelButton =
  "rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink " +
  "cursor-pointer transition-colors hover:border-accent " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const iconButton =
  "rounded-lg px-2 py-1 text-sm text-muted cursor-pointer transition-colors " +
  "hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
export const dangerButton =
  // text-surface, not text-white: danger is a light red in dark mode, where
  // white on it is unreadable and the page background is the contrasting colour.
  "rounded-xl bg-danger px-4 py-2 text-sm font-medium text-surface cursor-pointer " +
  "transition-opacity hover:opacity-90 active:opacity-75 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger";

export const errorBox =
  "mt-4 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger";
export const noticeBox =
  "mt-4 rounded-xl border border-credit/25 bg-credit/10 px-4 py-3 text-sm text-credit";
