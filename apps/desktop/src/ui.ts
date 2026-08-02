// Shared Tailwind class strings. Extracted from Settings so a second screen
// does not fork its own slightly-different input and button. Colours are the
// semantic tokens from App.css, so nothing here needs a `dark:` twin.
//
// Sizes are the design system's, not Tailwind's defaults: control height 34,
// radius 6 on controls / 10 on cards, field gap 12. They are written as
// arbitrary values (`h-[34px]`) on purpose — rounding 34 to `h-9` (36) once is
// invisible, but doing it in four places stops the four-field row aligning.

/** Page shell: one column, centred, breathing room that grows with the window.
 *
 *  Two caps, not one, and both are wider than they look like they need to be.
 *  A tiled or full-screen window is the normal state of a desktop app, not the
 *  exception: at max-w-3xl a fullscreen 27" spent 33% of its width on content
 *  and 67% on grey. The cap still exists because an unbounded transaction row
 *  puts the title and its amount 2000px apart, which is worse than a gutter.
 *
 *  `short:` trims the vertical padding under 700px of viewport — a quarter-screen
 *  tile is ~450px tall, where py-10 top and bottom is 80px of the 450 spent
 *  before the first figure. */
export const page = "mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10 short:py-4";
/** Dashboard width. Four summary tiles and a bar chart need more room than a
 *  form does; at the `page` cap the tiles truncate their own figures. */
export const pageWide = "mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10 short:py-4";
export const h1 = "text-[26px] font-semibold tracking-[-0.015em] leading-tight";
export const h2 = "text-[15px] font-semibold tracking-tight";
/** Grouping surface. Sections read as separate objects instead of one long page. */
export const card = "rounded-[10px] border border-line bg-surface p-5 shadow-card";

/** Field label: 11/500 caps, +7% tracking. */
export const label = "text-[11px] font-medium tracking-[0.07em] text-muted uppercase";

/** Rest border is --line; hover goes to --muted; focus is 1px --accent plus a
 *  3px --focus ring. The ring is a box-shadow rather than an outline so it can
 *  sit inside a scrolling menu without being clipped. */
export const focusRing =
  "outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--focus)]";

export const input =
  // No min-width here: call sites set their own, and two competing min-w
  // utilities on one element resolve by stylesheet order, not by call site.
  "h-[34px] rounded-md border border-line bg-field px-2.5 text-[13.5px] text-ink " +
  "placeholder:text-muted transition-colors hover:border-muted " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--focus)] focus:outline-none " +
  "disabled:opacity-55";

/** The same box, sized for a multi-line control — `h-[34px]` would collapse it. */
export const textarea =
  "min-h-20 rounded-md border border-line bg-field px-2.5 py-2 text-[13.5px] text-ink " +
  "placeholder:text-muted transition-colors hover:border-muted " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--focus)] focus:outline-none";

/** Error skin for a field, appended to `input`. Both the border and the fill
 *  move, because a border alone is one pixel of red on a 34px control. */
export const inputError = "border-danger! bg-danger-weak!";
/** The message under it. Sits at the field's own width, never in a page-level box. */
export const fieldError = "mt-1 text-[11.5px] text-danger";

export const button =
  "h-[34px] rounded-md bg-accent px-4 text-[13px] font-medium text-accent-ink cursor-pointer " +
  "transition-[filter,opacity] hover:brightness-[1.08] active:brightness-95 " +
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--focus)] " +
  "disabled:cursor-default disabled:opacity-[.38] disabled:hover:brightness-100";
export const cancelButton =
  "h-[34px] rounded-md border border-line bg-surface px-3.5 text-[13px] font-medium text-ink " +
  "cursor-pointer transition-colors hover:border-muted " +
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--focus)]";
export const iconButton =
  "rounded-md px-2 py-1 text-[12.5px] text-muted cursor-pointer transition-colors " +
  "hover:bg-hover hover:text-ink " +
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--focus)]";
export const dangerButton =
  // text-surface, not text-white: danger is a light red in dark mode, where
  // white on it is unreadable and the page background is the contrasting colour.
  "h-[34px] rounded-md bg-danger px-3.5 text-[13px] font-medium text-surface cursor-pointer " +
  "transition-[filter] hover:brightness-[1.08] active:brightness-95 " +
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--focus)]";

export const errorBox =
  "mt-4 rounded-md border border-danger bg-danger-weak px-3.5 py-2.5 text-[12.5px] text-danger";
export const noticeBox =
  "mt-4 rounded-md border border-credit bg-credit-weak px-3.5 py-2.5 text-[12.5px] text-credit";

/** The floating layer, shared by the select menu, the calendar and the chart
 *  tooltip. All three parts are required — see the --overlay note in App.css. */
export const overlay =
  "rounded-md border border-line bg-overlay shadow-menu menu-in";
