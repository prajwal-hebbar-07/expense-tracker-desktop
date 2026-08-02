---
id: brand-assets
type: decision
status: active
updated: 2026-08-02
links: [brand-ledgerflow, icon-vector-source, repo-layout]
---

# The brand masters are two PNGs in `assets/`

Adopted 2026-08-02. The icon and the wordmark lockup are now supplied as finished raster renders and committed as-is; they replace the hand-written SVG in `icons/logo.source.html` ([[icon-vector-source]], superseded). The mark is unchanged in composition — dark squircle tile, blue-to-green card, bars and ledger lines over a wave and two arrows — so nothing in [[brand-ledgerflow]] about what the icon *depicts* moved.

Two masters, two jobs: `assets/icon.png` is square and is the only input to the Tauri icon set; `assets/logo.png` is a horizontal lockup (mark + wordmark) and is not an app icon at any size.

## Rules for an agent working here

1. **Replace `assets/icon.png`, then regenerate — never hand-edit a file under `src-tauri/icons/`.** All eighteen are generated from it, and `icon.icns` is what macOS actually shows. Editing one leaves the other seventeen stale.
2. **A new icon master must be square with a transparent background before it reaches `tauri icon`.** The tool letterboxes a non-square input and bakes any background colour into the `.icns`, which shows up as a white box behind the Dock tile.
3. **Do not put `assets/logo.png` anywhere dark.** The wordmark is near-black navy on transparent — it disappears on a dark background. It is a light-surface asset: the README, a light landing page. The nav wordmark stays live text ([[nav-breakpoints]] measures it), not this image.
4. **The favicon is `apps/desktop/public/icon.png` at 256px**, referenced from `apps/desktop/index.html`. Vite only serves `<link href>` targets out of `public/`, so a path anywhere else silently 404s in dev and ships a blank tab icon.
5. **Delete `icons/android/` and `icons/ios/` after every regeneration.** `tauri icon` emits both unasked; this is a desktop app, and 30 unused mipmaps are noise in every future diff.
6. **⚠ Re-check a 64px downscale after any new master.** The render is raster, not vector, so a source that reads well at 1024 can turn to mush at Dock size — a failure vector the SVG source did not have. `sips -z 64 64` a copy and look at it.

## Contract

| Path | What it is |
|---|---|
| `assets/icon.png` | 1024×1024 square master, transparent. The only regeneration input. |
| `assets/logo.png` | 958×202 lockup master, transparent. README header. |
| `apps/desktop/src-tauri/icons/icon-source.png` | Copy of `assets/icon.png` kept beside the generated set, so the regen command runs from one directory. |
| `apps/desktop/src-tauri/icons/*` | Generated. 18 files, listed in `tauri.conf.json` under `bundle.icon`. |
| `apps/desktop/public/icon.png` | 256×256 favicon, referenced by `apps/desktop/index.html`. |

Regenerating the icon set, from the repo root:

```bash
cp assets/icon.png apps/desktop/src-tauri/icons/icon-source.png
cd apps/desktop && pnpm tauri icon src-tauri/icons/icon-source.png
rm -rf src-tauri/icons/android src-tauri/icons/ios
```

Producing a square transparent master from a wider render, using headless Chrome (nothing else on the machine does image compositing — `rsvg-convert`, ImageMagick, `cairosvg` and PIL are all absent):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --allow-file-access-from-files --screenshot=icon.png --window-size=1024,1024 \
  --default-background-color=00000000 --hide-scrollbars crop.html
```

where `crop.html` is a 1024×1024 `overflow:hidden` div holding the render positioned and scaled so the tile fills it with the macOS Dock's padding (mark ≈824 of 1024).

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Icon still shows the old mark after a rebuild | macOS icon cache, not the build | `killall Dock`, or check `icon.icns` really changed |
| White or black box behind the Dock tile | Master had no alpha, or `--default-background-color=00000000` was omitted | Re-render; confirm alpha before running `tauri icon` |
| Icon looks blurry or muddy at Dock size | Raster master downscaled past its detail | Rule 6; a higher-resolution master, not a sharpen |
| Wordmark invisible in the UI | `assets/logo.png` placed on a dark surface | Rule 3 |
| Blank favicon in `pnpm dev` | Favicon moved out of `apps/desktop/public/` | Rule 4 |
| 30 android/ios files in the diff | `tauri icon` ran without the cleanup | Rule 5 |
