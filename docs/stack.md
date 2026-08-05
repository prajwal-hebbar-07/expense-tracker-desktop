---
id: stack
type: decision
status: active
updated: 2026-08-05
links: [repo-layout, persistence-sqlite, ollama-flow, turborepo, ollama-accounts, ollama-key-in-settings]
---

# Build stack

The app is a **Tauri v2** desktop bundle: a Rust host process owning a native macOS window, a WebView rendering a **React 19 + TypeScript + Vite 7** frontend, and **SQLite** on disk for storage. It installs as a `.app` and runs by double-clicking. There is no backend server, no daemon to start, and no network dependency for core expense tracking — the only outbound call is the AI feature described in [[ollama-flow]].

Chosen 2026-07-31, before any application code existed, and **scaffolded the same day**. `apps/desktop/` is `create-tauri-app` output with four deliberate changes: the dev/build scripts point at Tauri rather than Vite (see [[turborepo]]), Tailwind v4 is wired into `vite.config.ts`, `tauri-plugin-sql` is registered with migration 1, and `main.tsx` opens the database at start. The demo greeting page is untouched — no expense UI exists yet.

## Rules for an agent working here

1. **Never introduce a server process, port listener, or background daemon**, because the entire point of Tauri here was that the user refused a daily "start the server" step. A feature that seems to need a server needs a Rust command instead. This constrains the **shipped application**, not build tooling — Turborepo's build-time daemon is out of scope; see [[turborepo]].
2. **Business logic and all disk/network access go in Rust** (`apps/desktop/src-tauri/src/lib.rs`), exposed to the frontend with `#[tauri::command]` and called via `invoke("command_name", { arg })`. The WebView is a rendering layer. One deliberate exception: TypeScript reads the selected Ollama key from SQLite and passes it into the command — [[ollama-accounts]].
3. **Use `pnpm` for every Node operation**, never `npm` or `yarn` — the repo is a pnpm workspace and a stray `package-lock.json` corrupts resolution.
4. **Style with Tailwind utility classes only.** Do not add a component library (MUI, Chakra, shadcn) or a CSS-in-JS runtime; they were deliberately excluded to keep the bundle small and the dependency count near zero.
5. **Add a Rust crate before adding a JS dependency** when both could do the job, because Rust code ships compiled into the binary while JS ships into the WebView and inflates the frontend bundle.
6. **Use Turborepo as the only task orchestrator; do not add Nx, Lerna, Rush, or Changesets**, because a second orchestrator means two files disagreeing about the task graph. Its contract, and the `tauri dev` interaction it must not break, are in [[turborepo]].
7. **Keep `tauri.conf.json` `identifier` stable** (`com.hebbar.desktop`), because it determines the on-disk data directory. Changing it orphans the user's existing database.

## Contract

Versions as scaffolded (`apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`):

| Layer | Choice | Version |
|---|---|---|
| Shell | Tauri | `2` |
| Language (host) | Rust | edition `2021` |
| UI | React + `react-dom` | `^19.1.0` |
| Types | TypeScript | `~5.8.3` |
| Bundler | Vite | `^7.0.4` |
| Vite plugin | `@vitejs/plugin-react` | `^4.6.0` |
| Package manager | pnpm | `11.11.0` |
| Task orchestrator | Turborepo | `^2.10.7`, see [[turborepo]] |
| Node | node | `v24.18.0` |
| Rust toolchain | rustc | `1.97.1` |
| Storage | SQLite via `tauri-plugin-sql` | `2.4.0` (crate), `@tauri-apps/plugin-sql` `^2.4.0` (JS) |
| Styling | Tailwind CSS | `^4.3.3` (`tailwindcss` + `@tailwindcss/vite`) |

Fixed values already committed by the scaffold:

- Bundle identifier: `com.hebbar.desktop`
- Vite dev server: `http://localhost:1420`, `strictPort: true`
- Rust lib crate: `desktop_lib`, entry `desktop_lib::run()`
- Existing plugin: `tauri-plugin-opener` (permission `opener:default`)

### Tailwind installation contract

Executed 2026-07-31 and working. Tailwind v4 dropped `tailwind.config.js` and the PostCSS step in favour of a Vite plugin.

```
pnpm --filter desktop add -D tailwindcss @tailwindcss/vite
```

In `apps/desktop/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
// plugins: [react(), tailwindcss()]
```

In the global stylesheet (`apps/desktop/src/App.css`), which `App.tsx` imports. This **replaces** the scaffold's CSS — the file is now these five lines and nothing else:

```css
@import "tailwindcss";

@theme {
  --font-sans: Inter, Avenir, Helvetica, Arial, sans-serif;
}
```

The scaffold's 116 lines of demo CSS were deleted and the demo page restyled with utility classes in `App.tsx`. Keeping them would have violated rule 4, and not harmlessly: they included bare element selectors (`a`, `h1`, `input`, `button`) plus a `:root` block, so they styled every future screen, and their `@media (prefers-color-scheme: dark)` block competed with Tailwind's own `dark:` variant.

`@theme` is the sanctioned place for theme values in v4 — it defines `--font-sans`, which `.font-sans` then consumes. It is not an escape hatch for arbitrary rules.

There is **no** `tailwind.config.js` and **no** `content: []` array in v4 — do not create one. Theme customisation goes in an `@theme { }` block in the same CSS file.

## Anti-patterns

- **Calling `fetch()` from the WebView for anything authenticated.** All outbound HTTP goes through Rust. In review this looks like `await fetch("https://…")` inside a `.tsx` file — reject it and point at [[ollama-flow]].
- **Writing files with a hardcoded path** like `~/Documents/expenses.db`. Use Tauri's resolved app data directory; see [[persistence-sqlite]].
- **`npm install` / `npx`.** Leaves `package-lock.json` next to `pnpm-lock.yaml`. Delete the lockfile and re-run with pnpm.
- **Adding a `packages/shared` workspace with one consumer.** Nothing is shared yet; an empty shared package is the standard monorepo tax.
- **Reaching for Electron patterns** (`ipcRenderer`, `BrowserWindow`, a `main.js`). Tauri's equivalents are `invoke`, `WebviewWindow`, and `src-tauri/src/lib.rs`.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `pnpm tauri dev` fails with "Rust not found" / `cargo: command not found` | Rust missing from `PATH` (it **is** installed — `rustc 1.97.1` at `~/.cargo/bin`, verified 2026-07-31) | Source `~/.cargo/env` or reopen the shell; install via https://rustup.rs only if genuinely absent |
| `pnpm install` warns `ERR_PNPM_IGNORED_BUILDS: esbuild` | pnpm blocks postinstall scripts until allow-listed; esbuild's links its native binary | `allowBuilds.esbuild: true` in `pnpm-workspace.yaml` — already set; re-run `pnpm install` |
| Built `.app` shows "cannot be opened because the developer cannot be verified" | Bundle is unsigned; macOS Gatekeeper blocks first launch | Right-click → Open once for personal use. Distribution to others needs an Apple Developer cert + notarization |
| Vite exits immediately on `pnpm dev` | Port 1420 already bound and `strictPort: true` | `lsof -ti:1420 \| xargs kill -9`, then re-run. Do not change the port — `devUrl` in `tauri.conf.json` is pinned to 1420. If it keeps recurring, the cause is in [[turborepo]]'s failure table |
| Tailwind classes render as plain unstyled text | The `@tailwindcss/vite` plugin is missing from `vite.config.ts`, or the CSS file with `@import "tailwindcss";` is not imported by `main.tsx` | Check both; v4 needs no config file, so an absent `tailwind.config.js` is not the cause |
| App loses all data after a rebuild | `identifier` in `tauri.conf.json` changed, moving the data directory | Restore the original identifier |
