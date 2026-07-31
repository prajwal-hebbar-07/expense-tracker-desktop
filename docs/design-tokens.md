---
id: design-tokens
type: decision
status: active
updated: 2026-07-31
links: [stack, webview-dialogs]
---

# Design tokens and the responsive shell

Colour is defined once in `apps/desktop/src/App.css` as plain CSS variables, re-declared under `@media (prefers-color-scheme: dark)`, and exposed to Tailwind through `@theme inline`. Elements therefore use `bg-surface` / `text-muted` / `border-line` with **no `dark:` twin** — the media query re-themes classes that were already generated. Shared class strings live in `src/ui.ts`; the app shell in `src/App.tsx` is a single `<nav>` that is a top bar below `lg` and a side rail at or above it.

## Rules for an agent working here

1. **Never write a literal colour (`#0f0f0f`, `bg-red-600`, `text-green-400`) in a component.** Use a token. A literal is invisible to the dark-mode media query and will be unreadable in one of the two themes.
2. **Add a colour by adding a variable in both blocks of `App.css` plus one line in `@theme inline`** — never by adding a `dark:` class at the call site, because that reintroduces the two-places-per-colour problem this replaced.
3. **`@theme inline`, not `@theme`.** Plain `@theme` bakes the value in at build time, so the dark media query would have nothing left to override.
4. **Keep `color-scheme: light dark` on `:root`.** It is what makes the native `<input type="date">` picker, `<select>` popup and scrollbars follow the theme; the WebView renders them itself and no CSS of ours reaches inside.
5. **Set width utilities at the call site, not in `ui.ts`.** Two competing `min-w-*` utilities on one element resolve by stylesheet order, not by which string was concatenated last — `input` deliberately carries no width.
6. **Responsiveness is CSS-only, at the `lg` breakpoint (64rem).** Do not add a JS width listener or a second nav element; the layout must survive a half-screen window, and `minWidth: 420` in `tauri.conf.json` is the narrowest width the design is expected to hold.
7. **Icons come from `src/icons.tsx` as inline SVG — do not add an icon package.** Each glyph is a standard 24×24 stroke path on `currentColor`, so colour is a text utility (`text-accent`, `text-violet`) and size is `size-*`. Paste new Lucide/Feather paths in rather than installing the library.
8. **On a light-red-in-dark-mode surface use `text-surface`, not `text-white`** (`dangerButton`), because `--danger` inverts between themes and white-on-pink is unreadable.

## Contract

`apps/desktop/src/App.css` — tokens, light value / dark value:

| Variable | Utility | Light | Dark |
|---|---|---|---|
| `--bg` | `bg-bg` | `#f6f8fb` | `#131a24` |
| `--rail` | `bg-rail` | `#eef2f7` | `#0f151d` |
| `--surface` | `bg-surface` | `#ffffff` | `#182029` |
| `--ink` | `text-ink` | `#0f172a` | `#e8edf3` |
| `--muted` | `text-muted` | `#64748b` | `#8b97a8` |
| `--line` | `border-line`, `divide-line` | `#e2e8f0` | `#263141` |
| `--accent` | `bg-accent`, `text-accent` | `#2563eb` | `#3b82f6` |
| `--accent-ink` | `text-accent-ink` | `#ffffff` | `#ffffff` |
| `--credit` | `text-credit` | `#15803d` | `#4ade80` |
| `--violet` | `text-violet` | `#7c3aed` | `#a78bfa` |
| `--danger` | `bg-danger`, `text-danger` | `#b3261e` | `#f0867d` |

`--rail` is the nav's background; it is deliberately a shade *away* from `--bg` (darker in dark mode, lighter in light) so the rail reads as chrome rather than as page.

`apps/desktop/src/icons.tsx` exports: `Wallet`, `Home`, `List`, `Sliders`, `Bank`, `Card`, `ArrowsUpDown`, `Calendar`, `Info`, `ChevronDown`.

`apps/desktop/src/ui.ts` exports: `page`, `h1`, `h2`, `card`, `input`, `button`, `cancelButton`, `iconButton`, `dangerButton`, `errorBox`, `noticeBox`.

Window bounds (`apps/desktop/src-tauri/tauri.conf.json`): `width` 1024, `height` 720, `minWidth` 420, `minHeight` 480.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| A colour ignores dark mode | `@theme` used instead of `@theme inline`, or a literal hex at the call site | Move the value into the `:root` blocks and reference the token utility |
| Date picker or select popup is a light box in dark mode | `color-scheme` removed from `:root` | Restore `color-scheme: light dark` |
| Sidebar overlaps content, or tabs vanish | The `lg:grid-cols-[13rem_1fr]` and `lg:flex-col` pair on `App.tsx` were changed apart | They are one layout; change both or neither |
| A field ignores its width class | `ui.ts` regained a `min-w-*`/`w-*` in the shared `input` string | Remove it; widths belong at the call site |
