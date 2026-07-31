---
id: repo-layout
type: reference
status: active
updated: 2026-07-31
links: [stack]
---

# Repository layout

A pnpm workspace monorepo holding exactly one buildable app. The monorepo exists because the user asked for one and because a second surface (a CLI, an importer, a second app) is plausible — not because anything is shared today. Nothing lives in `packages/` yet, deliberately.

## Rules for an agent working here

1. **Put new applications under `apps/<name>/`**, because the workspace glob is `apps/*` and a directory placed elsewhere is invisible to pnpm.
2. **Do not create `packages/shared` until a second consumer actually exists**, because a shared package with one consumer is indirection with no payoff. When it happens, extract the code that is already duplicated — do not predict what will be.
3. **Run app scripts with `pnpm --filter desktop <script>`** from the repo root, or `cd apps/desktop` first. A bare `pnpm dev` at the root does nothing; the root `package.json` holds no build logic.
4. **Add Rust crates under `apps/*/src-tauri/` or a future `crates/`**, and only introduce a root `Cargo.toml` workspace when a second crate exists — because a Cargo workspace over one crate just adds a file to keep in sync.
5. **Keep `pnpm-lock.yaml` at the repo root and commit it.** A lockfile inside `apps/desktop/` means someone ran pnpm without workspace context; delete it and re-install from the root.

## Contract

Current tree (scaffolded 2026-07-31; ⚠ the two root files are **decided but not yet written**):

```
expense-tracker-desktop/
├── CLAUDE.md
├── README.md
├── pnpm-workspace.yaml          ⚠ not created yet
├── package.json                 ⚠ not created yet — root, private, scripts only
├── docs/
│   ├── stack.md
│   ├── repo-layout.md
│   └── persistence-sqlite.md
└── apps/
    └── desktop/                 # name in package.json is "desktop"
        ├── package.json
        ├── index.html
        ├── vite.config.ts
        ├── tsconfig.json
        ├── tsconfig.node.json
        ├── public/              # served at /, e.g. /vite.svg
        ├── src/                 # frontend — React + TS
        │   ├── main.tsx         # ReactDOM root, mounts #root
        │   ├── App.tsx
        │   ├── App.css          # becomes the Tailwind entry
        │   ├── assets/
        │   └── vite-env.d.ts
        └── src-tauri/           # host — Rust
            ├── Cargo.toml       # crate "desktop", lib "desktop_lib"
            ├── build.rs
            ├── tauri.conf.json
            ├── icons/
            ├── capabilities/
            │   └── default.json # permissions allowlist for window "main"
            └── src/
                ├── main.rs      # calls desktop_lib::run()
                └── lib.rs       # tauri::Builder, #[tauri::command] handlers
```

`pnpm-workspace.yaml` (⚠ to be created):

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

The `packages/*` glob is harmless while the directory does not exist, and saves editing this file later.

Root `package.json` (⚠ to be created) holds `"private": true`, `"packageManager"`, and pass-through scripts only — never dependencies, because a dependency at the root is invisible to the app that actually uses it.

### Where a given change goes

| Change | File |
|---|---|
| New UI screen or component | `apps/desktop/src/` |
| New backend behaviour, DB access, HTTP call | `apps/desktop/src-tauri/src/lib.rs` + `invoke_handler` registration |
| Window title, size, bundle identifier, build hooks | `apps/desktop/src-tauri/tauri.conf.json` |
| Granting a plugin capability to the window | `apps/desktop/src-tauri/capabilities/default.json` |
| Vite plugins, dev server, aliases | `apps/desktop/vite.config.ts` |
| A JS dependency | `pnpm --filter desktop add <pkg>` — never at the root |

## Anti-patterns

- **A root `node_modules` dependency added with bare `pnpm add`.** It resolves at runtime by accident via hoisting and breaks the moment the app is built in isolation.
- **`apps/desktop/package.json` renamed without updating filters.** Every `--filter desktop` invocation silently matches nothing; pnpm exits 0, so this looks like success.
- **A second app copy-pasted from `apps/desktop`** including its `src-tauri/icons/` and identifier. Two bundles sharing `com.hebbar.desktop` fight over the same data directory.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `pnpm --filter desktop dev` prints "No projects matched the filters" | `pnpm-workspace.yaml` missing, or the app is not under `apps/` | Create the workspace file above; confirm with `pnpm ls -r --depth -1` |
| Dependency installs into the root `node_modules` instead of the app | `pnpm add` run from the repo root without `--filter` | Remove it from the root `package.json`, re-add with `--filter desktop` |
| Rust rebuilds from scratch every run | `target/` inside `src-tauri/` was deleted or is being cleaned by a script | Leave `src-tauri/target/` alone; it is gitignored by the scaffold |
