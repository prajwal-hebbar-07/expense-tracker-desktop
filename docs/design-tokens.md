---
id: design-tokens
type: decision
status: active
updated: 2026-08-01
links: [stack, floating-layer, nav-breakpoints, custom-select, summary-tile-delta]
---

# Design tokens

Colour is defined once in `apps/desktop/src/App.css` as plain CSS variables, re-declared under `@media (prefers-color-scheme: dark)`, and exposed to Tailwind through `@theme inline`. Elements therefore use `bg-surface` / `text-muted` / `border-line` with **no `dark:` twin** — the media query re-themes classes that were already generated. Shared class strings live in `src/ui.ts`.

Every surface sits inside a narrow 4–10% lightness band of the same cool grey, so nothing glares after an hour. The only saturated pixels in the app are the accent button, the active nav, and a signed amount. Blue reads as "the app", green as money in, violet as borrowed money — three hues that stay distinct for the common red–green deficiencies because they also differ in sign and position.

Layout lives in [[nav-breakpoints]]; the popup surface in [[floating-layer]].

## Rules for an agent working here

1. **Never write a literal colour (`#0f0f0f`, `bg-red-600`, `text-green-400`) in a component.** Use a token. A literal is invisible to the dark-mode media query and will be unreadable in one of the two themes.
2. **Add a colour by adding a variable in both blocks of `App.css` plus one line in `@theme inline`** — never by adding a `dark:` class at the call site, because that reintroduces the two-places-per-colour problem this replaced.
3. **`@theme inline`, not `@theme`.** Plain `@theme` bakes the value in at build time, so the dark media query would have nothing left to override.
4. **A `@theme` key may never share a name with the raw token it points at.** `--shadow-menu: var(--shadow-menu)` is a cycle; Tailwind drops the utility with **no error** and the class is silently never generated. The raw token is `--menu-shadow` for exactly this reason.
5. **Keep `color-scheme: light dark` on `:root`.** It still governs scrollbars, which the WebView renders itself. (It used to matter for the native date picker and select popup; those are ours now — see [[native-controls]].)
6. **Set width utilities at the call site, not in `ui.ts`.** Two competing `min-w-*` utilities on one element resolve by stylesheet order, not by which string was concatenated last — `input` deliberately carries no width.
7. **Control sizes are written as arbitrary values (`h-[34px]`), on purpose.** Rounding 34 to `h-9` once is invisible; doing it in four places stops the four-field form row aligning.
8. **Icons come from `src/icons.tsx` as inline SVG — do not add an icon package.** Each glyph is a 24×24 stroke path at width 1.7 on `currentColor`, so colour is a text utility and size is `size-*`. Paste new Lucide/Feather paths in rather than installing the library.
9. **On a light-red-in-dark-mode surface use `text-surface`, not `text-white`** (`dangerButton`), because `--danger` inverts between themes and white-on-pink is unreadable.
10. **Never interpolate a token stem into a class name.** Tailwind scans source text; `bg-${tint}-weak` generates nothing and fails silently. See [[summary-tile-delta]] rule 7.

## Contract

`apps/desktop/src/App.css` — light value / dark value:

| Variable | Utility | Light | Dark | Use |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#f4f5f7` | `#0f1113` | Page background |
| `--rail` | `bg-rail` | `#e9ebef` | `#0a0b0d` | Side rail / top bar |
| `--surface` | `bg-surface` | `#fcfcfd` | `#16191c` | Cards, tiles, rows |
| `--field` | `bg-field` | `#fdfdfe` | `#101315` | Input and trigger fill |
| `--overlay` | `bg-overlay` | `#ffffff` | `#1e2226` | Menus, calendar, tooltip |
| `--ink` | `text-ink` | `#14181c` | `#e8ebed` | Primary text, debit amounts |
| `--muted` | `text-muted` | `#5c666f` | `#9aa3ab` | Labels, account names, placeholders |
| `--line` | `border-line` | `#dfe3e8` | `#24282c` | Borders, dividers, input rest border |
| `--accent` | `bg-accent`, `text-accent` | `#2e5fd0` | `#7aa2f7` | Primary button, active nav, links, focus |
| `--accent-ink` | `text-accent-ink` | `#f7f9ff` | `#0b1020` | Text/icons on `--accent` |
| `--credit` | `text-credit` | `#14795a` | `#4fb286` | Money in, positive net |
| `--violet` | `text-violet` | `#6a4bc4` | `#9b8af2` | Card outstanding, card rows |
| `--danger` | `text-danger` | `#c0324a` | `#e5677a` | Delete, confirm, input error — never ordinary debits |
| `--series-b` | `text-series-b` | `#b45309` | `#d97706` | Second chart series only |

`--rail` is deliberately a shade *away* from `--bg` (lighter in light, darker in dark) so the rail reads as chrome rather than as page.

Weak twins (`--accent-weak`, `--credit-weak`, `--danger-weak`, `--violet-weak`, `--series-b-weak`, utilities `bg-*-weak`) are **alpha, not mixed hex**, so they sit correctly on `--surface` and on `--overlay` both. Plus `--hover`, `--focus`, `--shadow` (`shadow-card`), `--menu-shadow` (`shadow-menu`).

Contrast — dark: ink on bg 15.8:1 · muted on surface 6.9:1 · accent-ink on accent 7.5:1. Light: 16.5 · 5.7 · 5.5.

**Shape**: radius 6 on inputs and buttons, 10 on cards, 14 on the window. Control height 34, card padding 20, field gap 12, spacing on a 4px base.

**Type**: page title 26/600/−1.5% · card title 15/600 · body 13.5/400 · label 11/500/+7% caps · numeric 15/500 tabular · tile figure 22/600 tabular.

**States**: rest 1px `--line` · hover border `--muted` · focus 1px `--accent` + 3px `--focus` ring · disabled opacity .55 (buttons .38) · error `--danger` border + `--danger-weak` fill + 11.5px `--danger` message.

`src/ui.ts` exports: `page`, `pageWide`, `h1`, `h2`, `card`, `label`, `focusRing`, `input`, `textarea`, `inputError`, `fieldError`, `button`, `cancelButton`, `iconButton`, `dangerButton`, `errorBox`, `noticeBox`, `overlay`.

Window bounds (`src-tauri/tauri.conf.json`): `width` 1024, `height` 720, `minWidth` 420, `minHeight` 480.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A colour ignores dark mode | `@theme` instead of `@theme inline`, or a literal hex at the call site | Move the value into the `:root` blocks and use the token utility |
| A utility class has no effect and no error | Theme key shares a name with its raw token, or the class was interpolated | Rules 4 and 10 |
| Scrollbars are a light box in dark mode | `color-scheme` removed from `:root` | Rule 5 |
| A field ignores its width class | `ui.ts` regained a `min-w-*`/`w-*` in the shared `input` string | Remove it; widths belong at the call site |
| The four-field form row stops aligning | A `h-[34px]` rounded to `h-9` somewhere | Rule 7 |
