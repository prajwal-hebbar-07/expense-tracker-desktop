---
id: brand-ledgerflow
type: decision
status: active
updated: 2026-08-02
links: [accent-green, nav-breakpoints, auto-update, design-tokens, brand-assets]
---

# The app is LedgerFlow

Renamed 2026-08-02, from `Khata`, which was itself renamed from `Expenses` on 2026-08-01. Nothing had been published under any of the three, so the rename cost nothing but the strings below. `identifier` stayed `com.hebbar.desktop` throughout — that is what points at the database, and it must never change ([[stack]] rule 7).

The icon is two shells: a dark squircle tile, and inside it the LedgerFlow card at the brand's blue-to-green. On the card, three ascending bars and two ledger lines (the ledger) sit above a wave and two right-pointing arrows (the flow). The wordmark is **not** in the app icon: at 32×32 it is unreadable, and macOS prints the app name under the tile anyway. There is a separate horizontal lockup that does carry the wordmark — where both files live and how the icon set is regenerated is [[brand-assets]].

## Rules for an agent working here

1. **The icon does not use `--accent`, and that is deliberate.** The tile runs `#13315f → #104a5c → #0d5f4a` and the card `#1466c6 → #25c07c`. A single flat `#0e7a57` tile — what the first version did — disappears against a dark Dock and has no depth beside stock macOS icons. The green the arrows resolve toward is still the family `--accent` belongs to, so the two read as one brand without being one hex.
2. **A rename touches five strings, not one** — the Contract below. Missing `releaseName` labels the release with the old name; missing `index.html` leaves the old name in the window's accessibility tree.
3. **Re-measure the nav before renaming again.** The wordmark is a measured input to a breakpoint, not decoration — see [[nav-breakpoints]]. `LedgerFlow` leaves 50px of headroom at `md`.

## Contract

Every place the name appears:

| File | String |
|---|---|
| `apps/desktop/src-tauri/tauri.conf.json` | `productName`, and `app.windows[0].title` |
| `apps/desktop/index.html` | `<title>` |
| `apps/desktop/src/App.tsx` | the wordmark `<p>` in the nav |
| `.github/workflows/release.yml` | `releaseName` |

Regenerating the icon set: [[brand-assets]].

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| The update payload is named `Khata.app.tar.gz` | `productName` not renamed with the rest | [[auto-update]] rule 6 |
| Nav labels overlap around 768 | The wordmark grew past ~50px of headroom | [[nav-breakpoints]] |
