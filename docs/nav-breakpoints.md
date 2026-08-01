---
id: nav-breakpoints
type: decision
status: active
updated: 2026-08-01
links: [design-tokens, filter-row]
---

# Navigation at five items

One `<nav>` in `apps/desktop/src/App.tsx`, four shapes, all CSS. Five destinations is where a top bar runs out of room, so the breakpoints are measured rather than chosen.

At 13.5px the labels are: Overview 112 · Transactions 134 · Analytics 108 · Report 92 · Settings 100, plus four 4px gaps = **562px**. The wordmark plus its 16px gap adds **94**. A 620px window has 588 of usable bar, so labelled items fit only once the wordmark leaves.

The wordmark is what gives, and it costs nothing: this is a single-window app, the OS title bar already says Khata, and the `<h1>` under the bar names the screen.

## Rules for an agent working here

1. **Four widths, in this order** — and they are one layout, so change them together or not at all:

   | Width | Shape |
   |---|---|
   | ≥1024 (`lg`) | Side rail, 13.5rem |
   | 768–1023 (`md`) | Top bar, wordmark + 5 labels |
   | 588–767 (`nav`) | Top bar, no wordmark, 5 labels |
   | <588 | Icon-only, 5 × 44×44 |

2. **588px is the `nav` breakpoint, declared as `--breakpoint-nav: 36.75rem` in `App.css`.** It is a real measurement, not a round number — do not "tidy" it to 36rem or to `sm`.
3. **The old rule was "labels drop below 520". At five items that is 68px too late** and the labels overlap before they disappear. This node supersedes that.
4. **Below 588 the label is visually hidden, never removed.** `aria-label={name}` carries it, so the accessible name is identical at every width.
5. **Active treatment is one element, repositioned** — a 2px underline on the bar, a 2px left bar in the rail, plus `--accent-weak` fill and an `--accent` icon in the rail only. Do not add a second marker element for the rail.
6. **44×44 is a floor, not a style.** It is the minimum comfortable pointer target; shrinking the icon-only buttons to fit a narrower window is the wrong trade — the window has a `minWidth` of 420 and five 44s plus gaps fit inside it.

## Contract

`App.tsx`: `lg:grid lg:grid-cols-[13.5rem_1fr]` on the shell and `lg:flex-col` on the nav are a pair. The wordmark is `hidden md:block`. Each item is `size-11` (44px) below `nav`, then `nav:h-9 nav:px-2.5`. Labels are `hidden nav:inline`.

Adding a sixth destination invalidates the 562px measurement above. Re-measure before assuming the `nav` breakpoint still holds.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Labels overlap between 520 and 588 | The old 520 rule restored | Rule 3 |
| Sidebar overlaps content, or tabs vanish | `lg:grid-cols-[13.5rem_1fr]` and `lg:flex-col` changed apart | Rule 1 |
| Wordmark reappears at 620 and pushes Settings off | `hidden md:block` weakened to `sm:block` | Rule 1 |
| Screen reader reads "button" with no name below 588 | `aria-label` dropped when the span was hidden | Rule 4 |
