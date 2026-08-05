---
id: windows-release
type: decision
status: active
updated: 2026-08-05
links: [auto-update, linux-release, stack]
---

# Shipping to Windows

A third job in the `release` workflow, on `windows-latest`, adds two files to the release the other two jobs already created: `LedgerFlow_<version>_x64-setup.exe` and its `.sig`. A Windows user downloads the `.exe`, runs it, and updates arrive by themselves from then on.

**The download and the update payload are the same file.** With `createUpdaterArtifacts: true` ([[auto-update]]), Tauri v2 signs the NSIS installer directly, so there is no separate archive to keep in step — unlike macOS, where the `.dmg` installs and a `.app.tar.gz` updates. ⚠ The `-setup.nsis.zip` shape described in the Tauri docs belongs to `"v1Compatible"`; this repo is not on it, and a hand-written manifest pointing at a `.zip` resolves to nothing.

## Rules for an agent working here

1. **`needs: [release, linux]`, not a matrix entry.** Both entries are load-bearing: `release` is where `outputs.version` comes from, and `linux` is what keeps this job from racing it. All three jobs upload `latest.json` to the same release, and `tauri-action` merges into whatever is already there — running in parallel means one platform key silently overwrites another. Same reasoning as [[linux-release]] rule 1; adding a fourth platform makes it a fourth link in the chain, not a second branch.
2. **`--bundles nsis` only.** `msi` builds a second installer that does the same job and a second updater artifact competing for the same `windows-x86_64` key. NSIS is also the one Tauri's updater can run unattended without `msiexec` and admin rights.
3. **Nothing gets installed on the runner.** WebView2 is preinstalled on the image and present on every supported Windows, and the Tauri CLI downloads NSIS itself. There is no Windows equivalent of [[linux-release]]'s `apt-get` step — if a build fails, the cause is not a missing system package.
4. **The job checks out the *tag*.** Same reason as [[linux-release]] rule 2: the branch may have moved since the bump commit.
5. **Never run the tests again here.** They passed on the macOS job for this exact commit.
6. **Same `TAURI_SIGNING_PRIVATE_KEY` as the other two jobs.** One keypair, one `pubkey` in `tauri.conf.json`, every platform — [[auto-update]] rules 3 and 4.
7. **Do not add a Windows branch to `update.ts`.** On Windows the plugin launches the installer with `/P /R` (passive, restart) and then calls `std::process::exit(0)` itself, so the `await relaunch()` after `downloadAndInstall` is simply never reached and the NSIS installer brings the app back up. On macOS and Linux that same line is what swaps the binary in. One code path, correct on all three — `tauri-plugin-updater-2.10.1/src/updater.rs:865`.

## Contract

`.github/workflows/release.yml`, job `windows`:

```yaml
needs: [release, linux]   # release for outputs.version, linux to serialise latest.json
runs-on: windows-latest
# checkout with: ref: v${{ needs.release.outputs.version }}
# no system dependencies
# tauri-action args: --bundles nsis
```

The `x64` in the filename is the host target of the runner (`x86_64-pc-windows-msvc`); no `--target` is passed. ARM64 Windows runs it under emulation. A native `aarch64-pc-windows-msvc` build would be a second matrix entry and a second platform key, and nothing so far asks for one.

Artifacts, in `apps/desktop/src-tauri/target/release/bundle/nsis/`:

| File | Purpose |
|---|---|
| `LedgerFlow_<version>_x64-setup.exe` | first-time install **and** the update payload |
| `LedgerFlow_<version>_x64-setup.exe.sig` | its signature, read into `latest.json` |

⚠ **Verify the platform key in `latest.json` after the first Windows release.** The updater looks for `windows-x86_64-nsis` first and `windows-x86_64` second, so either name works, but a missing key fails silently by design ([[auto-update]] rule 7).

The installer needs `icons/icon.ico` to be a real multi-size icon — the current one carries 16/24/32/48/64/256. A single-size or PNG-renamed `.ico` fails inside the NSIS step, after a full Rust release build.

The database lands in `%APPDATA%\com.hebbar.desktop\expenses.db` — `app_config_dir()` on Windows is Roaming AppData, which is where `tauri-plugin-sql` puts a `sqlite:` URL. Per-user, outside the install directory, so an update or an uninstall never reaches it and [[auto-update]]'s "updates never touch the database" holds.

## What to tell someone installing it

Download the `.exe`, run it, click through. It installs per-user, so no admin prompt.

⚠ **SmartScreen will warn.** The installer is not signed with a code-signing certificate, so the first run shows *"Windows protected your PC"* — **More info → Run anyway**. This is the Windows counterpart of the Gatekeeper right-click in [[auto-update]], and the fix is the same shape: a paid certificate (OV/EV, renewed yearly), which nothing here justifies yet. ⚠ Expected from how unsigned installers behave, not yet observed on a real release — watch the first one.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `latest.json` is missing `windows-x86_64` after a release | The `windows` job failed, or ran in parallel with another and lost the merge | Check the job log; confirm `needs: [release, linux]` (rule 1) |
| Update banner never appears on Windows, works on macOS | Platform key or asset name mismatch in the manifest | Read `latest.json` on the release; expected key `windows-x86_64` |
| Update downloads, then nothing visible happens | Passive install mode only shows a progress bar; the app is expected to disappear and come back | Not a failure — rule 7 |
| Build fails in the NSIS step after the Rust build succeeded | Bad `icon.ico`, or the CLI could not download NSIS | Check the icon has multiple sizes; re-run for a transient download |
| The `.exe` is on the release but no `.sig` | `createUpdaterArtifacts` is off, or the signing secret is missing | [[auto-update]] rules 3 and 4 |
