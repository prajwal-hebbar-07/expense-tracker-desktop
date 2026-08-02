---
id: brand-ledgerflow
type: decision
status: active
updated: 2026-08-02
links: [accent-green, nav-breakpoints, auto-update, design-tokens]
---

# The app is LedgerFlow

Renamed 2026-08-02, from `Khata`, which was itself renamed from `Expenses` on 2026-08-01. Nothing had been published under any of the three, so the rename cost nothing but the strings below. `identifier` stayed `com.hebbar.desktop` throughout — that is what points at the database, and it must never change ([[stack]] rule 7).

The icon is two shells: a dark squircle tile, and inside it the LedgerFlow card at the brand's blue-to-green. On the card, three ascending bars and two ledger lines (the ledger) sit above a wave and two right-pointing arrows (the flow). The wordmark is **not** in the app icon: at 32×32 it is unreadable, and macOS prints the app name under the tile anyway.

## Rules for an agent working here

1. **The icon does not use `--accent`, and that is deliberate.** The tile runs `#13315f → #104a5c → #0d5f4a` and the card `#1466c6 → #25c07c`. A single flat `#0e7a57` tile — what the first version did — disappears against a dark Dock and has no depth beside stock macOS icons. The green the arrows resolve toward is still the family `--accent` belongs to, so the two read as one brand without being one hex.
2. **The card is three bands that must never touch**: ledger lines 356–446, bars and wave 384–580, arrows 520–680, in the 1024 viewBox. An arrowhead that reaches a ledger line merges with it into a single blob by 64px. The first draft did exactly that, and it is invisible at 1024 — check a 64px downscale, not the source.
3. **Edit `icons/logo.source.html`, never the PNGs.** They are generated; hand-editing one leaves the other seventeen stale, and the `.icns` is what macOS actually shows.
4. **Delete `icons/android/` and `icons/ios/` after regenerating.** `tauri icon` emits both unasked. This is a macOS desktop app; committing 30 unused mipmaps is noise in every future diff.
5. **A rename touches five strings, not one** — the Contract below. Missing `releaseName` labels the release with the old name; missing `index.html` leaves the old name in the window's accessibility tree.
6. **Re-measure the nav before renaming again.** The wordmark is a measured input to a breakpoint, not decoration — see [[nav-breakpoints]]. `LedgerFlow` leaves 50px of headroom at `md`.

## Contract

Every place the name appears:

| File | String |
|---|---|
| `apps/desktop/src-tauri/tauri.conf.json` | `productName`, and `app.windows[0].title` |
| `apps/desktop/index.html` | `<title>` |
| `apps/desktop/src/App.tsx` | the wordmark `<p>` in the nav |
| `.github/workflows/release.yml` | `releaseName` |

Regenerating the icon set, from `apps/desktop/src-tauri/icons/`:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --screenshot=icon-source.png --window-size=1024,1024 \
  --default-background-color=00000000 --hide-scrollbars logo.source.html
cd ../.. && pnpm tauri icon src-tauri/icons/icon-source.png
rm -rf src-tauri/icons/android src-tauri/icons/ios
```

⚠ Chrome is the renderer because nothing else on the machine renders SVG (`rsvg-convert`, ImageMagick and `cairosvg` are all absent). Any headless browser works; the 1024 canvas with an 824 body is the part that matters, because that padding is the macOS Dock convention.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Icon still shows the old mark after a rebuild | macOS icon cache, not the build | `killall Dock`, or check `icon.icns` really changed |
| Icon renders with a white box behind it | `--default-background-color=00000000` omitted from the Chrome call | Re-render; the PNG must have an alpha channel |
| Glyphs merge into a blob below ~96px | Two bands overlap vertically | Rule 2; `sips -z 64 64` the source and look before generating |
| The update payload is named `Khata.app.tar.gz` | `productName` not renamed with the rest | [[auto-update]] rule 6 |
| Nav labels overlap around 768 | The wordmark grew past ~50px of headroom | [[nav-breakpoints]] |
