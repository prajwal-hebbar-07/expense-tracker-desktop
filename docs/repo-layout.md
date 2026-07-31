---
id: repo-layout
type: reference
status: active
updated: 2026-07-31
links: [stack, turborepo]
---

# Repository layout

A pnpm workspace monorepo, orchestrated by Turborepo, holding exactly one buildable app. The monorepo exists because the user asked for one and because a second surface (a CLI, an importer, a second app) is plausible — not because anything is shared today. Nothing lives in `packages/` yet, deliberately.

pnpm defines what a package is and installs it; turbo decides what runs. The two are not alternatives — see [[turborepo]].

## Rules for an agent working here

1. **Put new applications under `apps/<name>/`**, because the workspace glob is `apps/*` and a directory placed elsewhere is invisible to pnpm.
2. **Do not create `packages/shared` until a second consumer actually exists**, because a shared package with one consumer is indirection with no payoff. When it happens, extract the code that is already duplicated — do not predict what will be.
3. **Run everything from the repo root with `pnpm dev` / `pnpm build`**, which delegate to `turbo dev` / `turbo build`. Use `pnpm --filter desktop <script>` when you deliberately want one package and no orchestration — both are valid, and a filter is clearer for a one-off. The root `package.json` holds pass-through scripts only, never build logic.
4. **Add Rust crates under `apps/*/src-tauri/` or a future `crates/`**, and only introduce a root `Cargo.toml` workspace when a second crate exists — because a Cargo workspace over one crate just adds a file to keep in sync.
5. **Keep `pnpm-lock.yaml` at the repo root and commit it.** A lockfile inside `apps/desktop/` means someone ran pnpm without workspace context; delete it and re-install from the root.
6. **`turbo` is the only permitted root dependency**, installed with `pnpm add -Dw turbo`, because it is the root's own tooling rather than something an app imports. Every other dependency goes through `--filter` — see the anti-patterns below.
7. **Gitignore `.turbo/`** at the root and in each package. Turbo writes task logs and cache metadata there and they must not be committed.

## Contract

Current tree, as it exists on disk (scaffolded and wired 2026-07-31):

```
expense-tracker-desktop/
├── CLAUDE.md
├── README.md
├── .gitignore                   # node_modules, .turbo/, .DS_Store
├── pnpm-workspace.yaml          # apps/*, packages/*, allowBuilds.esbuild
├── package.json                 # root, private, scripts + turbo only
├── pnpm-lock.yaml               # committed; the only lockfile in the repo
├── turbo.json                   # see [[turborepo]]
├── .turbo/                      # gitignored, turbo task logs + cache metadata
├── docs/
│   ├── stack.md
│   ├── repo-layout.md
│   ├── persistence-sqlite.md
│   └── turborepo.md
└── apps/
    └── desktop/                 # name in package.json is "desktop"
        ├── package.json
        ├── .gitignore           # scaffold's, plus .turbo/
        ├── index.html
        ├── vite.config.ts       # react() + tailwindcss(), port 1420 strict
        ├── tsconfig.json        # target ES2020 — no top-level await
        ├── tsconfig.node.json
        ├── .vscode/
        ├── public/              # served at /, e.g. /vite.svg
        ├── src/                 # frontend — React + TS
        │   ├── main.tsx         # ReactDOM root + Database.load (runs migrations)
        │   ├── App.tsx          # still the scaffold demo page
        │   ├── App.css          # @import "tailwindcss" + disposable demo CSS
        │   ├── assets/
        │   └── vite-env.d.ts
        └── src-tauri/           # host — Rust
            ├── Cargo.toml       # crate "desktop", lib "desktop_lib"
            ├── Cargo.lock
            ├── build.rs
            ├── tauri.conf.json
            ├── icons/
            ├── capabilities/
            │   └── default.json # permissions allowlist for window "main"
            └── src/
                ├── main.rs      # calls desktop_lib::run()
                └── lib.rs       # tauri::Builder, migrations(), #[tauri::command]
```

`tsconfig.json` targets **ES2020**, so top-level `await` does not compile. Async work at module scope uses `.then()`/`.catch()` — see the `Database.load` call in `main.tsx`. Raising the target is a decision, not a drive-by fix.

`pnpm-workspace.yaml` also carries an `allowBuilds` block. pnpm 11 blocks dependency postinstall scripts unless allow-listed, and esbuild's script links its platform-native binary — without `esbuild: true` Vite cannot build.

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  esbuild: true
```

The `packages/*` glob is harmless while the directory does not exist, and saves editing this file later.

Root `package.json` holds `"private": true`, `"packageManager"`, pass-through scripts, and `turbo` as its single devDependency — never anything else, because a dependency at the root is invisible to the app that actually uses it. Exact contents are in [[turborepo]].

`turbo.json` is likewise specified in [[turborepo]]. Do not duplicate its task definitions here; one topic, one node.

### Where a given change goes

| Change | File |
|---|---|
| New UI screen or component | `apps/desktop/src/` |
| New backend behaviour, DB access, HTTP call | `apps/desktop/src-tauri/src/lib.rs` + `invoke_handler` registration |
| Window title, size, bundle identifier, build hooks | `apps/desktop/src-tauri/tauri.conf.json` |
| Granting a plugin capability to the window | `apps/desktop/src-tauri/capabilities/default.json` |
| Vite plugins, dev server, aliases | `apps/desktop/vite.config.ts` |
| A JS dependency | `pnpm --filter desktop add <pkg>` — never at the root |
| A new root-level task (`typecheck`, `lint`, `test`) | `turbo.json` `tasks` **and** a matching script in each package — see [[turborepo]] rule 4 |
| Which command `tauri dev` runs to start Vite | `apps/desktop/src-tauri/tauri.conf.json` → `beforeDevCommand` |

## Anti-patterns

- **A root `node_modules` dependency added with bare `pnpm add`.** It resolves at runtime by accident via hoisting and breaks the moment the app is built in isolation. `turbo` is the sole exception (rule 6).
- **Duplicating turbo's task config into the root `package.json` scripts.** Root scripts should be one-liners delegating to `turbo <task>`; the graph lives in `turbo.json`.
- **`apps/desktop/package.json` renamed without updating filters.** Every `--filter desktop` invocation silently matches nothing; pnpm exits 0, so this looks like success.
- **A second app copy-pasted from `apps/desktop`** including its `src-tauri/icons/` and identifier. Two bundles sharing `com.hebbar.desktop` fight over the same data directory.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `pnpm --filter desktop dev` prints "No projects matched the filters" | `pnpm-workspace.yaml` missing, or the app is not under `apps/` | Create the workspace file above; confirm with `pnpm ls -r --depth -1` |
| `turbo` finds no packages, or runs tasks in only some of them | Turbo reads workspaces from `pnpm-workspace.yaml`; a package outside `apps/*` is invisible to both tools | Move it under `apps/` or add its glob to the workspace file |
| Root `pnpm dev` does nothing | Root script still absent, or `turbo.json` has no `dev` task | See the [[turborepo]] contract; both the root script and the task are required |
| Dependency installs into the root `node_modules` instead of the app | `pnpm add` run from the repo root without `--filter` | Remove it from the root `package.json`, re-add with `--filter desktop` |
| Rust rebuilds from scratch every run | `target/` inside `src-tauri/` was deleted or is being cleaned by a script | Leave `src-tauri/target/` alone; it is gitignored by the scaffold |
