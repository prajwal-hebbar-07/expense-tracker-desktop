---
id: linux-release
type: decision
status: active
updated: 2026-08-02
links: [auto-update, stack]
---

# Shipping to Linux

The `release` workflow publishes Linux artifacts alongside the macOS ones, from a second job on `ubuntu-22.04`. Three files land on the release: a `.deb`, an `.AppImage`, and the `.AppImage`'s updater signature.

**Only the AppImage self-updates.** Tauri's Linux updater works by replacing the running AppImage file in place; a `.deb` install has no path back to the updater, so a user who installed the `.deb` upgrades by downloading the next one by hand. The `.deb` is kept anyway because it is what a Linux user reaches for first, and telling someone to `apt install` once a release is a smaller cost than not offering it.

**No token is involved for the person running the app.** The endpoint in [[auto-update]] is `https://github.com/prajwal-hebbar-07/expense-tracker-desktop/releases/latest/download/latest.json` on a **public** repository — an anonymous GET. Trust comes from the minisign public key compiled into the binary, not from authentication. Nothing has to be shared with anyone who installs it.

## Rules for an agent working here

1. **The `linux` job is `needs: release`, not a matrix entry, because both jobs upload `latest.json` to the same release.** Running second means `tauri-action` merges the `linux-x86_64` key into the manifest the macOS job already wrote; running in parallel is a race where one manifest silently overwrites the other and half the users stop seeing updates.
2. **The `linux` job checks out the *tag*, not the branch.** The macOS job pushes the bump commit and tag; building from `main` afterwards could pick up a commit that shipped in no artifact.
3. **Stay on `ubuntu-22.04`.** An AppImage dynamically links the glibc it was built against, so an image built on 24.04 refuses to start on anything older. Moving up narrows who can run it — a runner-image deprecation is the only reason to, and it lowers the floor for every existing user.
4. **The webview dependency is `libwebkit2gtk-4.1-dev`, not `4.0`.** 4.0 is the Tauri v1 package; installing it produces a `pkg-config` failure deep in the `wry` build with no mention of the version.
5. **Never run the tests again in the `linux` job.** They already passed on the same commit in the macOS job, before the bump. Re-running only adds a way for a release to be half-published.
6. **Both jobs need `TAURI_SIGNING_PRIVATE_KEY`.** Artifacts for different platforms must be signed by the same keypair — the public key is one value in `tauri.conf.json`, shared by every build. See [[auto-update]] rules 3 and 4.

## Contract

`.github/workflows/release.yml`, job `linux`:

```yaml
needs: release            # release exposes outputs.version from step `bump`
runs-on: ubuntu-22.04
# checkout with: ref: v${{ needs.release.outputs.version }}
# apt: libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev
# tauri-action args: --bundles deb,appimage
```

`rpm` is deliberately excluded: it cannot self-update either, and `deb` already covers the "install it properly" case.

Artifacts, in `apps/desktop/src-tauri/target/release/bundle/`:

| File | Purpose |
|---|---|
| `deb/LedgerFlow_<version>_amd64.deb` | first-time install, no updates |
| `appimage/LedgerFlow_<version>_amd64.AppImage` | first-time install **and** the update payload |
| `appimage/LedgerFlow_<version>_amd64.AppImage.sig` | its signature, read into `latest.json` |

⚠ **Verify the platform key and asset URL in `latest.json` after the first Linux release.** The expected key is `linux-x86_64`. ⚠ Tauri v2 signs the `.AppImage` directly, where v1 wrapped it in a `.AppImage.tar.gz`; if the manifest's `url` points at a `.tar.gz` that is not on the release, the check finds nothing and fails silently by design ([[auto-update]] rule 7).

The database path differs from macOS — `~/.local/share/com.hebbar.desktop/expenses.db` rather than `~/Library/Application Support/…` — because it follows the XDG base directory spec. It is still outside the bundle, so [[auto-update]]'s "updates never touch the database" holds unchanged.

## What to tell someone installing it

Download the `.AppImage`, `chmod +x` it, run it. Updates arrive by themselves from then on.

⚠ AppImage needs **FUSE 2**. Ubuntu 22.04 has it; 24.04 and later ship FUSE 3 only, and the symptom is `dlopen(): error loading libfuse.so.2` with no other output — `sudo apt install libfuse2t64` fixes it.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `latest.json` has only `darwin-aarch64` after a release | The `linux` job failed, or overwrote/was overwritten by the macOS one | Check the job log; confirm `needs: release` still serialises them (rule 1) |
| Build fails in `wry` on a `pkg-config` error | `libwebkit2gtk-4.1-dev` missing, or `4.0` installed instead | Rule 4 |
| AppImage exits with `libfuse.so.2` not found | Host ships FUSE 3 only | `sudo apt install libfuse2t64` |
| AppImage will not start on an older distro | Built against a newer glibc | Rule 3 — the runner image moved |
| Update banner never appears on Linux, works on macOS | Platform key or asset name mismatch in `latest.json` | Read the manifest on the release; expected key `linux-x86_64` |
| Update downloads then fails to replace the app | The AppImage sits somewhere the user cannot write | Move it under `~/Applications` and re-run |
