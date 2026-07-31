---
id: turborepo
type: decision
status: active
updated: 2026-07-31
links: [repo-layout, stack]
---

# Turborepo as task orchestrator

Turborepo runs every workspace script from the repo root. It sits **on top of** the pnpm workspace, it does not replace it — `pnpm-workspace.yaml` still defines what a package is, and pnpm still installs. Turbo only decides what runs, in what order, and what can be skipped because nothing it depends on changed.

Chosen 2026-07-31, before any application code existed, so that the wiring is in place before a second package needs it — retrofitting an orchestrator means touching `tauri.conf.json`, both `package.json` files, and the dev workflow at the moment a new package is being introduced, which is the worst time to do it.

**Turbo buys nothing measurable while `apps/desktop` is the only package**, and that is expected — do not defend it on speed, and do not remove it on those grounds either. Turbo's cache skips packages that did not change; with one package there is nothing to skip, and the slow half of this build is cargo, which turbo cannot cache at all. It starts paying when a second surface exists and `turbo typecheck` can skip what is untouched.

## Rules for an agent working here

1. **`apps/desktop`'s `dev` and `build` scripts must be the Tauri commands, not the Vite ones**, because `tauri dev` starts Vite itself through `beforeDevCommand`. If turbo also runs `vite`, two Vite servers race for port 1420 and `strictPort: true` kills one — see the failure table.
2. **Never give the `build` task an `outputs` array covering `src-tauri/target/`.** It is hundreds of megabytes and cargo already caches incrementally; turbo would tar and restore the whole tree on every run. `build` is `cache: false` for this reason.
3. **Install turbo at the root with `pnpm add -Dw turbo`.** This is the one sanctioned exception to [[repo-layout]] rule "never add a dependency at the root" — turbo is invoked as the root's own tooling, not by any app.
4. **A task only runs where a script of that name exists.** `turbo typecheck` silently does nothing if `apps/desktop/package.json` has no `typecheck` script — turbo exits 0. Add the script before adding the task.
5. **Mark long-running tasks `"persistent": true, "cache": false`.** Turbo refuses to let another task depend on a persistent one, which is correct: nothing can wait for a dev server that never exits.
6. **Keep using `pnpm --filter desktop <script>` when you want exactly one package.** Turbo is for the root entry points; a filter is shorter and clearer for one-off invocations, and both remain valid.
7. **Do not add Nx, Lerna, Rush, or Changesets on top of this.** One orchestrator is the whole point; a second one means two files disagreeing about the task graph.

## Contract

Install:

```
pnpm add -Dw turbo
```

⚠ Version not pinned here — check the installed major before relying on the shapes below. Turbo **2.0 renamed the `pipeline` key to `tasks`**; a config using `pipeline` fails on 2.x with a schema error. Everything below assumes 2.x.

`turbo.json` at the repo root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "cache": false },
    "typecheck": { "outputs": [] },
    "lint": { "outputs": [] }
  }
}
```

Root `package.json` scripts:

```json
{
  "private": true,
  "packageManager": "pnpm@11.11.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": { "turbo": "^2" }
}
```

`apps/desktop/package.json` scripts — note `dev`/`build` are the Tauri entry points and the Vite ones are renamed so turbo never invokes them directly:

```json
{
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "vite:dev": "vite",
    "vite:build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "tauri": "tauri"
  }
}
```

`apps/desktop/src-tauri/tauri.conf.json` — must be changed from the `create-tauri-app` defaults (`pnpm dev` / `pnpm build`), which would now recurse into `tauri dev`:

```json
"beforeDevCommand": "pnpm vite:dev",
"beforeBuildCommand": "pnpm vite:build"
```

### Resulting call chain

```
pnpm dev  (root)
  → turbo dev
    → desktop: tauri dev
      → beforeDevCommand: pnpm vite:dev   → Vite on :1420
      → cargo run                          → native window
```

Exactly one Vite process. No cycle.

### Relationship to [[stack]] rule 1

[[stack]] rule 1 forbids a server process or background daemon. That rule governs the **shipped application** — the thing the user double-clicks — and turbo's build-time daemon does not violate it. Turbo is a devDependency; it is not in the `.app` bundle and is not running when the app runs. Stop it with `turbo daemon stop` if it misbehaves.

### `.gitignore` addition

```
.turbo/
```

Present at the root and inside each package. Turbo writes per-task logs and cache metadata there.

## Anti-patterns

- **`"build": { "outputs": ["src-tauri/target/**"] }`.** Turbo will archive the entire Rust build tree. Builds get slower than having no cache at all, which is the exact opposite of why turbo was added.
- **A `dev` task without `"persistent": true`.** Turbo treats it as a task that should finish, and the run hangs looking complete while the dev server holds it open.
- **Leaving `beforeDevCommand` as `pnpm dev` after adding turbo.** `tauri dev` calls `pnpm dev`, which is now `tauri dev`. Infinite recursion; in review it looks like the scaffold default left untouched.
- **`turbo add <pkg>` or `pnpm add <pkg>` at the root for an app dependency.** Turbo does not change dependency placement — [[repo-layout]] still applies. Only turbo itself lives at the root.
- **Adding tasks speculatively** (`test`, `e2e`, `format`) with no matching scripts. They are no-ops that read as working infrastructure.
- **Reaching for `turbo run` in `tauri.conf.json` hooks.** The before-commands run inside the app's directory; pointing them back at the orchestrator inverts the graph.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `pnpm dev` starts Vite but no native window opens | The `dev` script in `apps/desktop/package.json` is still `vite`, not `tauri dev` | Apply the scripts contract above |
| Vite exits immediately, "Port 1420 is already in use" | Two Vite servers: turbo started one and `beforeDevCommand` started another | Ensure `dev` = `tauri dev` and `beforeDevCommand` = `pnpm vite:dev`. Do not change the port — [[stack]] pins it |
| `pnpm dev` recurses / spawns endlessly | `beforeDevCommand` left as `pnpm dev` while `dev` became `tauri dev` | Repoint it at `pnpm vite:dev` |
| `turbo typecheck` prints success instantly, checks nothing | No `typecheck` script in the app; turbo skips missing scripts and exits 0 | Add the script, then re-run. Verify with `turbo typecheck --dry=json` |
| `turbo: command not found` at the root | Installed with `--filter desktop` instead of `-Dw` | `pnpm add -Dw turbo` |
| Build restores from cache but the `.app` is stale or missing | `build` was made cacheable with outputs pointing into `src-tauri/target/` | Set `"build": { "cache": false }` — rule 2 |
| Schema error mentioning `pipeline` | `turbo.json` written for turbo 1.x | Rename the key to `tasks` (2.0+) |
| Tasks behave inconsistently between runs, stale results | Turbo daemon holding bad state | `turbo daemon stop`, re-run |
| Turbo reports a cache miss on every run | A non-deterministic file inside the task's inputs (a log, `.DS_Store`, a timestamped artifact) | Inspect with `turbo build --dry=json` and narrow `inputs` |
