---
id: floating-layer
type: decision
status: active
updated: 2026-08-01
links: [custom-select, date-picker, design-tokens, chart-outlier]
---

# The floating layer: `--overlay`, flip and clamp

Every popup in the app — the select menu, the calendar panel, the chart tooltip — is the same surface, positioned by the same rules in `apps/desktop/src/Popover.tsx`. One module, because flip-and-clamp has an off-by-one in it and one copy is one place to get it right.

## Rules for an agent working here

1. **Use all three parts of the recipe: `--overlay` fill, 1px `--line` border, and `--shadow-menu`.** Border alone fails in dark (a menu over a card is two adjacent 1px lines); shadow alone fails in light (`--surface` on `--bg` is a 1.5% step, invisible). The `overlay` string in `ui.ts` bundles them — use it rather than reassembling.
2. **Position with `position: fixed` through a portal to `document.body`, never `absolute`.** An absolutely positioned menu is clipped by the first `overflow` ancestor, and the Transactions list — which hosts an inline row editor with two selects in it — is one.
3. **Flip only when `below < height + 8` *and* `above > below`.** The second clause is the off-by-one: without it a short menu near the bottom of a tall window flips into an even tighter space and jumps under the cursor for no reason.
4. **Clamp horizontally with `min(max(8, left), innerWidth - width - 8)`.** There is deliberately no separate right-aligned branch: for a menu wider than its trigger, that clamp *is* right-alignment.
5. **Reposition on `scroll` with capture `true`,** not just on document scroll — an ancestor scroll container moves the trigger without firing a document scroll event.
6. **Dismiss on `pointerdown`, not `click`.** A click fires after the press has already moved focus, which lets a second trigger open while the first menu is still shown.
7. **Render hidden until measured** (`visibility: hidden` for the one frame before placement), so a menu is never seen at 0,0.
8. **Scroll-lock with `overscroll-contain`,** the native property — not a wheel listener and not a body-scroll lock.

## Contract

`apps/desktop/src/Popover.tsx` exports:

| Export | Purpose |
|---|---|
| `default Popover` | The positioned overlay. Props: `anchor`, `open`, `menuRef`, plus any div attrs. |
| `useDismiss(anchor, menu, open, close)` | Escape and outside-press dismissal. |
| `useTypeahead(onMatch)` | Single printable characters into an 800ms buffer. Returns `true` if it consumed the key. |
| `insetRing` | `shadow-[0_0_0_2px_var(--focus)_inset]` — the in-menu focus ring. |

Constants: `GAP` 4 (trigger→menu, both directions), `EDGE` 8 (window inset), `MIN_WIDTH` 176, `MAX_WIDTH` 320.

Width is one rule, not two: `minWidth: max(triggerWidth, 176)`, `maxWidth: 320`. A simple menu's content is narrower than its trigger so it lands on `minWidth`; a grouped one grows to its content until it hits the cap. That reproduces both widths the design specifies without a variant flag.

Tokens, from `App.css`:

| Variable | Light | Dark |
|---|---|---|
| `--overlay` | `#ffffff` | `#1e2226` (+7% over `--surface`) |
| `--menu-shadow` | `0 12px 28px rgba(16,20,26,.14)` | `0 12px 28px rgba(0,0,0,.55)` |

Contrast on `--overlay`: ink 18.3:1 light / 13.4:1 dark; muted 5.9 / 6.3.

Motion: `.menu-in` is opacity 0→1 plus `translateY(-4px)`→0 over 120ms ease-out. **Close is instant** — a fading menu that no longer takes clicks reads as lag. `prefers-reduced-motion: reduce` drops the animation entirely.

## Anti-patterns

- **A raw `--overlay` background with no border and no shadow.** Rule 1; it disappears on one theme.
- **`absolute` inside a `relative` wrapper.** Rule 2. Works on Overview, silently clipped in the Transactions row editor.
- **Naming a Tailwind theme key the same as its raw token.** `--shadow-menu: var(--shadow-menu)` in `@theme inline` is a cycle; Tailwind drops the utility with no error and `.shadow-menu` never gets generated. The raw token is `--menu-shadow` for exactly this reason.
- **An exit animation on close.**

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Menu is cut off inside a transaction row | `position: absolute`, or the portal removed | Rule 2 |
| Menu flashes at the top-left before appearing | The `visibility: hidden` pre-measure pass was removed | Rule 7 |
| Menu drifts away from its trigger when the page scrolls | `scroll` listener registered without `capture: true` | Rule 5 |
| Wheeling past the end of a long menu scrolls the page behind it | `overscroll-contain` dropped from the scroll container | Rule 8 |
| A shadow utility silently has no effect | Theme key and raw token share a name | See anti-patterns |
