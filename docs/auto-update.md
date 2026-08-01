---
id: auto-update
type: decision
status: active
updated: 2026-08-01
links: [stack, persistence-sqlite, derived-balances]
---

# Shipping an update

The app checks for a new version once at launch, against a signed manifest on GitHub Releases. If one exists it shows a banner offering "Install and restart"; otherwise, including when the machine is offline, it shows nothing at all.

This is **the app's only outbound call**, and it is a deliberate exception to the "no network dependency" line in [[stack]]. It is not a server ([[stack]] rule 1 still holds): nothing listens, nothing runs in the background, and the request is one GET of a static JSON file at startup. The alternative was the user manually rebuilding and copying a `.app` for every fix, which in practice means never updating.

**Updates never touch the database.** `expenses.db` lives in `~/Library/Application Support/com.hebbar.desktop/`, outside the bundle; replacing the binary cannot reach it. Pending migrations run when the new build opens the connection, exactly as they do in dev — see [[persistence-sqlite]].

## Rules for an agent working here

1. **Never break the version chain.** An installed build can only update itself if *it* already contains the updater. `0.1.0` is the first build that does, so the first update it can accept is `0.1.1`.
2. **Bump the version in both `package.json` and `src-tauri/tauri.conf.json`.** The bundler reads `tauri.conf.json`; a mismatch produces artifacts labelled one version and reporting another.
3. **Never commit the private key.** It lives at `~/.tauri/expenses-updater.key`, outside the repo, mode `600`. Losing it means no existing install can ever be updated again — the public key baked into every shipped binary will reject anything signed by a new keypair.
4. **Never change `pubkey` in `tauri.conf.json` without reissuing every install by hand.** Installed builds trust that key and nothing else.
5. **Build with `--bundles app,updater` when you only need the update artifact.** The DMG step fails if a previous volume is still mounted or `target/release/bundle/dmg/` holds output from an earlier run, and **it aborts the build before the updater tarball is regenerated** — leaving a stale `.tar.gz` from the previous version that looks current by timestamp. Check the version inside it before publishing.
6. **Renaming `productName` renames the update payload.** It is `Expenses.app.tar.gz`, not `desktop.app.tar.gz`; a hand-written manifest pointing at the old name resolves to nothing. `identifier` is what must never change — see [[stack]] rule 7 — but `productName` is only a label, and the database follows the identifier.
7. **A failed update check stays silent.** Offline is the normal state of a local-first app; a banner about an unreachable server every launch is how a user learns to ignore banners.

## Contract

Config, in `apps/desktop/src-tauri/tauri.conf.json`:

```json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "endpoints": ["https://github.com/prajwal-hebbar-07/expense-tracker-desktop/releases/latest/download/latest.json"],
    "pubkey": "<contents of ~/.tauri/expenses-updater.key.pub>"
  }
}
```

Permissions live in `apps/desktop/src-tauri/capabilities/desktop.json`: `updater:default` and `process:default` (the second is what allows `relaunch()`).

Frontend: `apps/desktop/src/update.ts` (`useUpdate()` — check on mount, download, relaunch) and `apps/desktop/src/UpdateBanner.tsx`, rendered above the shell in `App.tsx` so it spans both columns.

### Cutting a release — automated

Push a tag; CI does the rest.

```bash
# bump the version in apps/desktop/package.json AND src-tauri/tauri.conf.json
git commit -am "chore: 0.1.1" && git push
git tag v0.1.1 && git push origin v0.1.1
```

`.github/workflows/release.yml` runs on `macos-latest` (Apple Silicon), refuses to continue if the tag and `tauri.conf.json` version disagree, runs the checks, then hands off to `tauri-apps/tauri-action@v1`, which builds, signs, creates the release and uploads the updater JSON. A fresh checkout also removes the stale-payload trap in rule 5 — CI cannot reuse an artifact from a previous version.

Two repository secrets are required (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | the **contents** of `~/.tauri/expenses-updater.key` (`pbcopy < ~/.tauri/expenses-updater.key`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | empty — the key was generated without one |

⚠ **Verify the updater JSON's asset name on the first release.** The endpoint in `tauri.conf.json` ends in `/latest.json`; if `uploadUpdaterJson` names the asset something else, either rename the asset or change the endpoint to match. Nothing fails loudly — the check just finds nothing, forever.

Putting the private key in GitHub secrets means anyone who can push a workflow to this repo can sign an update every install will trust. For a single-user public repo that is the accepted trade for not signing releases by hand; if that changes, move releases to a manual local build.

### Cutting a release — by hand

```bash
# 1. bump the version in package.json AND src-tauri/tauri.conf.json
# 2. build and sign
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/expenses-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
pnpm build          # or: pnpm tauri build --bundles app,updater
```

Artifacts land in `apps/desktop/src-tauri/target/release/bundle/`:

| File | Purpose |
|---|---|
| `macos/Expenses.app` | the app itself |
| `macos/Expenses.app.tar.gz` | **the update payload** |
| `macos/Expenses.app.tar.gz.sig` | its signature, pasted into the manifest |
| `dmg/Expenses_<version>_aarch64.dmg` | first-time install |

Then publish a GitHub release whose assets are `Expenses.app.tar.gz` and a `latest.json`:

```json
{
  "version": "0.1.1",
  "notes": "What changed.",
  "pub_date": "2026-08-01T10:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<contents of the .sig file>", "url": "https://github.com/.../releases/download/v0.1.1/Expenses.app.tar.gz" }
  }
}
```

`TAURI_SIGNING_PRIVATE_KEY` must hold the **contents** of the key file, not its path — `TAURI_SIGNING_PRIVATE_KEY_PATH` is documented but this CLI (2.11.4) still errors with "a public key has been found, but no private key".

### Verifying it locally, without publishing

Point the endpoint at a local file server, build an older and a newer version, and watch the old one find the new one:

```bash
# endpoints -> ["http://127.0.0.1:8787/latest.json"], version 0.1.0
pnpm tauri build --bundles app,updater && cp -R …/bundle/macos/Expenses.app /Applications/
# bump to 0.1.1, rebuild, copy Expenses.app.tar.gz + a latest.json into a folder
(cd that-folder && python3 -m http.server 8787)
open -a /Applications/Expenses.app     # the banner should appear
```

The server log showing `GET /latest.json` is proof the check ran with the right config and permissions. Restore the real endpoint and version afterwards.

## macOS Gatekeeper

The app is **ad-hoc signed, not signed with an Apple Developer ID** (`bundle.macOS.signingIdentity: "-"`). That explicit identity is load-bearing: without it macOS treats an Apple Silicon build downloaded from a GitHub release as *damaged* and refuses to open it at all.

It does not remove Gatekeeper entirely. A **first install** from a downloaded `.dmg` still carries the quarantine attribute, so it needs right-click → Open once, or `xattr -dr com.apple.quarantine /Applications/Expenses.app`. The **update** path downloads over HTTP inside the app rather than through a browser, so nothing sets the quarantine attribute — ⚠ verified in principle, not yet observed end to end on a real release. Watch the first one.

Notarisation would remove both warnings and needs a paid Apple Developer account.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `a public key has been found, but no private key` | `TAURI_SIGNING_PRIVATE_KEY` unset, or set to a path | Export the file's *contents* |
| The update payload is the previous version | DMG bundling failed before the tarball was regenerated | Rule 5; extract the tarball and read its `Info.plist` |
| Banner never appears | Version in the manifest is not greater than the installed one, or the platform key does not match (`darwin-aarch64` vs `darwin-x86_64`) | Check both; the check itself is silent on failure by design |
| Update downloads then fails to install | Signature does not match the `pubkey` in the installed build | The install was built with a different keypair; reinstall by hand |
| Downloaded build reports "damaged" and will not open | `signingIdentity: "-"` missing from `bundle.macOS` | Restore it; see Gatekeeper above |
| CI release job fails immediately | Tag and `tauri.conf.json` version disagree | The guard step is doing its job — bump one or retag |
| Update installs but the app opens an empty ledger | `identifier` changed, so the data directory moved | Never change it — [[stack]] rule 7 |
