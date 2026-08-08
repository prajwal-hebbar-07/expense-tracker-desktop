---
id: reset-db
type: reference
status: active
updated: 2026-08-08
links: [persistence-sqlite, repo-layout, db-reset-in-app]
---

# Resetting the database in development

`pnpm --filter desktop reset-db` deletes the SQLite file so the next launch re-runs every migration against an empty database. It exists because schema work needs a clean slate constantly — [[persistence-sqlite]] rule 2 makes migrations append-only, so the only way to see migration N run again is to start from no database at all.

It is a **development script, not the in-app feature**. Nothing in `src/` imports it and no `#[tauri::command]` exposes it. The Settings screen has its own reset — [[db-reset-in-app]] — which clears rows rather than deleting the file, because the running app holds the connection open. The two are not interchangeable: only this one resets the file itself, and only this one runs with the app shut down.

**Implemented and verified end-to-end 2026-08-08**: with 16 expenses, 4 accounts and 1 `ollama_account` row on disk, the script deleted the file; relaunching `/Applications/LedgerFlow.app` recreated it, `_sqlx_migrations` refilled, and every table read `0`. `sqlite_sequence` was empty too, so `AUTOINCREMENT` counters restart at 1.

## Rules for an agent working here

1. **Delete the file, never `DELETE FROM` a table list.** A hand-maintained list of tables silently stops being "everything" the day a migration adds one, and `DELETE` leaves `AUTOINCREMENT` counters where they were — so a "fresh" database hands out `id` 47 for its first row.
2. **Read `identifier` out of `tauri.conf.json`; never hardcode the path.** Same reason as [[persistence-sqlite]] rule 1 in reverse: a renamed bundle must make this script miss loudly, not delete a stale directory and report success.
3. **Delete `-wal` and `-shm` alongside the `.db`.** sqlx opens SQLite in WAL mode, so an orphaned write-ahead log replays committed rows into the fresh database and resurrects exactly the data the command was run to destroy.
4. **Quit the app first.** ⚠ Not directly tested: the reasoning is that a running app holds an open handle to the now-unlinked inode, so its writes go somewhere no longer reachable by name. Verify before relying on any other behaviour here.
5. **Keep the confirmation prompt.** This destroys real financial history with no undo; `-y` exists for when you mean it, which is not the same as making it the default.

## Contract

`apps/desktop/reset-db.mjs`, wired as the `reset-db` script in `apps/desktop/package.json`.

```
pnpm --filter desktop reset-db        # prompts: Permanently delete <path>? [y/N]
pnpm --filter desktop reset-db -y     # no prompt (--yes also works)
```

Deletes, in the app-config directory for the platform:

| File | Why |
|---|---|
| `expenses.db` | the database |
| `expenses.db-wal` | committed rows not yet checkpointed — rule 3 |
| `expenses.db-shm` | WAL shared-memory index, meaningless without the `-wal` |

Directory, resolved the same way `tauri-plugin-sql` resolves `sqlite:expenses.db`:

| Platform | Base | Full path |
|---|---|---|
| macOS | `~/Library/Application Support` | `~/Library/Application Support/com.hebbar.desktop/expenses.db` — confirmed on disk |
| Windows | `%APPDATA%` | `%APPDATA%\com.hebbar.desktop\expenses.db` — ⚠ resolution not run on Windows |
| Linux | `$XDG_CONFIG_HOME` or `~/.config` | `~/.config/com.hebbar.desktop/expenses.db` — ⚠ not run on Linux |

Exit codes: `0` on delete, on declining the prompt, and when there is no database to delete. Non-zero only on a real failure, because pnpm prints a recursive-run failure banner over any non-zero exit and "I said no" is the command working.

## Anti-patterns

- **Wiring this script into the app** by shelling out to it or reimplementing file deletion behind a `#[tauri::command]`. The running app holds the connection; deleting the file underneath it leaves it writing to an unlinked inode. The in-app path clears rows instead — [[db-reset-in-app]].
- **`DELETE FROM expense; DELETE FROM account; …`** as the reset *here*. See rule 1 — it is a list that rots and it does not reset sequences. The in-app reset cannot delete the file, so it clears rows, but it derives the table list from `sqlite_master` rather than writing one down.
- **`rm -rf` on the whole app-config directory.** It also holds `flex-state.db`, which this app did not create and does not own.
- **Running it against a machine holding data you cannot re-enter.** There is no backup step and no undo; the file is gone.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `Nothing to reset — no database at <path>` when data plainly exists | `identifier` in `tauri.conf.json` no longer matches the directory the data was written under | Compare against the directories actually present; the old data is still under the previous identifier |
| Reset reports success, old rows are back after launch | An orphaned `-wal` was left behind and replayed | Rule 3 — delete all three files; check none are held by a running app |
| App shows stale data after a reset | It was running during the delete and is still writing to the unlinked file | Quit and relaunch — rule 4 |
| `EPERM` / `EBUSY` on Windows | The app has the file open | Quit the app; Windows will not unlink an open file the way macOS and Linux do |
