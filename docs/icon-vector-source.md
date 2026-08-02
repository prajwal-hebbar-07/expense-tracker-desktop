---
id: icon-vector-source
type: decision
status: superseded
superseded-by: brand-assets
updated: 2026-08-02
links: [brand-assets, brand-ledgerflow]
---

# The icon was hand-written SVG, screenshotted by Chrome

Active 2026-08-02, superseded the same day by [[brand-assets]]. `apps/desktop/src-tauri/icons/logo.source.html` held a 1024-viewBox SVG of the mark — a dark squircle tile, the blue-to-green card, three ascending bars and two ledger lines above a wave and two arrows. Headless Chrome screenshotted it to a transparent 1024 PNG, and `tauri icon` fanned that out to the set. Chrome was the renderer because no SVG rasteriser exists on the machine.

Why it went: finished raster renders of the same mark arrived, and keeping a vector source that no longer matched the shipped `.icns` is a trap — rule 3 of the old node told the next agent to edit the SVG, which would have silently regenerated a *different* icon.

What was worth keeping, and moved to [[brand-assets]]:

1. **The 1024 canvas with the mark at ≈824.** That padding is the macOS Dock convention; a mark filling the full canvas is clipped by the Dock's own padding.
2. **The three-band rule.** In the SVG the card's contents had to stay separated — ledger lines 356–446, bars and wave 384–580, arrows 520–680 in the 1024 viewBox — because an arrowhead touching a ledger line merges into one blob by 64px. The first draft did exactly that, and it is invisible at 1024. The raster masters inherit the constraint as "check a 64px downscale", not as coordinates.
3. **The colours are not `--accent`.** Tile `#13315f → #104a5c → #0d5f4a`, card `#1466c6 → #25c07c`. A single flat `#0e7a57` tile — the first version — disappears against a dark Dock and has no depth beside stock macOS icons.

Recover the SVG from git history if a vector version is ever wanted again: `git log --diff-filter=D -- apps/desktop/src-tauri/icons/logo.source.html`.
