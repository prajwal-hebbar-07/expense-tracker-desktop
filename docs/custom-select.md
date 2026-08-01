---
id: custom-select
type: decision
status: active
updated: 2026-08-01
links: [floating-layer, date-picker, native-controls, design-tokens, self-transfer]
---

# The select

`apps/desktop/src/Select.tsx` replaces `<select>`. It supersedes [[native-controls]], which records why the platform control was used first and what forced the change.

The trigger is the input states verbatim — a select and a text field in the same row are indistinguishable until you open one. That is the point: the four-field row on the add form has to align.

## Rules for an agent working here

1. **Keep the `items` prop flat.** A heading is `{ group: string }` in the same array as the options. Flat is what makes "skip headings" a `filter` and what keeps one integer index valid for `aria-activedescendant`; the nesting ARIA needs is rebuilt at render by `sections()`.
2. **DOM focus stays on the trigger the whole time the menu is open.** The highlight is announced through `aria-activedescendant`, never by focusing an option. Moving focus into the menu breaks the combobox pattern and strands screen readers.
3. **Nothing is written until `commit`.** That is what makes "Escape reverts" and "click-outside reverts" true by construction rather than by a saved-and-restored copy.
4. **Hover and the keyboard highlight are different marks.** Hover is `--hover` via CSS only and does **not** move `active`; the keyboard highlight is `--accent-weak` plus a 2px inset `--focus` ring. A pointer already tells you where it is, so it gets the quieter mark and never steals the keyboard's position.
5. **The selected marker is a 16px `--accent` tick on the right, and nothing else.** No fill, no left rail. Selection and highlight are separate axes, so a row that is both stays legible.
6. **`error` distinguishes `undefined` from `""`.** `undefined` is valid; `""` flags the control without captioning it. Test with `error !== undefined`, never truthiness — see the two-different-accounts rule in [[self-transfer]].
7. **A rule sits between groups only, never above the first.**

## Contract

```ts
type Item = { group: string } | { value: string; label: string; hint?: string };

<Select
  items={Item[]} value={string} onChange={(v: string) => void}
  placeholder?  label?  error?  disabled?  className?  id?
/>
```

`hint` renders in `font-mono` `--muted` after the label — the `••••0421` on a card.

Sizes: trigger `h-[34px]`, radius 6, padding `0 8 0 10`. Menu padding 4, option height 32, gap 2, radius 6, `max-h-[280px]` (8.2 rows, so it cuts mid-row and the overflow is visible). Positioning, widths and the overlay recipe are [[floating-layer]]'s.

Keyboard:

| Key | Closed | Open |
|---|---|---|
| `Enter` / `Space` / `↓` / `↑` | Open, highlight on the chosen option (first if none) | Commit, close, refocus trigger |
| `↓` / `↑` | — | Move one option, skipping headings, wrapping at both ends |
| `Home` / `End` | — | First / last option |
| printable char | — | Jump to the next option starting with the buffer (clears after 800ms) |
| `Escape` | — | Close, revert, refocus trigger |
| `Tab` | — | Commit and move on — the one exit that does not `preventDefault` |

ARIA: trigger `role=combobox` + `aria-haspopup=listbox` + `aria-expanded` + `aria-controls`; menu `role=listbox`; groups `role=group` with `aria-labelledby` on the heading; options `role=option` + `aria-selected`.

## Anti-patterns

- **Focusing an option on arrow keys.** Rule 2.
- **`onPointerEnter={() => setActive(at)}`.** Rule 4 — it makes hover and keyboard fight over one highlight, and the menu jumps when the mouse rests anywhere near it.
- **A nested `items` prop (`{group, options: []}[]`).** Rule 1; the index arithmetic for typeahead and wrapping then has to walk two levels and gets it wrong at the boundaries.
- **`error ? … : …`.** Rule 6; `""` is falsy and the flag-without-caption case silently stops rendering.
- **Adding a headless-UI or Radix dependency for this.** The keyboard contract above is the whole cost, and it is written once.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Arrow keys land on a heading | `isOption` filter dropped from `step()` | Rule 1 |
| Screen reader announces nothing as you arrow | `aria-activedescendant` not updated, or focus moved into the menu | Rule 2 |
| Escape leaves the value changed | Something wrote to `onChange` before `commit` | Rule 3 |
| Menu jumps when the mouse passes over it | Hover wired to `setActive` | Rule 4 |
| A field is red with no message and no reason | `error=""` passed where a message was meant | Rule 6 |
